import { describe, expect, it } from 'vitest'
import { vehicleMessageLabel, vehicleMessageThresholdText } from '@/core/domain/vehicleMessages'

describe('车辆消息提醒类型映射', () => {
  it('把官方 type 映射为中文名称', () => {
    expect(vehicleMessageLabel('2')).toBe('震动报警')
    expect(vehicleMessageLabel('3')).toBe('燃油不足报警')
    expect(vehicleMessageLabel('12')).toBe('车辆长时间未骑行提醒')
    expect(vehicleMessageLabel('14')).toBe('异常时间行驶通知')
    expect(vehicleMessageLabel('15')).toBe('疲劳驾驶提醒')
    expect(vehicleMessageLabel('17')).toBe('发动机转速过高通知')
    expect(vehicleMessageLabel('18')).toBe('发动机水温过高通知')
    expect(vehicleMessageLabel('crashRescue')).toBe('摔车提醒')
    expect(vehicleMessageLabel('99')).toBe('提醒类型 99')
  })

  it('按提醒类型格式化非空阈值', () => {
    expect(vehicleMessageThresholdText('2', '50')).toBe('50 / 100')
    expect(vehicleMessageThresholdText('3', '2')).toBe('2 格')
    expect(vehicleMessageThresholdText('15', '4')).toBe('4 小时')
    expect(vehicleMessageThresholdText('12', '30')).toBe('30 天')
    expect(vehicleMessageThresholdText('crashRescue', null)).toBe(
      '不幸发生摔车事故后，春风团队将立即致电',
    )
  })

  it('空阈值、零值和其他类型不显示', () => {
    expect(vehicleMessageThresholdText('2', null)).toBeNull()
    expect(vehicleMessageThresholdText('3', '')).toBeNull()
    expect(vehicleMessageThresholdText('15', '  ')).toBeNull()
    expect(vehicleMessageThresholdText('2', '0')).toBeNull()
    expect(vehicleMessageThresholdText('3', '0.0')).toBeNull()
    expect(vehicleMessageThresholdText('12', '00')).toBeNull()
    expect(vehicleMessageThresholdText('14', '7')).toBeNull()
    expect(vehicleMessageThresholdText('99', '7')).toBeNull()
  })
})
