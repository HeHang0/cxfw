/**
 * 标识符类型与车辆标识模型。
 *
 * 春风官方接口里同时存在三种车辆标识，含义和用途完全不同，混用会导致接口 4xx/500：
 * - `vehicleId`：`/cfmotoservervehicle/app/vehicle/list` 返回的"真实 id"。
 *   用于 `/app/ride/report/v2`（单日统计）与 `/app/ridehistory/**` 的 `deviceId` 参数。
 * - `deviceId`：`/cfmotoservervehicle/app/vehicle/option` 返回的 T-Box 设备号。
 *   用于 `/app/ride/report/list/month`（月度报表）的 `deviceId` 参数，并写入 Cookie 的 `vehicle_id`。
 * - `vin`：车架号。用于 `/app/vehicle/state/overview/v2`，也是合并两份车辆数据的关键字段。
 */

/** `yyyy-MM`，例如 `2026-10`。 */
export type MonthKey = `${number}-${number}`

/** `yyyy-MM-dd`，例如 `2026-10-16`。 */
export type DateKey = `${number}-${number}-${number}`

/** `yyyy-MM-dd HH:mm:ss`，行程列表接口使用的格式。 */
export type DateTimeText = `${number}-${number}-${number} ${number}:${number}:${number}`

/**
 * 调用骑行相关接口所需的最小车辆标识集合。
 * 只有同时具备三种标识的车辆才能作为完整数据源目标，见 `toVehicleRef`。
 */
export interface VehicleRef {
  /** 车辆列表接口返回的真实 id。 */
  readonly vehicleId: string
  /** T-Box 设备号（车辆简表）。 */
  readonly deviceId: string
  /** 车架号。 */
  readonly vin: string
  /**
   * `/app/vehicle/list` 的 15 位设备编号。
   * `/app/vehicle/detail` 只接受它作为 `deviceName`，不能传 vin 或 deviceId。
   */
  readonly equipmentNum?: string | null
  /** 车辆绑定月份（来自车辆简表 `bindDate`），是月报和同步范围的硬下界。 */
  readonly bindMonth?: MonthKey | null
}

export function vehicleRefKey(ref: VehicleRef): string {
  return `${ref.vehicleId}:${ref.deviceId}`
}

export function sameVehicleRef(a: VehicleRef | null, b: VehicleRef | null): boolean {
  if (!a || !b) return a === b
  return a.vehicleId === b.vehicleId && a.deviceId === b.deviceId && a.vin === b.vin
}
