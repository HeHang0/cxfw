import type { FuelSettings, ReportCacheKey, RideRepository, VehicleSyncState } from '@/core/contracts/RideRepository'
import type { MonthKey } from '@/core/domain/identifiers'
import type { MonthRideReport, RefuelRecord, UserProfile, Vehicle } from '@/core/domain/models'
import { AppError } from '@/core/application/errors'

/**
 * 未来自建 Server 仓储的接入点（服务端数据库缓存月报）。
 *
 * 与 `ServerRideDataSource` 一样，这里不臆造服务端接口，只固定契约形状。
 */

export const SERVER_REPOSITORY_PENDING =
  '自建 Server 的存储接口未设计；接入时把这里改成调用服务端 API，页面与用例无需改动'

export class ServerRideRepository implements RideRepository {
  loadVehicles(): Vehicle[] {
    return []
  }

  saveVehicles(_vehicles: readonly Vehicle[]): void {
    this.notImplemented('saveVehicles')
  }

  loadActiveVehicleId(): string | null {
    return null
  }

  saveActiveVehicleId(_vehicleId: string | null): void {
    this.notImplemented('saveActiveVehicleId')
  }

  loadMonthReport(_key: ReportCacheKey): MonthRideReport | null {
    return null
  }

  saveMonthReport(_report: MonthRideReport): void {
    this.notImplemented('saveMonthReport')
  }

  removeMonthReport(_key: ReportCacheKey): void {
    this.notImplemented('removeMonthReport')
  }

  listCachedMonths(_vehicleId: string): MonthKey[] {
    return []
  }

  loadMonthReports(_vehicleId: string, _months: readonly MonthKey[]): Map<MonthKey, MonthRideReport | null> {
    return new Map()
  }

  loadSyncState(_vehicleId: string): VehicleSyncState | null {
    return null
  }

  saveSyncState(_state: VehicleSyncState): void {
    this.notImplemented('saveSyncState')
  }

  loadProfile(): UserProfile | null {
    return null
  }

  saveProfile(_profile: UserProfile): void {
    this.notImplemented('saveProfile')
  }

  loadRefuelRecords(_vehicleId: string): RefuelRecord[] {
    return []
  }

  saveRefuelRecords(_vehicleId: string, _records: readonly RefuelRecord[]): void {
    this.notImplemented('saveRefuelRecords')
  }

  loadFuelSettings(_vehicleId: string): FuelSettings | null {
    return null
  }

  saveFuelSettings(_vehicleId: string, _settings: FuelSettings): void {
    this.notImplemented('saveFuelSettings')
  }

  clearVehicleData(_vehicleId: string): void {
    this.notImplemented('clearVehicleData')
  }

  private notImplemented(method: string): never {
    throw new AppError(`自建 Server 仓储的 ${method} 尚未实现`, {
      code: 'NOT_IMPLEMENTED',
      hint: SERVER_REPOSITORY_PENDING,
    })
  }
}
