import {
  compareDate,
  daysInMonth,
  elapsedDaysInMonth,
  enumerateDates,
  isMonthFinished,
  isMonthFuture,
} from '../datetime'
import type { DateKey, MonthKey } from '../identifiers'
import type { DataIssue } from '../issues'
import type { DayRideRecord, MonthRideReport } from '../models'
import { round } from '../numbers'
import {
  collectDayIssues,
  dedupeAndCollect,
  findLongestRideDay,
  findTopSpeed,
  sumDays,
  summarizeRapidEvents,
} from './shared'
import type { DailyTrendPoint, MonthlyStatistics } from './types'

/**
 * 单月统计。
 *
 * 关于"缺失天数"的判定（api.yaml 未明确，属于已记录的假设）：
 * 官方月报只返回**有骑行记录**的日期，因此已结束月份里没有出现的日期按"当天没有骑行"处理，
 * 而不是按"数据缺失"处理。当前未结束的月份用 `inProgress` + `coverage.daysElapsed` 说明
 * 该月数据只覆盖到今天。真正无法解析的记录会通过 `issues` 上报，不会被当作 0。
 */

export interface MonthStatisticsOptions {
  /** 用作"今天"的日期，必须由调用方注入，保证统计可测试。 */
  readonly today: DateKey
}

function daysWithinWindow(days: readonly DayRideRecord[], end: DateKey): DayRideRecord[] {
  return days.filter((day) => compareDate(day.date, end) <= 0)
}

export function computeMonthStatistics(
  report: MonthRideReport,
  options: MonthStatisticsOptions,
): MonthlyStatistics {
  const month: MonthKey = report.month
  const today = options.today
  const totalDays = daysInMonth(month)
  const elapsed = elapsedDaysInMonth(month, today)
  const future = isMonthFuture(month, today)
  const finished = isMonthFinished(month, today)
  const inProgress = !future && !finished

  // 窗口 = 该月已过去的范围。已结束月份是整月；当前月到今天。
  const windowEnd: DateKey = finished
    ? (`${month}-${String(totalDays).padStart(2, '0')}` as DateKey)
    : today
  const windowDays = future ? [] : daysWithinWindow(report.days, windowEnd)

  const byDate = new Map<string, DayRideRecord>()
  for (const day of windowDays) byDate.set(day.date, day)

  const trendDates = future ? [] : enumerateDates(month).filter((date) => compareDate(date, windowEnd) <= 0)
  const dailyTrend: DailyTrendPoint[] = trendDates.map((date) => {
    const record = byDate.get(date)
    if (!record) return { date, distanceKm: null, durationSeconds: null, maxSpeedKph: null }
    return {
      date,
      distanceKm: record.distanceKm,
      durationSeconds: record.durationSeconds,
      maxSpeedKph: record.maxSpeedKph,
    }
  })

  const totals = sumDays(windowDays)
  const longestRideDay = findLongestRideDay(windowDays)
  const topSpeed = findTopSpeed(windowDays)
  const rapid = summarizeRapidEvents(windowDays)

  const daysWithData = windowDays.length
  const daysWithoutRecord = Math.max(0, elapsed - daysWithData)
  const lastRecordedDate = windowDays.reduce<DateKey | null>(
    (latest, day) => (latest === null || day.date > latest ? day.date : latest),
    null,
  )

  const issues: DataIssue[] = dedupeAndCollect(report.issues, collectDayIssues(windowDays))
  const hasErrors = issues.some((issue) => issue.severity === 'error')

  const status: MonthlyStatistics['status'] = future
    ? 'unavailable'
    : inProgress || hasErrors
      ? 'partial'
      : 'complete'

  return {
    month,
    status,
    inProgress,
    coverage: { daysWithData, daysElapsed: elapsed, daysInMonth: totalDays, daysWithoutRecord, lastRecordedDate },
    totalDistanceKm: totals.totalDistanceKm,
    totalDurationSeconds: totals.totalDurationSeconds,
    rideDays: totals.rideDays,
    averageDistancePerRideDayKm:
      totals.totalDistanceKm === null || totals.rideDays === 0
        ? null
        : round(totals.totalDistanceKm / totals.rideDays, 2),
    averageDistancePerElapsedDayKm:
      totals.totalDistanceKm === null || elapsed === 0 ? null : round(totals.totalDistanceKm / elapsed, 2),
    dailyTrend,
    longestRideDay,
    topSpeed,
    rapid,
    issues,
  }
}

/** 空数据（还没同步过）月份的最小统计结果，用于页面显示"未知"而不是 0。 */
export function emptyMonthStatistics(month: MonthKey, today: DateKey): MonthlyStatistics {
  const elapsed = elapsedDaysInMonth(month, today)
  const future = isMonthFuture(month, today)
  const finished = isMonthFinished(month, today)
  return {
    month,
    status: 'unavailable',
    inProgress: !future && !finished,
    coverage: {
      daysWithData: 0,
      daysElapsed: elapsed,
      daysInMonth: daysInMonth(month),
      daysWithoutRecord: elapsed,
      lastRecordedDate: null,
    },
    totalDistanceKm: null,
    totalDurationSeconds: null,
    rideDays: 0,
    averageDistancePerRideDayKm: null,
    averageDistancePerElapsedDayKm: null,
    dailyTrend: [],
    longestRideDay: null,
    topSpeed: null,
    rapid: { acceleration: null, deceleration: null, turn: null, coveredDays: 0, missingDays: 0 },
    issues: [],
  }
}

