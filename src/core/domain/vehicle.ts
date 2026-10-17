import type { VehicleRef } from './identifiers'
import type { Vehicle } from './models'
import { extractMonthKey } from './datetime'

/** 只有三种标识齐全的车辆才能调用全部骑行接口。 */
export function toVehicleRef(vehicle: Vehicle): VehicleRef | null {
  if (!vehicle.vehicleId || !vehicle.deviceId || !vehicle.vin) return null
  return {
    vehicleId: vehicle.vehicleId,
    deviceId: vehicle.deviceId,
    vin: vehicle.vin,
    equipmentNum: vehicle.equipmentNum,
    bindMonth: extractMonthKey(vehicle.bindDate),
  }
}

export function missingRefFields(vehicle: Vehicle): string[] {
  const missing: string[] = []
  if (!vehicle.vehicleId) missing.push('vehicleId')
  if (!vehicle.deviceId) missing.push('deviceId')
  if (!vehicle.vin) missing.push('vin')
  return missing
}

/**
 * 按 `vin` 合并两份官方车辆数据：
 * `/app/vehicle/list`（提供 vehicleId）与 `/app/vehicle/option`（提供 deviceId）。
 */
export function mergeVehicleInfo(primary: Vehicle, secondary: Vehicle): Vehicle {
  if (primary.vin !== secondary.vin) {
    throw new Error('只能合并同一 vin 的车辆记录')
  }
  return {
    vehicleId: primary.vehicleId ?? secondary.vehicleId,
    deviceId: primary.deviceId ?? secondary.deviceId,
    vin: primary.vin,
    equipmentNum: primary.equipmentNum ?? secondary.equipmentNum,
    model: primary.model ?? secondary.model,
    imageUrl: primary.imageUrl ?? secondary.imageUrl,
    bindDate: primary.bindDate ?? secondary.bindDate,
  }
}

export function mergeVehicleLists(primary: readonly Vehicle[], secondary: readonly Vehicle[]): Vehicle[] {
  const byVin = new Map<string, Vehicle>()
  for (const vehicle of primary) byVin.set(vehicle.vin, vehicle)
  for (const vehicle of secondary) {
    const existing = byVin.get(vehicle.vin)
    byVin.set(vehicle.vin, existing ? mergeVehicleInfo(existing, vehicle) : vehicle)
  }
  return [...byVin.values()]
}
