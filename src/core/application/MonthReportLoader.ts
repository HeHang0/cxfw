import type { Clock } from '../contracts/Clock'
import type { RideDataSource } from '../contracts/RideDataSource'
import type { FailedMonth, RideRepository, VehicleSyncState } from '../contracts/RideRepository'
import { compareMonth, formatDate, formatMonth, isMonthFinished } from '../domain/datetime'
import type { MonthKey, VehicleRef } from '../domain/identifiers'
import { createIssue, type DataIssue } from '../domain/issues'
import type { MonthRideReport } from '../domain/models'
import { createLogger, silentLogger, type Logger } from '../shared/logger'
import { toAppError } from './errors'
import { isEmptyMonth, withFailedMonth, withSyncedMonth } from './syncState'

/**
 * 月报加载器：所有"读取月报"的用例共用它，保证缓存策略一致。
 *
 * 缓存策略：
 * - 已结束的月份视为不可变，命中缓存就不重复请求。
 * - 当前未结束的月份数据会继续增长，因此设置 TTL（默认 30 分钟）后过期重取。
 * - 未来月份不请求。
 * - 请求失败时保留原有缓存，只记录失败月份。
 */

export interface MonthFetchProgress {
  readonly month: MonthKey
  readonly index: number
  readonly total: number
  readonly ok: boolean
  readonly message?: string
}

export interface LoadMonthsOptions {
  readonly force?: boolean
  /** 单次调用的网络请求上限，避免打开年报时触发上百次请求。 */
  readonly maxFetches?: number
  readonly onProgress?: (progress: MonthFetchProgress) => void
  readonly currentMonthTtlMs?: number
}

export interface LoadMonthsOutcome {
  readonly months: Map<MonthKey, MonthRideReport | null>
  readonly fetched: MonthKey[]
  readonly skipped: MonthKey[]
  readonly failedMonths: FailedMonth[]
  readonly issues: DataIssue[]
}

export interface MonthReportLoaderDeps {
  readonly dataSource: RideDataSource
  readonly repository: RideRepository
  readonly clock: Clock
  readonly logger?: Logger
  readonly vehicleId: string
  readonly deviceId: string | null
}

export const DEFAULT_CURRENT_MONTH_TTL_MS = 30 * 60 * 1000
export const DEFAULT_MAX_FETCHES = 24

export class MonthReportLoader {
  private readonly deps: MonthReportLoaderDeps
  private readonly logger: Logger

  constructor(deps: MonthReportLoaderDeps) {
    this.deps = deps
    this.logger = deps.logger ?? silentLogger
  }

  getSyncState(): VehicleSyncState {
    return (
      this.deps.repository.loadSyncState(this.deps.vehicleId) ?? {
        vehicleId: this.deps.vehicleId,
        deviceId: this.deps.deviceId,
        lastSyncedAt: null,
        syncedMonths: [],
        emptyMonths: [],
        failedMonths: [],
        earliestMonth: null,
      }
    )
  }

  /** 已结束月份的缓存永久有效；当前月份按 TTL 判断。 */
  isFresh(report: MonthRideReport, month: MonthKey, ttlMs: number): boolean {
    if (isMonthFinished(month, formatDate(this.deps.clock.now()))) return true
    const fetchedAt = Date.parse(report.fetchedAt)
    if (Number.isNaN(fetchedAt)) return false
    return this.deps.clock.now().getTime() - fetchedAt < ttlMs
  }

  async loadMonths(
    ref: VehicleRef,
    months: readonly MonthKey[],
    options: LoadMonthsOptions = {},
  ): Promise<LoadMonthsOutcome> {
    const ttl = options.currentMonthTtlMs ?? DEFAULT_CURRENT_MONTH_TTL_MS
    const maxFetches = options.maxFetches ?? DEFAULT_MAX_FETCHES
    const currentMonth = formatMonth(this.deps.clock.now())

    const result = new Map<MonthKey, MonthRideReport | null>()
    const fetched: MonthKey[] = []
    const skipped: MonthKey[] = []
    const failedMonths: FailedMonth[] = []
    const issues: DataIssue[] = []
    let fetchBudget = maxFetches

    /**
     * 车辆绑定月份之前不可能有该车的骑行数据（车辆简表的 bindDate），
     * 这些月份既不请求，也不写入结果（写入 null 会被当成"已知无数据"）。
     */
    const bindMonth = ref.bindMonth ?? null

    // 从最近的月份开始拉取：用户更关心当前数据，且 firstBindDate 很快就能拿到。
    const ordered = uniqueSortedDesc(months)

    for (const [index, month] of ordered.entries()) {
      if (bindMonth !== null && compareMonth(month, bindMonth) < 0) {
        skipped.push(month)
        continue
      }
      if (compareMonth(month, currentMonth) > 0) {
        skipped.push(month)
        result.set(month, null)
        continue
      }

      const cached = this.deps.repository.loadMonthReport({ vehicleId: ref.vehicleId, month })
      if (cached !== null && !options.force && this.isFresh(cached, month, ttl)) {
        result.set(month, cached)
        skipped.push(month)
        continue
      }

      if (!options.force && cached === null && isEmptyMonth(this.getSyncState(), month)) {
        result.set(month, null)
        skipped.push(month)
        continue
      }

      if (fetchBudget <= 0) {
        skipped.push(month)
        result.set(month, cached)
        issues.push(
          createIssue('PARTIAL_DATA', `达到单次请求上限（${maxFetches} 个月），${month} 未刷新`, {
            path: 'months',
            value: month,
          }),
        )
        continue
      }
      fetchBudget -= 1

      try {
        const report = await this.deps.dataSource.getMonthReport(ref, month)
        this.deps.repository.saveMonthReport(report)
        this.deps.repository.saveSyncState(withSyncedMonth(this.getSyncState(), month, report, report.fetchedAt))
        result.set(month, report)
        fetched.push(month)
        options.onProgress?.({ month, index, total: ordered.length, ok: true })
      } catch (error) {
        const appError = toAppError(error)
        const at = this.deps.clock.now().toISOString()
        this.deps.repository.saveSyncState(withFailedMonth(this.getSyncState(), month, appError, at))
        failedMonths.push({ month, code: appError.code, message: appError.message, at })
        issues.push(
          createIssue('PARTIAL_DATA', `${month} 拉取失败：${appError.message}`, { path: 'months', value: month }),
        )
        // 失败时保留已有缓存（可能是 null，表示"未知"）。
        result.set(month, cached)
        this.logger.warn('月报拉取失败', { month, code: appError.code, message: appError.message })
        options.onProgress?.({ month, index, total: ordered.length, ok: false, message: appError.message })
      }
    }

    return { months: result, fetched, skipped, failedMonths, issues }
  }

  async loadOneMonth(
    ref: VehicleRef,
    month: MonthKey,
    options: { force?: boolean; currentMonthTtlMs?: number } = {},
  ): Promise<{
    report: MonthRideReport | null
    fromCache: boolean
    failure: FailedMonth | null
    issues: DataIssue[]
  }> {
    const outcome = await this.loadMonths(ref, [month], {
      force: options.force,
      maxFetches: 1,
      ...(options.currentMonthTtlMs === undefined ? {} : { currentMonthTtlMs: options.currentMonthTtlMs }),
    })
    return {
      report: outcome.months.get(month) ?? null,
      fromCache: outcome.fetched.length === 0,
      failure: outcome.failedMonths[0] ?? null,
      issues: outcome.issues,
    }
  }
}

export function createMonthReportLoader(deps: MonthReportLoaderDeps): MonthReportLoader {
  return new MonthReportLoader({ ...deps, logger: deps.logger ?? createLogger({ scope: 'months' }) })
}

function uniqueSortedDesc(months: readonly MonthKey[]): MonthKey[] {
  return [...new Set(months)].sort((a, b) => compareMonth(b, a))
}
