import { describe, expect, it } from 'vitest'
import type { DateKey, MonthKey } from '@/core/domain/identifiers'
import type { MonthRideReport } from '@/core/domain/models'
import type { MonthReportMap } from '@/core/domain/statistics/aggregate'
import { computeLifetimeStatistics, resolveCoveredRange } from '@/core/domain/statistics/lifetime'
import { makeMonthReport } from './helpers/fixtures'

const TODAY = '2026-10-17' as DateKey
const GENERATED_AT = '2026-10-17T08:00:00.000Z'

function mapOf(entries: Array<[MonthKey, MonthRideReport | null]>): MonthReportMap {
  return new Map(entries)
}

describe('历史总报告', () => {
  it('累计里程、时长、骑行天数与数据覆盖范围', () => {
    const months = mapOf([
      ['2025-11' as MonthKey, makeMonthReport('2025-11' as MonthKey, [
        { date: '2025-11-01', distanceMeters: '10000', durationSeconds: '600', maxSpeedKph: '70' },
      ])],
      ['2025-12' as MonthKey, makeMonthReport('2025-12' as MonthKey, [])],
      ['2026-01' as MonthKey, makeMonthReport('2026-01' as MonthKey, [
        { date: '2026-01-01', distanceMeters: '40000', durationSeconds: '2400', maxSpeedKph: '140' },
        { date: '2026-01-02', distanceMeters: '60000', durationSeconds: '3600', maxSpeedKph: '90' },
      ])],
    ])

    const stats = computeLifetimeStatistics(months, {
      today: TODAY,
      generatedAt: GENERATED_AT,
      range: { from: '2025-11' as MonthKey, to: '2026-01' as MonthKey },
    })

    expect(stats.totalDistanceKm).toBe(110)
    expect(stats.totalDurationSeconds).toBe(6600)
    expect(stats.totalRideDays).toBe(3)
    expect(stats.range).toEqual({ from: '2025-11', to: '2026-01' })
    expect(stats.monthsCovered).toBe(2)
    expect(stats.monthsWithoutData).toEqual(['2025-12'])
    expect(stats.monthsUnknown).toHaveLength(0)
    expect(stats.topSpeed).toEqual({ date: '2026-01-01', speedKph: 140 })
    expect(stats.longestRideDay).toEqual({ date: '2026-01-02', distanceKm: 60 })
    expect(stats.status).toBe('complete')
    expect(stats.generatedAt).toBe(GENERATED_AT)
  })

  it('覆盖范围内缺少的月份计入 monthsUnknown，累计值标记为不完整', () => {
    const months = mapOf([
      ['2025-11' as MonthKey, makeMonthReport('2025-11' as MonthKey, [
        { date: '2025-11-01', distanceMeters: '10000', durationSeconds: '600', maxSpeedKph: '70' },
      ])],
      ['2026-01' as MonthKey, makeMonthReport('2026-01' as MonthKey, [
        { date: '2026-01-01', distanceMeters: '10000', durationSeconds: '600', maxSpeedKph: '70' },
      ])],
    ])
    const stats = computeLifetimeStatistics(months, {
      today: TODAY,
      generatedAt: GENERATED_AT,
      range: { from: '2025-11' as MonthKey, to: '2026-01' as MonthKey },
    })
    expect(stats.monthsUnknown).toEqual(['2025-12'])
    expect(stats.status).toBe('partial')
    expect(stats.totalDistanceKm).toBe(20)
  })

  it('没有区间信息时以本地缓存范围为准', () => {
    const months = mapOf([
      ['2025-09' as MonthKey, makeMonthReport('2025-09' as MonthKey, [])],
      ['2026-02' as MonthKey, makeMonthReport('2026-02' as MonthKey, [])],
    ])
    expect(resolveCoveredRange(months)).toEqual({ from: '2025-09', to: '2026-02' })
    const stats = computeLifetimeStatistics(months, { today: TODAY, generatedAt: GENERATED_AT })
    expect(stats.monthsUnknown).toEqual([
      '2025-10',
      '2025-11',
      '2025-12',
      '2026-01',
    ])
    expect(stats.status).toBe('partial')
  })

  it('没有任何数据时返回 unavailable 且累计值为 null', () => {
    const stats = computeLifetimeStatistics(mapOf([]), { today: TODAY, generatedAt: GENERATED_AT })
    expect(stats.status).toBe('unavailable')
    expect(stats.range).toBeNull()
    expect(stats.totalDistanceKm).toBeNull()
    expect(stats.totalRideDays).toBe(0)
  })

  it('跨年累计不会因为年份边界出错', () => {
    const months = mapOf([
      ['2025-12' as MonthKey, makeMonthReport('2025-12' as MonthKey, [
        { date: '2025-12-31', distanceMeters: '10000', durationSeconds: '600', maxSpeedKph: '70' },
      ])],
      ['2026-01' as MonthKey, makeMonthReport('2026-01' as MonthKey, [
        { date: '2026-01-01', distanceMeters: '10000', durationSeconds: '600', maxSpeedKph: '70' },
      ])],
    ])
    const stats = computeLifetimeStatistics(months, { today: TODAY, generatedAt: GENERATED_AT })
    expect(stats.monthlyTrend.map((point) => point.month)).toEqual(['2025-12', '2026-01'])
    expect(stats.totalDistanceKm).toBe(20)
  })
})
