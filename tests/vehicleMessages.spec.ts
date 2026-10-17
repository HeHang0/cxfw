import { describe, expect, it } from 'vitest'
import { vehicleMessageLabel } from '@/core/domain/vehicleMessages'

describe('车辆消息提醒类型映射', () => {
  it('把官方 type 映射为中文名称', () => {
    expect(vehicleMessageLabel('2')).toBe('震动报警')
    expect(vehicleMessageLabel('3')).toBe('燃油不足报警')
    expect(vehicleMessageLabel('12')).toBe('车辆长时间未骑行提醒')
    expect(vehicleMessageLabel('14')).toBe('异常时间行驶通知')
    expect(vehicleMessageLabel('15')).toBe('疲劳驾驶提醒')
    expect(vehicleMessageLabel('17')).toBe('发动机转速过高通知')
    expect(vehicleMessageLabel('18')).toBe('发动机水温过高通知')
    expect(vehicleMessageLabel('99')).toBe('提醒类型 99')
  })
})
