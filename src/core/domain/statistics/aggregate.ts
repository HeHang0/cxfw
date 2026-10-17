import type { MonthKey } from '../identifiers'
import { dedupeIssues, type DataIssue } from '../issues'
import type { DayRideRecord, MonthRideReport } from '../models'
import {
  collectDayIssues,
  findLongestRideDay,
  findTopSpeed,
  mergeRapidSummaries,
  monthlyTrendPoint,
  sumDays,
  summarizeRapidEvents,
} from './shared'
import type { CoverageStatus, LongestRideDay, MonthlyTrendPoint, RapidEventSummary, TopSpeedRecord } from './types'

/**
 * 月报聚合。年报与历史总报告都建立在这一个函数之上，不单独维护重复的统计数据。
 *
 * `months` 的取值语义（这是"不能把未知当作 0"的关键）：
 * - 值是 `MonthRideReport` 且含按天记录：该月已同步且有数据。
 * - 值是 `MonthRideReport` 但 `days` 为空，或值是 `null`：该月已同步，
 *   服务端返回"没有骑行记录"（已知为空，按 0 计入是安全的，但会单独列出）。
 * - 键不存在：该月尚未同步，属于**未知**，既不计入合计，也不当作 0。
 */
export type MonthReportMap = ReadonlyMap<MonthKey, MonthRideReport | null>

export interface AggregateResult {
  readonly status: CoverageStatus
  readonly totalDistanceKm: number | null
  readonly totalDurationSeconds: number | null
  readonly rideDays: number
  readonly monthsCovered: readonly MonthKey[]
  readonly monthsWithoutData: readonly MonthKey[]
  readonly monthsUnknown: readonly MonthKey[]
  readonly monthlyTrend: readonly MonthlyTrendPoint[]
  readonly topSpeed: TopSpeedRecord | null
  readonly longestRideDay: LongestRideDay | null
  readonly rapid: RapidEventSummary
  readonly issues: readonly DataIssue[]
  readonly dayRecordCount: number
}

export interface AggregateOptions {
  /** 期望覆盖的月份（顺序即趋势输出顺序）。范围之外的键会被忽略。 */
  readonly expectedMonths: readonly MonthKey[]
  /** 该范围是否全部已结束。未结束时状态至少为 partial。 */
  readonly rangeComplete: boolean
}

export function aggregateMonths(months: MonthReportMap, options: AggregateOptions): AggregateResult {
  const covered: MonthKey[] = []
  const withoutData: MonthKey[] = []
  const unknown: MonthKey[] = []
  const trend: MonthlyTrendPoint[] = []
  const issues: DataIssue[] = []
  const rapidSummaries: RapidEventSummary[] = []
  const days: DayRideRecord[] = []

  let distanceTotal = 0
  let distanceKnown = false
  let durationTotal = 0
  let durationKnown = false
  let rideDays = 0

  for (const month of options.expectedMonths) {
    const present = months.has(month)
    const report = present ? (months.get(month) ?? null) : null

    const hasRecords = report !== null && report.days.length > 0
    if (!present) unknown.push(month)
    else if (!hasRecords) withoutData.push(month)
    else covered.push(month)

    trend.push(monthlyTrendPoint(month, report))

    if (!report) continue

    const totals = sumDays(report.days)
    if (totals.totalDistanceKm !== null) {
      distanceTotal += totals.totalDistanceKm
      distanceKnown = true
    }
    if (totals.totalDurationSeconds !== null) {
      durationTotal += totals.totalDurationSeconds
      durationKnown = true
    }
    rideDays += totals.rideDays
    rapidSummaries.push(summarizeRapidEvents(report.days))
    for (const day of report.days) days.push(day)
    for (const issue of report.issues) issues.push(issue)
    for (const issue of collectDayIssues(report.days)) issues.push(issue)
  }

  const merged = dedupeIssues(issues)
  const hasErrors = merged.some((issue) => issue.severity === 'error')
  const knownUnits = covered.length + withoutData.length
  const status: CoverageStatus =
    knownUnits === 0
      ? 'unavailable'
      : unknown.length > 0 || hasErrors || !options.rangeComplete
        ? 'partial'
        : 'complete'

  return {
    status,
    totalDistanceKm: distanceKnown ? Math.round(distanceTotal * 100) / 100 : null,
    totalDurationSeconds: durationKnown ? Math.round(durationTotal) : null,
    rideDays,
    monthsCovered: covered,
    monthsWithoutData: withoutData,
    monthsUnknown: unknown,
    monthlyTrend: trend,
    topSpeed: findTopSpeed(days),
    longestRideDay: findLongestRideDay(days),
    rapid: mergeRapidSummaries(rapidSummaries),
    issues: merged,
    dayRecordCount: days.length,
  }
}
