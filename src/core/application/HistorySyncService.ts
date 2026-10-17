import type { Clock } from '../contracts/Clock'
import type { RideDataSource } from '../contracts/RideDataSource'
import type { FailedMonth, RideRepository, VehicleSyncState } from '../contracts/RideRepository'
import { addMonths, compareMonth, enumerateMonths, formatDate, formatMonth, isMonthFinished } from '../domain/datetime'
import type { MonthKey, VehicleRef } from '../domain/identifiers'
import { createIssue } from '../domain/issues'
import { createLogger, silentLogger, type Logger } from '../shared/logger'
import { AppError } from './errors'
import { MonthReportLoader, type MonthFetchProgress } from './MonthReportLoader'
import { errorResult, okResult, partialResult, type DataResult, type ResultMeta } from './results'

/**
 * 历史月报同步用例。
 *
 * 设计要点：
 * - **不假设官方支持"查询全部历史"**。可查询范围由月报返回的 `firstBindDate` 推断，
 *   推断不出来时退回"最近 N 个月"并明确标记为假设（见 `RangeEvidence`）。
 * - 每个月的同步都是独立的：失败只记录到 `failedMonths`，
 *   已成功缓存的有效数据一律保留，不因为一次失败而被清掉或改写。
 * - 补齐缺失月份时只需要按月逐个请求，因此可以给出稳定的进度与失败清单。
 */

export type SyncMode = 'missing' | 'all' | 'retry-failed'

export type RangeEvidence =
  /** 由官方 `firstBindDate` 推断。 */
  | 'firstBindDate'
  /** 由本地已缓存月份推断。 */
  | 'local-cache'
  /** 官方未给出范围信息，按最近 N 个月假设。 */
  | 'fallback-assumption'

export interface QueryableRange {
  readonly from: MonthKey
  readonly to: MonthKey
  readonly evidence: RangeEvidence
  readonly note: string
}

export type SyncReason = 'missing' | 'refetch' | 'retry-failed'

export interface SyncPlanEntry {
  readonly month: MonthKey
  readonly reason: SyncReason
}

export interface SyncProgress {
  readonly total: number
  readonly completed: number
  readonly currentMonth: MonthKey | null
  readonly ok: boolean
  readonly message?: string
}

export interface SyncRunResult {
  readonly succeeded: readonly MonthKey[]
  readonly failed: readonly FailedMonth[]
  readonly skipped: readonly MonthKey[]
  readonly cancelled: boolean
}

export interface SyncRunOptions {
  readonly mode?: SyncMode
  readonly from?: MonthKey
  readonly to?: MonthKey
  /** 单次运行的请求上限，默认 60。 */
  readonly maxMonths?: number
  readonly onProgress?: (progress: SyncProgress) => void
  /** 返回 true 时停止后续同步（已完成的月份保留）。 */
  readonly shouldCancel?: () => boolean
}

export interface HistorySyncServiceDeps {
  readonly dataSource: RideDataSource
  readonly repository: RideRepository
  readonly clock: Clock
  readonly logger?: Logger
  /** 无法推断范围时回退的月份数。 */
  readonly fallbackLookbackMonths?: number
}

export const DEFAULT_FALLBACK_LOOKBACK_MONTHS = 24
export const DEFAULT_MAX_MONTHS_PER_RUN = 60

export class HistorySyncService {
  private readonly deps: HistorySyncServiceDeps
  private readonly logger: Logger

  constructor(deps: HistorySyncServiceDeps) {
    this.deps = deps
    this.logger = deps.logger ?? silentLogger
  }

  getSyncState(vehicleId: string): VehicleSyncState | null {
    return this.deps.repository.loadSyncState(vehicleId)
  }

  /** 本地已有月份（含"服务端确认无数据"的月份）。 */
  listLocalMonths(vehicleId: string): MonthKey[] {
    const cached = this.deps.repository.listCachedMonths(vehicleId)
    const state = this.deps.repository.loadSyncState(vehicleId)
    const merged = new Set<MonthKey>([...cached, ...(state?.emptyMonths ?? [])])
    return [...merged].sort(compareMonth)
  }

  listMissingMonths(ref: VehicleRef, range: QueryableRange): MonthKey[] {
    const local = new Set(this.listLocalMonths(ref.vehicleId))
    return enumerateMonths(range.from, range.to).filter((month) => !local.has(month))
  }

  /**
   * 推断可查询范围。
   *
   * api.yaml 没有说明月报接口能回溯多久，因此结论必须来自运行时的 `firstBindDate`，
   * 只有在拿不到时才会退回"最近 N 个月"的假设值并如实标记。
   */
  async resolveQueryableRange(
    ref: VehicleRef,
    options: { probe?: boolean } = {},
  ): Promise<QueryableRange> {
    const to = formatMonth(this.deps.clock.now())
    // 车辆绑定月份是硬下界：早于它的月份不发起任何请求
    const bindMonth = ref.bindMonth ?? null
    const state = this.deps.repository.loadSyncState(ref.vehicleId)
    if (state?.earliestMonth) {
      return {
        from: clampFrom(state.earliestMonth, bindMonth),
        to,
        evidence: 'firstBindDate',
        note: '最早月份来自官方月报的 firstBindDate',
      }
    }

    const cached = this.listLocalMonths(ref.vehicleId).filter((month) => compareMonth(month, to) <= 0)
    if (cached.length > 0 && !options.probe) {
      const earliest = cached[0]
      if (earliest) {
        return { from: clampFrom(earliest, bindMonth), to, evidence: 'local-cache', note: '最早月份来自本地已同步月份' }
      }
    }

    if (options.probe !== false) {
      const loader = this.loaderFor(ref)
      const probeMonth = cached[cached.length - 1] ?? to
      const probe = await loader.loadOneMonth(ref, probeMonth, { force: false })
      const firstBind = probe.report?.firstBindMonth ?? null
      if (firstBind) {
        const start = clampFrom(firstBind, bindMonth)
        return {
          from: compareMonth(start, to) <= 0 ? start : to,
          to,
          evidence: 'firstBindDate',
          note: '最早月份来自官方月报的 firstBindDate',
        }
      }
    }

    const lookback = this.deps.fallbackLookbackMonths ?? DEFAULT_FALLBACK_LOOKBACK_MONTHS
    const fallbackFrom = addMonths(to, -(lookback - 1))
    return {
      from: clampFrom(fallbackFrom, bindMonth),
      to,
      evidence: 'fallback-assumption',
      note: `官方未返回 firstBindDate，按最近 ${lookback} 个月假设；该范围未经验证`,
    }
  }

  /** 生成同步计划，不发起请求。 */
  planSync(ref: VehicleRef, range: QueryableRange, options: SyncRunOptions = {}): SyncPlanEntry[] {
    const mode = options.mode ?? 'missing'
    const window = this.clampRange(ref, range, options.from, options.to)
    const months = enumerateMonths(window.from, window.to)
    const state = this.deps.repository.loadSyncState(ref.vehicleId)
    const local = new Set(this.listLocalMonths(ref.vehicleId))
    const failed = new Set((state?.failedMonths ?? []).map((item) => item.month))
    const entries: SyncPlanEntry[] = []

    for (const month of months) {
      if (mode === 'all') {
        entries.push({ month, reason: 'refetch' })
        continue
      }
      if (mode === 'retry-failed') {
        if (failed.has(month)) entries.push({ month, reason: 'retry-failed' })
        continue
      }
      if (!local.has(month)) entries.push({ month, reason: 'missing' })
    }

    // 最近的月份优先同步。
    return entries.sort((a, b) => compareMonth(b.month, a.month))
  }

  async sync(
    ref: VehicleRef,
    options: SyncRunOptions = {},
  ): Promise<DataResult<SyncRunResult>> {
    const maxMonths = options.maxMonths ?? DEFAULT_MAX_MONTHS_PER_RUN
    const range =
      options.from && options.to
        ? {
            from: options.from,
            to: options.to,
            evidence: 'local-cache' as RangeEvidence,
            note: '调用方指定的区间',
          }
        : await this.resolveQueryableRange(ref)

    const plan = this.planSync(ref, range, options).slice(0, maxMonths)
    if (plan.length === 0) {
      const meta: Partial<ResultMeta> = {
        issues: [
          createIssue('PARTIAL_DATA', '没有需要同步的月份', { path: 'months', value: range }),
        ],
      }
      if (range.evidence === 'fallback-assumption') {
        return partialResult({ succeeded: [], failed: [], skipped: [], cancelled: false }, meta)
      }
      return okResult({ succeeded: [], failed: [], skipped: [], cancelled: false }, meta)
    }

    const loader = this.loaderFor(ref)
    const succeeded: MonthKey[] = []
    const failed: FailedMonth[] = []
    const skipped: MonthKey[] = []
    let cancelled = false

    for (const [index, entry] of plan.entries()) {
      if (options.shouldCancel?.()) {
        cancelled = true
        skipped.push(...plan.slice(index).map((item) => item.month))
        break
      }
      options.onProgress?.({
        total: plan.length,
        completed: index,
        currentMonth: entry.month,
        ok: true,
      })
      const outcome = await loader.loadOneMonth(ref, entry.month, { force: true })
      if (outcome.failure) {
        failed.push(outcome.failure)
        options.onProgress?.({
          total: plan.length,
          completed: index + 1,
          currentMonth: entry.month,
          ok: false,
          message: outcome.failure.message,
        })
        this.logger.warn('月份同步失败', { month: entry.month, code: outcome.failure.code })
      } else {
        succeeded.push(entry.month)
        // 有了 firstBindDate 就更新可查询范围，后续运行无需再次探测。
        const firstBind = outcome.report?.firstBindMonth
        if (firstBind) {
          const state = this.deps.repository.loadSyncState(ref.vehicleId)
          if (state && (state.earliestMonth === null || compareMonth(firstBind, state.earliestMonth) < 0)) {
            this.deps.repository.saveSyncState({ ...state, earliestMonth: firstBind })
          }
        }
        options.onProgress?.({
          total: plan.length,
          completed: index + 1,
          currentMonth: entry.month,
          ok: true,
        })
      }
    }

    const result: SyncRunResult = { succeeded, failed, skipped, cancelled }
    const meta: Partial<ResultMeta> = {
      fetchedMonths: succeeded,
      failedMonths: failed,
      issues: [
        ...plan
          .filter((entry) => failed.some((item) => item.month === entry.month))
          .map((entry) =>
            createIssue('PARTIAL_DATA', `${entry.month} 同步失败，已保留原有缓存`, {
              path: 'months',
              value: entry.month,
            }),
          ),
        ...(cancelled
          ? [createIssue('PARTIAL_DATA', `同步被中断，剩余 ${skipped.length} 个月未处理`, { path: 'months' })]
          : []),
      ],
    }

    if (failed.length > 0) return partialResult(result, meta)
    return okResult(result, meta)
  }

  /** 同步单个指定月份。失败时抛出错误，且不会改动已有缓存。 */
  async syncMonth(
    ref: VehicleRef,
    month: MonthKey,
    options: { force?: boolean } = {},
  ): Promise<DataResult<{ month: MonthKey; hadData: boolean }>> {
    const currentMonth = formatMonth(this.deps.clock.now())
    if (compareMonth(month, currentMonth) > 0) {
      return errorResult(
        new AppError(`${month} 是未来月份，官方接口不会有数据`, { code: 'INVALID_INPUT' }),
      )
    }
    const outcome = await this.loaderFor(ref).loadOneMonth(ref, month, { force: options.force ?? true })
    if (outcome.failure) {
      const hasCache = this.deps.repository.loadMonthReport({ vehicleId: ref.vehicleId, month }) !== null
      return errorResult(
        new AppError(`${month} 同步失败：${outcome.failure.message}`, {
          code: 'NETWORK',
          retriable: true,
          details: { month, keptCache: hasCache },
          hint: hasCache ? '已保留原有缓存数据' : undefined,
        }),
        { failedMonths: [outcome.failure], issues: outcome.issues },
      )
    }
    return okResult(
      { month, hadData: (outcome.report?.days.length ?? 0) > 0 },
      { fromCache: outcome.fromCache, cachedAt: outcome.report?.fetchedAt ?? null, issues: outcome.issues },
    )
  }

  /** 进度回调的最小封装，便于 store 直接使用。 */
  static progressPercent(progress: SyncProgress): number {
    if (progress.total <= 0) return 0
    return Math.round((progress.completed / progress.total) * 100)
  }

  isMonthSynced(ref: VehicleRef, month: MonthKey): boolean {
    return this.listLocalMonths(ref.vehicleId).includes(month)
  }

  isMonthFresh(ref: VehicleRef, month: MonthKey): boolean {
    if (!isMonthFinished(month, formatDate(this.deps.clock.now()))) return false
    return this.isMonthSynced(ref, month)
  }

  private loaderFor(ref: VehicleRef): MonthReportLoader {
    return new MonthReportLoader({
      dataSource: this.deps.dataSource,
      repository: this.deps.repository,
      clock: this.deps.clock,
      logger: this.logger.child('months'),
      vehicleId: ref.vehicleId,
      deviceId: ref.deviceId,
    })
  }

  private clampRange(
    ref: VehicleRef,
    range: QueryableRange,
    from?: MonthKey,
    to?: MonthKey,
  ): { from: MonthKey; to: MonthKey } {
    const bindMonth = ref.bindMonth ?? null
    const base = from && compareMonth(from, range.from) > 0 ? from : range.from
    const start = clampFrom(base, bindMonth)
    const end = to && compareMonth(to, range.to) < 0 ? to : range.to
    return { from: start, to: end }
  }
}

/** 取两个月份中较晚的一个（null 表示不限制）。 */
function clampFrom(month: MonthKey, floor: MonthKey | null): MonthKey {
  if (floor === null) return month
  return compareMonth(month, floor) < 0 ? floor : month
}

export function createHistorySyncService(deps: HistorySyncServiceDeps): HistorySyncService {
  return new HistorySyncService({ ...deps, logger: deps.logger ?? createLogger({ scope: 'sync' }) })
}

export type { MonthFetchProgress }
