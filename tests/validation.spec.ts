import { describe, expect, it } from 'vitest'
import { parseVehicleTotalMileageKm } from '@/core/domain/validation'
import type { MonthKey } from '@/core/domain/identifiers'
import { makeMonthReport } from './helpers/fixtures'

const MONTH = '2026-10' as MonthKey

describe('月报校验与归一化', () => {
  it('把 intraday_mileage（米）换算成公里', () => {
    const report = makeMonthReport(MONTH, [
      { date: '2026-10-16', distanceMeters: '57400.00', durationSeconds: '5412', maxSpeedKph: '116.00' },
    ])
    expect(report.days).toHaveLength(1)
    expect(report.days[0]?.distanceKm).toBe(57.4)
    expect(report.days[0]?.durationSeconds).toBe(5412)
    expect(report.days[0]?.maxSpeedKph).toBe(116)
  })

  it('无法解析的指标保留为 null，而不是 0', () => {
    const report = makeMonthReport(MONTH, [
      { date: '2026-10-01', distanceMeters: '', durationSeconds: null, maxSpeedKph: 'abc' },
    ])
    // 三个指标全部无法解析 → 整行丢弃
    expect(report.days).toHaveLength(0)
  })

  it('部分字段缺失时保留已知值', () => {
    const report = makeMonthReport(MONTH, [
      { date: '2026-10-02', distanceMeters: '10000', durationSeconds: null, maxSpeedKph: null },
    ])
    expect(report.days[0]?.distanceKm).toBe(10)
    expect(report.days[0]?.durationSeconds).toBeNull()
    expect(report.days[0]?.maxSpeedKph).toBeNull()
  })

  it('丢弃不属于该月份的日期并记录问题', () => {
    const report = makeMonthReport(MONTH, [
      { date: '2026-09-30', distanceMeters: '1000', durationSeconds: '60', maxSpeedKph: '20' },
    ])
    expect(report.days).toHaveLength(0)
    expect(report.issues.some((issue) => issue.code === 'DAY_OUTSIDE_MONTH')).toBe(true)
  })

  it('重复日期只保留第一条', () => {
    const report = makeMonthReport(MONTH, [
      { date: '2026-10-03', distanceMeters: '1000', durationSeconds: '60', maxSpeedKph: '20' },
      { date: '2026-10-03', distanceMeters: '9000', durationSeconds: '600', maxSpeedKph: '30' },
    ])
    expect(report.days).toHaveLength(1)
    expect(report.days[0]?.distanceKm).toBe(1)
    expect(report.issues.some((issue) => issue.code === 'DUPLICATE_DAY')).toBe(true)
  })

  it('异常数值被排除并记录 OUT_OF_RANGE', () => {
    const report = makeMonthReport(MONTH, [
      { date: '2026-10-04', distanceMeters: '9999999000', durationSeconds: '60', maxSpeedKph: '9999' },
    ])
    expect(report.days[0]?.distanceKm).toBeNull()
    expect(report.days[0]?.maxSpeedKph).toBeNull()
    expect(report.issues.filter((issue) => issue.code === 'OUT_OF_RANGE').length).toBeGreaterThanOrEqual(2)
  })

  it('负数里程被视为非法值', () => {
    const report = makeMonthReport(MONTH, [
      { date: '2026-10-05', distanceMeters: '-100', durationSeconds: '60', maxSpeedKph: '20' },
    ])
    expect(report.days[0]?.distanceKm).toBeNull()
    expect(report.issues.some((issue) => issue.code === 'NEGATIVE_VALUE')).toBe(true)
  })
})

describe('total_mileage 解析为车辆累计总里程', () => {
  it('按 km 解析（实测样例 9434.8）', () => {
    expect(parseVehicleTotalMileageKm('9434.8')).toBe(9434.8)
    expect(parseVehicleTotalMileageKm('0')).toBe(0)
  })

  it('非法值返回 null', () => {
    expect(parseVehicleTotalMileageKm('abc')).toBeNull()
    expect(parseVehicleTotalMileageKm('')).toBeNull()
    expect(parseVehicleTotalMileageKm('-5')).toBeNull()
    expect(parseVehicleTotalMileageKm(null)).toBeNull()
  })

  it('月报把 total_mileage 记为累计总里程，且不当成当月合计', () => {
    const report = makeMonthReport(
      MONTH,
      [{ date: '2026-10-01', distanceMeters: '1000', durationSeconds: '60', maxSpeedKph: '20' }],
      { reportedTotalRaw: '9434.8' },
    )
    expect(report.vehicleTotalMileageKm).toBe(9434.8)
    expect(report.vehicleTotalMileageRaw).toBe('9434.8')
    // 不当成当月合计，因此不再产生"汇总值不一致"的问题记录
    expect(report.issues.some((issue) => issue.code === 'UNKNOWN_UNIT')).toBe(false)
    expect(report.issues.some((issue) => issue.code === 'INCONSISTENT_TOTAL')).toBe(false)
  })

  it('月报的按天记录直接读取急事件字段', () => {
    const report = makeMonthReport(MONTH, [
      {
        date: '2026-10-16',
        distanceMeters: '57400.00',
        durationSeconds: '5412',
        maxSpeedKph: '116.00',
        rapidAcceleration: 1,
        rapidDeceleration: 2,
        rapidTurn: 0,
      },
    ])
    expect(report.days[0]?.rapidAcceleration).toBe(1)
    expect(report.days[0]?.rapidDeceleration).toBe(2)
    expect(report.days[0]?.rapidTurn).toBe(0)
  })

  it('firstBindDate 解析为最早可查询月份', () => {
    const report = makeMonthReport(MONTH, [], { firstBindMonth: '2025-09' })
    expect(report.firstBindMonth).toBe('2025-09')
  })
})
