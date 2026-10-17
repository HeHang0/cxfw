import { describe, expect, it } from 'vitest'
import type { DateKey, MonthKey } from '@/core/domain/identifiers'
import type { MonthRideReport } from '@/core/domain/models'
import { computeYearStatistics, expectedMonthsOfYear } from '@/core/domain/statistics/year'
import type { MonthReportMap } from '@/core/domain/statistics/aggregate'
import { makeMonthReport } from './helpers/fixtures'

const TODAY = '2026-10-17' as DateKey

function mapOf(entries: Array<[MonthKey, MonthRideReport | null]>): MonthReportMap {
  return new Map(entries)
}

describe('年度统计', () => {
  it('期望月份只到已经过去的月份', () => {
    expect(expectedMonthsOfYear(2026, TODAY)).toHaveLength(10)
    expect(expectedMonthsOfYear(2025, TODAY)).toHaveLength(12)
    expect(expectedMonthsOfYear(2027, TODAY)).toHaveLength(0)
  })

  it('汇总各月里程并可核对', () => {
    const months = mapOf([
      ['2026-01' as MonthKey, makeMonthReport('2026-01' as MonthKey, [
        { date: '2026-01-05', distanceMeters: '50000', durationSeconds: '3600', maxSpeedKph: '90' },
      ])],
      ['2026-02' as MonthKey, makeMonthReport('2026-02' as MonthKey, [
        { date: '2026-02-06', distanceMeters: '30000', durationSeconds: '1800', maxSpeedKph: '110' },
        { date: '2026-02-07', distanceMeters: '20000', durationSeconds: '1200', maxSpeedKph: '70' },
      ])],
      ['2026-03' as MonthKey, makeMonthReport('2026-03' as MonthKey, [])],
    ])
    const stats = computeYearStatistics(2026, months, { today: TODAY })

    expect(stats.totalDistanceKm).toBe(100)
    expect(stats.totalDurationSeconds).toBe(6600)
    expect(stats.rideDays).toBe(3)
    expect(stats.monthsCovered).toEqual(['2026-01', '2026-02'])
    expect(stats.monthsWithoutData).toEqual(['2026-03'])
    // 4 月到 10 月尚未同步 → 未知，而不是 0
    expect(stats.monthsUnknown).toEqual([
      '2026-04',
      '2026-05',
      '2026-06',
      '2026-07',
      '2026-08',
      '2026-09',
      '2026-10',
    ])
    expect(stats.status).toBe('partial')
    expect(stats.inProgress).toBe(true)
    expect(stats.topSpeed).toEqual({ date: '2026-02-06', speedKph: 110 })
    expect(stats.longestRideDay).toEqual({ date: '2026-01-05', distanceKm: 50 })
    expect(stats.monthlyTrend).toHaveLength(10)
    expect(stats.monthlyTrend.map((point) => point.hasData)).toEqual([
      true,
      true,
      true,
      false,
      false,
      false,
      false,
      false,
      false,
      false,
    ])
  })

  it('未知月份不影响已知月份的合计', () => {
    const months = mapOf([
      ['2025-01' as MonthKey, makeMonthReport('2025-01' as MonthKey, [
        { date: '2025-01-05', distanceMeters: '10000', durationSeconds: '600', maxSpeedKph: '50' },
      ])],
    ])
    const stats = computeYearStatistics(2025, months, { today: TODAY })
    // 只有 1 月有数据：合计是 10，而不是把其余 11 个月当 0 之后仍写 10
    expect(stats.totalDistanceKm).toBe(10)
    expect(stats.monthsUnknown).toHaveLength(11)
    expect(stats.status).toBe('partial')
    expect(stats.monthsWithoutData).toHaveLength(0)
  })

  it('完全没有任何月份数据时为 unavailable', () => {
    const stats = computeYearStatistics(2025, mapOf([]), { today: TODAY })
    expect(stats.status).toBe('unavailable')
    expect(stats.totalDistanceKm).toBeNull()
    expect(stats.monthsCovered).toHaveLength(0)
  })

  it('全部月份同步后状态为 complete（历史年份）', () => {
    const entries: Array<[MonthKey, MonthRideReport | null]> = []
    for (let month = 1; month <= 12; month += 1) {
      const key = `2025-${String(month).padStart(2, '0')}` as MonthKey
      entries.push([
        key,
        makeMonthReport(key, [
          { date: `${key}-01`, distanceMeters: '10000', durationSeconds: '600', maxSpeedKph: '50' },
        ]),
      ])
    }
    const stats = computeYearStatistics(2025, mapOf(entries), { today: TODAY })
    expect(stats.status).toBe('complete')
    expect(stats.totalDistanceKm).toBe(120)
    expect(stats.monthsUnknown).toHaveLength(0)
    expect(stats.inProgress).toBe(false)
  })
})
