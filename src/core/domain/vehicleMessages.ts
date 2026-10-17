const VEHICLE_MESSAGE_LABELS: Readonly<Record<string, string>> = {
  '2': '震动报警',
  '3': '燃油不足报警',
  '12': '车辆长时间未骑行提醒',
  '14': '异常时间行驶通知',
  '15': '疲劳驾驶提醒',
  '17': '发动机转速过高通知',
  '18': '发动机水温过高通知',
}

export function vehicleMessageLabel(type: string): string {
  return VEHICLE_MESSAGE_LABELS[type] ?? `提醒类型 ${type}`
}
