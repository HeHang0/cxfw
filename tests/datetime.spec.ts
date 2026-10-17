import { describe, expect, it } from 'vitest'
import {
  addMonths,
  dateKeyToEpochMs,
  daysInMonth,
  elapsedDaysInMonth,
  enumerateDates,
  enumerateMonths,
  extractMonthKey,
  formatDate,
  isDateKey,
  isMonthFinished,
  isMonthKey,
  monthOf,
} from '@/core/domain/datetime'
import type { DateKey, MonthKey } from '@/core/domain/identifiers'

describe('日期工具', () => {
  it('校验月份与日期格式', () => {
    expect(isMonthKey('2026-10')).toBe(true)
    expect(isMonthKey('2026-13')).toBe(false)
    expect(isMonthKey('2026-1')).toBe(false)
    expect(isDateKey('2026-10-16')).toBe(true)
    expect(isDateKey('2026-02-30')).toBe(false)
    expect(isDateKey('2026-02-28')).toBe(true)
  })

  it('计算每月天数与到期天数', () => {
    expect(daysInMonth('2024-02' as MonthKey)).toBe(29)
    expect(daysInMonth('2026-02' as MonthKey)).toBe(28)
    expect(elapsedDaysInMonth('2026-10' as MonthKey, '2026-10-05' as DateKey)).toBe(5)
    expect(elapsedDaysInMonth('2026-09' as MonthKey, '2026-10-05' as DateKey)).toBe(30)
    expect(elapsedDaysInMonth('2026-11' as MonthKey, '2026-10-05' as DateKey)).toBe(0)
  })

  it('月份加减与枚举', () => {
    expect(addMonths('2026-01' as MonthKey, -1)).toBe('2025-12')
    expect(addMonths('2026-12' as MonthKey, 1)).toBe('2027-01')
    expect(enumerateMonths('2025-11' as MonthKey, '2026-02' as MonthKey)).toEqual([
      '2025-11',
      '2025-12',
      '2026-01',
      '2026-02',
    ])
    expect(enumerateDates('2026-02' as MonthKey)).toHaveLength(28)
  })

  it('判断月份是否已结束', () => {
    expect(isMonthFinished('2026-09' as MonthKey, '2026-10-17' as DateKey)).toBe(true)
    expect(isMonthFinished('2026-10' as MonthKey, '2026-10-17' as DateKey)).toBe(false)
  })

  it('epoch 毫秒按本地零点换算', () => {
    // 单日统计接口要求 epoch 毫秒，这里保证与本地零点一致。
    expect(dateKeyToEpochMs('2026-10-16' as DateKey)).toBe(new Date(2026, 9, 16, 0, 0, 0, 0).getTime())
    if (new Date(2026, 9, 16).getTimezoneOffset() === -480) {
      // api.yaml 样例：UTC+8 下 2026-10-16 00:00:00 == 1792080000000
      expect(dateKeyToEpochMs('2026-10-16' as DateKey)).toBe(1792080000000)
    }
  })

  it('从接口文本中提取月份', () => {
    expect(extractMonthKey('2025-09')).toBe('2025-09')
    expect(extractMonthKey('2025-09-24 23:37:32')).toBe('2025-09')
    expect(extractMonthKey(undefined)).toBeNull()
  })

  it('本地日期格式化', () => {
    const date = new Date(2026, 9, 5)
    expect(formatDate(date)).toBe('2026-10-05')
    expect(monthOf('2026-10-05' as DateKey)).toBe('2026-10')
  })
})
