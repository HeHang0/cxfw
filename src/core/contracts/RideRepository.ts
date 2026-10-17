import type { MonthKey } from '../domain/identifiers'
import type { MonthRideReport, RefuelRecord, UserProfile, Vehicle } from '../domain/models'

/**
 * 骑行数据仓储契约。
 *
 * 当前实现 `UniRideRepository` 使用 uni-app 本地存储，按"车辆 + 月份"分别缓存月报；
 * 未来 `ServerRideRepository` 改为调用自建 Server，页面同样无需改动。
 */

export interface ReportCacheKey {
  readonly vehicleId: string
  readonly month: MonthKey
}

export interface FuelSettings {
  readonly tankCapacityLiters: number
}

export interface FailedMonth {
  readonly month: MonthKey
  readonly code: string
  readonly message: string
  readonly at: string
}

export interface VehicleSyncState {
  readonly vehicleId: string
  readonly deviceId: string | null
  readonly lastSyncedAt: string | null
  /** 已成功同步的月份。 */
  readonly syncedMonths: readonly MonthKey[]
  /** 官方返回"没有骑行记录"的月份。 */
  readonly emptyMonths: readonly MonthKey[]
  readonly failedMonths: readonly FailedMonth[]
  /** 由 firstBindDate 推断的最早可查询月份。 */
  readonly earliestMonth: MonthKey | null
}

export interface RideRepository {
  loadVehicles(): Vehicle[]
  saveVehicles(vehicles: readonly Vehicle[]): void

  loadActiveVehicleId(): string | null
  saveActiveVehicleId(vehicleId: string | null): void

  loadMonthReport(key: ReportCacheKey): MonthRideReport | null
  saveMonthReport(report: MonthRideReport): void
  removeMonthReport(key: ReportCacheKey): void
  listCachedMonths(vehicleId: string): MonthKey[]
  loadMonthReports(vehicleId: string, months: readonly MonthKey[]): Map<MonthKey, MonthRideReport | null>

  loadSyncState(vehicleId: string): VehicleSyncState | null
  saveSyncState(state: VehicleSyncState): void

  loadProfile(): UserProfile | null
  saveProfile(profile: UserProfile): void

  loadRefuelRecords(vehicleId: string): RefuelRecord[]
  saveRefuelRecords(vehicleId: string, records: readonly RefuelRecord[]): void
  loadFuelSettings(vehicleId: string): FuelSettings | null
  saveFuelSettings(vehicleId: string, settings: FuelSettings): void

  clearVehicleData(vehicleId: string): void
}

export function emptySyncState(vehicleId: string, deviceId: string | null): VehicleSyncState {
  return {
    vehicleId,
    deviceId,
    lastSyncedAt: null,
    syncedMonths: [],
    emptyMonths: [],
    failedMonths: [],
    earliestMonth: null,
  }
}
