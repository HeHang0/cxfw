import { monthOf } from './datetime'
import { createIssue, dedupeIssues } from './issues'
import type { DayRideRecord, DayRideStats, MonthRideReport } from './models'

/**
 * 把单日统计（`/app/ride/report/v2`）合并进月度报表。
 *
 * 急加速/急减速/急转弯只在单日统计接口里存在，月报接口不返回，
 * 因此需要按天补抓。合并规则：
 * - 空字段用单日接口的值补齐；已有值保持不动（月报为准）。
 * - 不影响 `distanceKm`，因为单日接口没有可信的当日里程字段。
 */
export function mergeDayStatsIntoMonth(
  report: MonthRideReport,
  stats: readonly DayRideStats[],
  options: { source: string; fetchedAt: string },
): MonthRideReport {
  const issues = [...report.issues]
  const statsByDate = new Map<string, DayRideStats>()
  for (const item of stats) {
    if (monthOf(item.date) !== report.month) {
      issues.push(
        createIssue('DAY_OUTSIDE_MONTH', `单日统计 ${item.date} 不属于月份 ${report.month}，已忽略`, {
          path: 'dayStats',
          value: item.date,
        }),
      )
      continue
    }
    statsByDate.set(item.date, item)
    for (const issue of item.issues) issues.push(issue)
  }

  const days: DayRideRecord[] = report.days.map((day) => {
    const stats_ = statsByDate.get(day.date)
    if (!stats_) return day
    return {
      ...day,
      durationSeconds: day.durationSeconds ?? stats_.durationSeconds,
      maxSpeedKph: day.maxSpeedKph ?? stats_.maxSpeedKph,
      rapidAcceleration: stats_.rapidAcceleration ?? day.rapidAcceleration,
      rapidDeceleration: stats_.rapidDeceleration ?? day.rapidDeceleration,
      rapidTurn: stats_.rapidTurn ?? day.rapidTurn,
      issues: dedupeIssues([...day.issues, ...stats_.issues]),
    }
  })

  const missingDays = days.filter((day) => !statsByDate.has(day.date)).map((day) => day.date)
  if (missingDays.length > 0) {
    issues.push(
      createIssue('PARTIAL_DATA', `${missingDays.length} 天缺少单日统计（急加速/急减速/急转弯可能不完整）`, {
        path: 'dayStats',
        value: missingDays,
      }),
    )
  }

  return {
    ...report,
    days,
    issues: dedupeIssues(issues),
    fetchedAt: options.fetchedAt,
    source: `${options.source}+dayStats`,
  }
}
