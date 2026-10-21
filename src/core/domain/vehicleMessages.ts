const VEHICLE_MESSAGE_LABELS: Readonly<Record<string, string>> = {
  '2': '震动报警',
  '3': '燃油不足报警',
  '12': '车辆长时间未骑行提醒',
  '14': '异常时间行驶通知',
  '15': '疲劳驾驶提醒',
  '17': '发动机转速过高通知',
  '18': '发动机水温过高通知',
  crashRescue: '摔车提醒',
}

export function vehicleMessageLabel(type: string): string {
  return VEHICLE_MESSAGE_LABELS[type] ?? `提醒类型 ${type}`
}

/**
 * 提醒阈值单位：
 * - type 2 震动报警使用 100 制；
 * - type 3 燃油不足使用格；
 * - type 12 长时间未骑行使用天；
 * - type 15 疲劳驾驶使用小时。
 */
export function vehicleMessageThresholdText(type: string, threshold: string | null): string | null {
  if (type === 'crashRescue') {
    return '不幸发生摔车事故后，春风团队将立即致电'
  }

  const value = threshold?.trim()
  if (!value) return null
  const numericValue = Number(value)
  if (Number.isFinite(numericValue) && numericValue === 0) return null

  switch (type) {
    case '2':
      return `${value} / 100`
    case '3':
      return `${value} 格`
    case '12':
      return `${value} 天`
    case '15':
      return `${value} 小时`
    default:
      return null
  }
}
