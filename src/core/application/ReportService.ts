import type { Clock } from '../contracts/Clock'
import type { RideDataSource } from '../contracts/RideDataSource'
import type { FailedMonth, RideRepository } from '../contracts/RideRepository'
import { addMonths, compareMonth, formatDate, formatMonth } from '../domain/datetime'
import type { DateKey, MonthKey, VehicleRef } from '../domain/identifiers'
import { createIssue, type DataIssue } from '../domain/issues'
import type { MonthRideReport } from '../domain/models'
import { emptyMonthStatistics, computeMonthStatistics } from '../domain/statistics/month'
import { expectedMonthsOfYear, computeYearStatistics } from '../domain/statistics/year'
import { computeLifetimeStatistics, resolveCoveredRange } from '../domain/statistics/lifetime'
import type { MonthlyStatistics, MonthlyTrendPoint, YearlyStatistics, LifetimeStatistics } from '../domain/statistics/types'
import { mergeDayStatsIntoMonth } from '../domain/enrichment'
import { createLogger, silentLogger, type Logger } from '../shared/logger'
import { AppError, toAppError } from './errors'
import { MonthReportLoader, type MonthFetchProgress } from './MonthReportLoader'
import { errorResult, okResult, partialResult, type DataResult, type ResultMeta } from './results'

/**
 * 报告用例。
 *
 * 月报是唯一的基础数据；年报与历史总报告都由月报聚合而来，
 * 因此在任何页面看到的"年总里程"与把 12 个月报加起来的结果一定一致。
 */

export interface ReportServiceDeps {
  readonly dataSource: RideDataSource
  readonly repository: RideRepository
  readonly clock: Clock
  readonly logger?: Logger
}

export interface MonthReportView {
  readonly report: MonthRideReport | null
  readonly statistics: MonthlyStatistics
}

export interface YearReportView {
  readonly year: number
  readonly statistics: YearlyStatistics
}

export interface LifetimeReportView {
  readonly statistics: LifetimeStatistics
}

export interface RangeReportView extends LifetimeReportView {
  readonly range: { readonly from: MonthKey; readonly to: MonthKey }
}

export interface OverviewView {
  readonly lifetime: LifetimeStatistics
  readonly currentMonth: MonthlyStatistics
  readonly recentMonths: readonly MonthlyTrendPoint[]
  readonly lastSyncedAt: string | null
}

export interface ReportRequestOptions {
  /** 忽略缓存强制刷新。 */
  readonly force?: boolean
  /** 缺失月份是否顺带联网补齐。 */
  readonly fetchMissing?: boolean
  /** 单次请求上限。 */
  readonly maxFetches?: number
  readonly onProgress?: (progress: MonthFetchProgress) => void
}

export interface LifetimeReportOptions extends ReportRequestOptions {
  /** 显式指定统计区间；不传时按 firstBindDate ~ 当前月推导。 */
  readonly range?: { readonly from: MonthKey; readonly to: MonthKey }
}

export class ReportService {
  private readonly deps: ReportServiceDeps
  private readonly logger: Logger

  constructor(deps: ReportServiceDeps) {
    this.deps = deps
    this.logger = deps.logger ?? silentLogger
  }

  today(): DateKey {
    return formatDate(this.deps.clock.now())
  }

  currentMonth(): MonthKey {
    return formatMonth(this.deps.clock.now())
  }

  async getMonthReport(
    ref: VehicleRef,
    month: MonthKey,
    options: ReportRequestOptions = {},
  ): Promise<DataResult<MonthReportView>> {
    const loader = this.loaderFor(ref)
    const outcome = await loader.loadOneMonth(ref, month, {
      force: options.force ?? false,
    })

    if (outcome.report === null && outcome.failure) {
      // 拉取失败且本地没有旧缓存：明确报错，不返回"0 里程"这种假数据。
      return errorResult(
        new AppError(`${month} 月报获取失败：${outcome.failure.message}`, {
          code: 'NETWORK',
          retriable: true,
        }),
        { failedMonths: [outcome.failure], issues: outcome.issues },
      )
    }

    const report = outcome.report
    const statistics = report
      ? computeMonthStatistics(report, { today: this.today() })
      : emptyMonthStatistics(month, this.today())
    const meta: Partial<ResultMeta> = {
      fromCache: outcome.fromCache,
      cachedAt: report?.fetchedAt ?? null,
      issues: [...outcome.issues, ...statistics.issues],
    }

    if (!report) {
      return partialResult({ report: null, statistics }, {
        ...meta,
        issues: [
          ...outcome.issues,
          createIssue('PARTIAL_DATA', `${month} 还没有本地数据`, { path: 'months', value: month }),
        ],
      })
    }
    if (statistics.status === 'partial') {
      return partialResult({ report, statistics }, meta)
    }
    return okResult({ report, statistics }, meta)
  }

  async getYearReport(
    ref: VehicleRef,
    year: number,
    options: ReportRequestOptions = {},
  ): Promise<DataResult<YearReportView>> {
    const floor = ref.bindMonth ?? null
    const expected = expectedMonthsOfYear(year, this.today()).filter(
      (month) => floor === null || compareMonth(month, floor) >= 0,
    )
    if (expected.length === 0) {
      const statistics = computeYearStatistics(year, new Map(), { today: this.today() })
      return partialResult({ year, statistics }, {
        issues: [createIssue('PARTIAL_DATA', `${year} 年还没有开始，暂无可统计的月份`, { path: 'year', value: year })],
      })
    }

    const outcome = options.fetchMissing === false
      ? { months: this.readCached(ref, expected), fetched: [] as MonthKey[], failedMonths: [] as FailedMonth[], issues: [] as DataIssue[] }
      : await this.loaderFor(ref).loadMonths(ref, expected, {
          ...(options.force === undefined ? {} : { force: options.force }),
          maxFetches: options.maxFetches ?? expected.length,
          ...(options.onProgress === undefined ? {} : { onProgress: options.onProgress }),
        })

    const statistics = computeYearStatistics(year, outcome.months, { today: this.today() })
    const meta: Partial<ResultMeta> = {
      fromCache: outcome.fetched.length === 0,
      failedMonths: outcome.failedMonths,
      issues: [...outcome.issues, ...statistics.issues],
    }

    if (statistics.status === 'unavailable') return partialResult({ year, statistics }, meta)
    if (statistics.status === 'partial') return partialResult({ year, statistics }, meta)
    return okResult({ year, statistics }, meta)
  }

  async getLifetimeReport(
    ref: VehicleRef,
    options: LifetimeReportOptions = {},
  ): Promise<DataResult<LifetimeReportView>> {
    const range = options.range ?? (await this.resolveLifetimeRange(ref, options))
    const expected = range ? enumerateRange(range.from, range.to) : []
    const outcome =
      options.fetchMissing === false
        ? {
            months: this.readCached(ref, expected),
            fetched: [] as MonthKey[],
            failedMonths: [] as FailedMonth[],
            issues: [] as DataIssue[],
          }
        : await this.loaderFor(ref).loadMonths(ref, expected, {
            ...(options.force === undefined ? {} : { force: options.force }),
            maxFetches: options.maxFetches ?? 12,
            ...(options.onProgress === undefined ? {} : { onProgress: options.onProgress }),
          })

    const statistics = computeLifetimeStatistics(outcome.months, {
      today: this.today(),
      generatedAt: this.deps.clock.now().toISOString(),
      ...(range === null ? {} : { range }),
    })
    const meta: Partial<ResultMeta> = {
      fromCache: outcome.fetched.length === 0,
      failedMonths: outcome.failedMonths,
      issues: [...outcome.issues, ...statistics.issues],
    }

    if (statistics.status === 'unavailable') return partialResult({ statistics }, meta)
    if (statistics.status === 'partial') return partialResult({ statistics }, meta)
    return okResult({ statistics }, meta)
  }

  /**
   * 自定义月份区间报告。
   *
   * 与年报、历史总报告使用同一套月报聚合逻辑，不额外维护统计数据。
   * 区间会按账号注册月份与当前月份裁剪，避免请求不可能有数据的月份。
   */
  async getRangeReport(
    ref: VehicleRef,
    from: MonthKey,
    to: MonthKey,
    options: ReportRequestOptions = {},
  ): Promise<DataResult<RangeReportView>> {
    if (compareMonth(from, to) > 0) {
      return errorResult(
        new AppError('开始月份不能晚于结束月份', {
          code: 'INVALID_INPUT',
          hint: '请重新选择月份区间',
        }),
      )
    }

    const currentMonth = this.currentMonth()
    const floor = ref.bindMonth ?? null
    const start = floor === null ? from : clampMonth(from, floor)
    const end = compareMonth(to, currentMonth) > 0 ? currentMonth : to
    if (compareMonth(start, end) > 0) {
      return errorResult(
        new AppError('所选区间没有可查询的骑行数据', {
          code: 'INVALID_INPUT',
          hint: '请选择账号注册之后的月份',
        }),
      )
    }

    const expected = enumerateRange(start, end)
    const outcome =
      options.fetchMissing === false
        ? {
            months: this.readCached(ref, expected),
            fetched: [] as MonthKey[],
            failedMonths: [] as FailedMonth[],
            issues: [] as DataIssue[],
          }
        : await this.loaderFor(ref).loadMonths(ref, expected, {
            ...(options.force === undefined ? {} : { force: options.force }),
            maxFetches: options.maxFetches ?? 24,
            ...(options.onProgress === undefined ? {} : { onProgress: options.onProgress }),
          })

    const statistics = computeLifetimeStatistics(outcome.months, {
      today: this.today(),
      generatedAt: this.deps.clock.now().toISOString(),
      range: { from: start, to: end },
    })
    const meta: Partial<ResultMeta> = {
      fromCache: outcome.fetched.length === 0,
      failedMonths: outcome.failedMonths,
      issues: [...outcome.issues, ...statistics.issues],
    }

    if (statistics.status === 'unavailable') {
      return partialResult({ range: { from: start, to: end }, statistics }, meta)
    }
    if (statistics.status === 'partial') {
      return partialResult({ range: { from: start, to: end }, statistics }, meta)
    }
    return okResult({ range: { from: start, to: end }, statistics }, meta)
  }

  async getOverview(ref: VehicleRef, options: ReportRequestOptions = {}): Promise<DataResult<OverviewView>> {
    const currentMonth = this.currentMonth()
    const recent = enumerateRange(addMonths(currentMonth, -5), currentMonth)
    const monthResult = await this.getMonthReport(ref, currentMonth, options)

    const lifetime = await this.getLifetimeReport(ref, {
      fetchMissing: options.fetchMissing ?? false,
      maxFetches: options.maxFetches ?? 6,
      ...(options.force === undefined ? {} : { force: options.force }),
    })

    const recentMonths = lifetime.data?.statistics.monthlyTrend.filter((point) => recent.includes(point.month)) ?? []
    const syncState = this.deps.repository.loadSyncState(ref.vehicleId)
    const data: OverviewView = {
      lifetime: lifetime.data?.statistics ?? emptyLifetimeStatistics(this.deps.clock.now().toISOString()),
      currentMonth:
        monthResult.data?.statistics ?? emptyMonthStatistics(currentMonth, this.today()),
      recentMonths,
      lastSyncedAt: syncState?.lastSyncedAt ?? null,
    }

    const failed = [...lifetime.meta.failedMonths, ...monthResult.meta.failedMonths]
    const issues = [...lifetime.meta.issues, ...monthResult.meta.issues]
    const meta: Partial<ResultMeta> = { failedMonths: failed, issues }

    if (monthResult.status === 'error' && lifetime.status === 'error') {
      return errorResult(monthResult.error ?? new AppError('总览数据获取失败', { code: 'UNKNOWN' }), meta)
    }
    if (failed.length > 0 || issues.length > 0 || monthResult.status !== 'ok') {
      return partialResult(data, meta)
    }
    return okResult(data, meta)
  }

  /**
   * 用单日统计接口补齐急加速/急减速/急转弯。
   *
   * 这三个指标只存在于 `/app/ride/report/v2`，月报接口不返回，属于官方限制。
   */
  async enrichRapidEvents(
    ref: VehicleRef,
    month: MonthKey,
    options: { maxDays?: number } = {},
  ): Promise<DataResult<MonthReportView>> {
    const maxDays = options.maxDays ?? 31
    const loader = this.loaderFor(ref)
    const loaded = await loader.loadOneMonth(ref, month, { force: false })
    const base = loaded.report ?? this.deps.repository.loadMonthReport({ vehicleId: ref.vehicleId, month })
    if (!base) {
      return errorResult(
        new AppError(`${month} 没有可用的月报数据，无法补充急事件统计`, {
          code: 'INVALID_INPUT',
          hint: '请先同步该月份',
        }),
        { failedMonths: loaded.failure ? [loaded.failure] : [] },
      )
    }

    const targets = base.days.slice(0, maxDays)
    const failures: FailedMonth[] = []
    const issues: DataIssue[] = []
    const stats = []
    for (const day of targets) {
      try {
        stats.push(await this.deps.dataSource.getDayStats(ref, day.date))
      } catch (error) {
        const appError = toAppError(error)
        failures.push({ month, code: appError.code, message: `${day.date}：${appError.message}`, at: this.deps.clock.now().toISOString() })
      }
    }

    const merged = mergeDayStatsIntoMonth(base, stats, {
      source: this.deps.dataSource.sourceId,
      fetchedAt: this.deps.clock.now().toISOString(),
    })
    this.deps.repository.saveMonthReport(merged)
    const statistics = computeMonthStatistics(merged, { today: this.today() })
    const meta: Partial<ResultMeta> = {
      fromCache: false,
      cachedAt: merged.fetchedAt,
      failedMonths: failures,
      issues: [...issues, ...statistics.issues],
    }
    if (failures.length > 0 || statistics.status !== 'complete') return partialResult({ report: merged, statistics }, meta)
    return okResult({ report: merged, statistics }, meta)
  }

  /** 历史统计区间：优先用 firstBindDate 推断的 earliestMonth，其次用本地缓存范围。 */
  async resolveLifetimeRange(
    ref: VehicleRef,
    options: ReportRequestOptions = {},
  ): Promise<{ from: MonthKey; to: MonthKey } | null> {
    const syncState = this.deps.repository.loadSyncState(ref.vehicleId)
    const to = this.currentMonth()
    const floor = ref.bindMonth ?? null
    if (syncState?.earliestMonth) {
      return { from: clampMonth(syncState.earliestMonth, floor), to }
    }
    const cachedRange = resolveCoveredRange(this.readCached(ref, this.deps.repository.listCachedMonths(ref.vehicleId)))
    if (cachedRange) return { from: clampMonth(cachedRange.from, floor), to }
    if (options.fetchMissing === false) return null
    // 还没有任何本地数据时先取当前月，firstBindDate 会告诉我们最早可查询月份。
    const probe = await this.loaderFor(ref).loadOneMonth(ref, to, { force: false })
    if (probe.report?.firstBindMonth) return { from: clampMonth(probe.report.firstBindMonth, floor), to }
    this.logger.warn('无法从 firstBindDate 推断历史范围，将按本地缓存范围统计')
    return null
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

  private readCached(ref: VehicleRef, months: readonly MonthKey[]): Map<MonthKey, MonthRideReport | null> {
    const map = new Map<MonthKey, MonthRideReport | null>()
    const syncState = this.deps.repository.loadSyncState(ref.vehicleId)
    for (const month of months) {
      const report = this.deps.repository.loadMonthReport({ vehicleId: ref.vehicleId, month })
      if (report) {
        map.set(month, report)
        continue
      }
      // 已同步但服务端返回空 → 记为"已知无数据"；否则不写入，保持"未知"。
      if (syncState?.emptyMonths.includes(month)) map.set(month, null)
    }
    return map
  }
}

export function createReportService(deps: ReportServiceDeps): ReportService {
  return new ReportService({ ...deps, logger: deps.logger ?? createLogger({ scope: 'report' }) })
}

function enumerateRange(from: MonthKey, to: MonthKey): MonthKey[] {
  const result: MonthKey[] = []
  let cursor = from
  for (let guard = 0; guard < 1200; guard += 1) {
    result.push(cursor)
    if (compareMonth(cursor, to) >= 0) break
    cursor = addMonths(cursor, 1)
  }
  return result
}

function emptyLifetimeStatistics(generatedAt: string): LifetimeStatistics {
  return {
    status: 'unavailable',
    range: null,
    monthsCovered: 0,
    monthsWithoutData: [],
    monthsUnknown: [],
    totalDistanceKm: null,
    totalDurationSeconds: null,
    totalRideDays: 0,
    topSpeed: null,
    longestRideDay: null,
    rapid: { acceleration: null, deceleration: null, turn: null, coveredDays: 0, missingDays: 0 },
    monthlyTrend: [],
    issues: [],
    generatedAt,
  }
}

/** 取两个月份中较晚的一个（null 表示不限制）。 */
function clampMonth(month: MonthKey, floor: MonthKey | null): MonthKey {
  if (floor === null) return month
  return compareMonth(month, floor) < 0 ? floor : month
}

