import { describe, expect, it } from 'vitest'
import type { DateKey, MonthKey } from '@/core/domain/identifiers'
import { computeMonthStatistics, emptyMonthStatistics } from '@/core/domain/statistics/month'
import { makeMonthReport } from './helpers/fixtures'

const MONTH = '2026-09' as MonthKey
const TODAY = '2026-10-17' as DateKey

describe('月统计', () => {
  it('已结束月份：汇总里程、时长、骑行天数与日均', () => {
    const report = makeMonthReport(MONTH, [
      { date: '2026-09-01', distanceMeters: '10000', durationSeconds: '1800', maxSpeedKph: '60' },
      { date: '2026-09-02', distanceMeters: '20000', durationSeconds: '3600', maxSpeedKph: '80' },
      { date: '2026-09-10', distanceMeters: '30000', durationSeconds: '5400', maxSpeedKph: '120' },
    ])
    const stats = computeMonthStatistics(report, { today: TODAY })

    expect(stats.status).toBe('complete')
    expect(stats.inProgress).toBe(false)
    expect(stats.totalDistanceKm).toBe(60)
    expect(stats.totalDurationSeconds).toBe(10800)
    expect(stats.rideDays).toBe(3)
    expect(stats.averageDistancePerRideDayKm).toBe(20)
    expect(stats.averageDistancePerElapsedDayKm).toBe(2)
    expect(stats.longestRideDay).toEqual({ date: '2026-09-10', distanceKm: 30 })
    expect(stats.topSpeed).toEqual({ date: '2026-09-10', speedKph: 120 })
    expect(stats.coverage.daysInMonth).toBe(30)
    expect(stats.coverage.daysElapsed).toBe(30)
    expect(stats.coverage.daysWithData).toBe(3)
    expect(stats.coverage.daysWithoutRecord).toBe(27)
    expect(stats.coverage.lastRecordedDate).toBe('2026-09-10')
  })

  it('每日趋势包含整月天数，缺失日期为 null', () => {
    const report = makeMonthReport(MONTH, [
      { date: '2026-09-01', distanceMeters: '10000', durationSeconds: '1800', maxSpeedKph: '60' },
    ])
    const stats = computeMonthStatistics(report, { today: TODAY })
    expect(stats.dailyTrend).toHaveLength(30)
    expect(stats.dailyTrend[0]).toEqual({
      date: '2026-09-01',
      distanceKm: 10,
      durationSeconds: 1800,
      maxSpeedKph: 60,
    })
    expect(stats.dailyTrend[1]?.distanceKm).toBeNull()
  })

  it('当前未结束月份：只统计到今天，并标记 inProgress', () => {
    const report = makeMonthReport('2026-10' as MonthKey, [
      { date: '2026-10-16', distanceMeters: '57400', durationSeconds: '5412', maxSpeedKph: '116' },
      { date: '2026-10-20', distanceMeters: '100000', durationSeconds: '7200', maxSpeedKph: '130' },
    ])
    const stats = computeMonthStatistics(report, { today: TODAY })

    expect(stats.inProgress).toBe(true)
    expect(stats.status).toBe('partial')
    // 10-20 尚未发生，不能计入
    expect(stats.totalDistanceKm).toBe(57.4)
    expect(stats.coverage.daysElapsed).toBe(17)
    expect(stats.coverage.daysInMonth).toBe(31)
    expect(stats.dailyTrend).toHaveLength(17)
    // 骑行日均按"有骑行的天"计算：57.4 / 1
    expect(stats.averageDistancePerRideDayKm).toBe(57.4)
    // 日历日均按已过去的天数：57.4 / 17
    expect(stats.averageDistancePerElapsedDayKm).toBe(3.38)
  })

  it('完全没有数据时返回 unavailable，而不是 0', () => {
    const report = makeMonthReport(MONTH, [])
    const stats = computeMonthStatistics(report, { today: TODAY })
    expect(stats.status).toBe('complete')
    expect(stats.totalDistanceKm).toBeNull()
    expect(stats.averageDistancePerRideDayKm).toBeNull()
    expect(stats.averageDistancePerElapsedDayKm).toBeNull()
    expect(stats.rideDays).toBe(0)
    expect(stats.topSpeed).toBeNull()
  })

  it('未来月份不产生统计值', () => {
    const report = makeMonthReport('2026-12' as MonthKey, [])
    const stats = computeMonthStatistics(report, { today: TODAY })
    expect(stats.status).toBe('unavailable')
    expect(stats.coverage.daysElapsed).toBe(0)
    expect(stats.dailyTrend).toHaveLength(0)
  })

  it('急事件缺失时计入 missingDays，不按 0 计算', () => {
    const report = makeMonthReport(MONTH, [
      { date: '2026-09-01', distanceMeters: '10000', durationSeconds: '1800', maxSpeedKph: '60' },
      { date: '2026-09-02', distanceMeters: '20000', durationSeconds: '3600', maxSpeedKph: '80' },
    ])
    const stats = computeMonthStatistics(report, { today: TODAY })
    expect(stats.rapid.acceleration).toBeNull()
    expect(stats.rapid.coveredDays).toBe(0)
    expect(stats.rapid.missingDays).toBe(2)
  })

  it('存在急事件数据时正常汇总', () => {
    const report = makeMonthReport(MONTH, [
      { date: '2026-09-01', distanceMeters: '10000', durationSeconds: '1800', maxSpeedKph: '60', rapidAcceleration: 2, rapidDeceleration: 1, rapidTurn: 3 },
      { date: '2026-09-02', distanceMeters: '20000', durationSeconds: '3600', maxSpeedKph: '80', rapidAcceleration: 4, rapidDeceleration: 0, rapidTurn: 1 },
    ])
    const stats = computeMonthStatistics(report, { today: TODAY })
    expect(stats.rapid.acceleration).toBe(6)
    expect(stats.rapid.deceleration).toBe(1)
    expect(stats.rapid.turn).toBe(4)
    expect(stats.rapid.coveredDays).toBe(2)
    expect(stats.rapid.missingDays).toBe(0)
  })

  it('存在解析错误时状态降级为 partial', () => {
    const report = makeMonthReport(MONTH, [
      { date: '2026-09-01', distanceMeters: '10000', durationSeconds: '1800', maxSpeedKph: '60' },
      { date: '2026-09-30', distanceMeters: '99999999999', durationSeconds: '1800', maxSpeedKph: '60' },
    ])
    const stats = computeMonthStatistics(report, { today: TODAY })
    expect(stats.status).toBe('partial')
    expect(stats.issues.some((issue) => issue.code === 'OUT_OF_RANGE')).toBe(true)
  })

  it('空统计（尚未同步）不返回 0 里程', () => {
    const stats = emptyMonthStatistics(MONTH, TODAY)
    expect(stats.totalDistanceKm).toBeNull()
    expect(stats.status).toBe('unavailable')
  })
})
