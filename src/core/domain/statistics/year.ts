import { elapsedDaysInMonth, isMonthFinished, monthOf, monthsOfYear } from '../datetime'
import type { DateKey } from '../identifiers'
import { aggregateMonths, type MonthReportMap } from './aggregate'
import type { YearlyStatistics } from './types'

/**
 * 年度统计：完全由月报聚合得到，官方没有年报接口。
 *
 * 计入范围只到"已经过去的月份"：当前年 10 月时，1—10 月是期望范围，
 * 11、12 月既不算未知也不算 0，直接不参与统计。
 */

export interface YearStatisticsOptions {
  readonly today: DateKey
  /** 可选的期望月份覆盖（例如只统计到已绑定月份），未提供时按自然年推导。 */
  readonly expectedMonths?: readonly MonthKeyInput[]
}

type MonthKeyInput = `${number}-${number}`

export function expectedMonthsOfYear(year: number, today: DateKey): MonthKeyInput[] {
  const currentMonth = monthOf(today)
  const currentYear = Number(currentMonth.slice(0, 4))
  const all = monthsOfYear(year)
  if (year > currentYear) return []
  if (year < currentYear) return all
  return all.filter((month) => isMonthFinished(month, today) || month === currentMonth)
}

export function computeYearStatistics(
  year: number,
  months: MonthReportMap,
  options: YearStatisticsOptions,
): YearlyStatistics {
  const expected = options.expectedMonths ?? expectedMonthsOfYear(year, options.today)
  const currentMonth = monthOf(options.today)
  const inProgress = Number(currentMonth.slice(0, 4)) === year
  const rangeComplete =
    !inProgress && expected.every((month) => isMonthFinished(month, options.today))

  const aggregated = aggregateMonths(months, { expectedMonths: expected, rangeComplete })

  return {
    year,
    status: aggregated.status,
    inProgress,
    monthsCovered: aggregated.monthsCovered,
    monthsWithoutData: aggregated.monthsWithoutData,
    monthsUnknown: aggregated.monthsUnknown,
    totalDistanceKm: aggregated.totalDistanceKm,
    totalDurationSeconds: aggregated.totalDurationSeconds,
    rideDays: aggregated.rideDays,
    monthlyTrend: aggregated.monthlyTrend,
    topSpeed: aggregated.topSpeed,
    longestRideDay: aggregated.longestRideDay,
    rapid: aggregated.rapid,
    issues: aggregated.issues,
  }
}

export function daysElapsedInYear(year: number, today: DateKey): number {
  const expected = expectedMonthsOfYear(year, today)
  return expected.reduce((sum, month) => sum + elapsedDaysInMonth(month, today), 0)
}
