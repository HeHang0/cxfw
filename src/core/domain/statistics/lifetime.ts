import { addMonths, compareMonth, enumerateMonths, monthOf } from '../datetime'
import type { DateKey, MonthKey } from '../identifiers'
import { aggregateMonths, type MonthReportMap } from './aggregate'
import type { LifetimeStatistics } from './types'

/**
 * 历史总报告：同样由月报聚合得到，不维护独立的累计表。
 *
 * `range` 表示数据的覆盖范围：
 * - 优先使用调用方给的区间（例如按 `firstBindDate` ~ 当前月推导的可查询范围）；
 * - 否则取本地已缓存月份的最小/最大值为界。
 * 区间内没有缓存的月份会出现在 `monthsUnknown` 里，提示"累计值不完整"。
 */

export interface LifetimeStatisticsOptions {
  readonly today: DateKey
  readonly generatedAt: string
  readonly range?: { readonly from: MonthKey; readonly to: MonthKey }
}

export function resolveCoveredRange(months: MonthReportMap): { from: MonthKey; to: MonthKey } | null {
  const keys = [...months.keys()].sort(compareMonth)
  const first = keys[0]
  const last = keys[keys.length - 1]
  if (first === undefined || last === undefined) return null
  return { from: first, to: last }
}

export function computeLifetimeStatistics(
  months: MonthReportMap,
  options: LifetimeStatisticsOptions,
): LifetimeStatistics {
  const range = options.range ?? resolveCoveredRange(months)
  const expectedMonths = range ? enumerateMonths(range.from, range.to) : []
  const rangeComplete = range !== null && compareMonth(range.to, monthOf(options.today)) < 0

  const aggregated = aggregateMonths(months, { expectedMonths, rangeComplete })

  return {
    status: aggregated.status,
    range,
    monthsCovered: aggregated.monthsCovered.length,
    monthsWithoutData: aggregated.monthsWithoutData,
    monthsUnknown: aggregated.monthsUnknown,
    totalDistanceKm: aggregated.totalDistanceKm,
    totalDurationSeconds: aggregated.totalDurationSeconds,
    totalRideDays: aggregated.rideDays,
    topSpeed: aggregated.topSpeed,
    longestRideDay: aggregated.longestRideDay,
    rapid: aggregated.rapid,
    monthlyTrend: aggregated.monthlyTrend,
    issues: aggregated.issues,
    generatedAt: options.generatedAt,
  }
}

export function nextMonthOf(month: MonthKey): MonthKey {
  return addMonths(month, 1)
}
