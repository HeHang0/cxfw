import type { KeyValueStore } from '@/core/contracts/KeyValueStore'
import type { FuelSettings, ReportCacheKey, RideRepository, VehicleSyncState } from '@/core/contracts/RideRepository'
import { compareMonth } from '@/core/domain/datetime'
import type { MonthKey } from '@/core/domain/identifiers'
import type { MonthRideReport, RefuelRecord, UserProfile, Vehicle } from '@/core/domain/models'
import { ScopedKeyValueStore } from './UniKeyValueStore'
import { parseMonthStorageKey, storageKeys } from './storageKeys'

/**
 * 本地存储实现的骑行仓储。
 *
 * 存储结构：
 * - 车辆与选中车辆：`cfmoto:v1:vehicles`、`cfmoto:v1:active-vehicle`
 * - 月报：`cfmoto:v1:month:<vehicleId>:<yyyy-MM>`（按车辆 + 月份分别缓存）
 * - 同步状态：`cfmoto:v1:sync:<vehicleId>`
 *
 * 页面与用例只依赖 `RideRepository` 接口，未来替换成 `ServerRideRepository` 不需要改动它们。
 */

export interface UniRideRepositoryOptions {
  readonly store: KeyValueStore
}

export class UniRideRepository implements RideRepository {
  private readonly baseStore: KeyValueStore
  private store: KeyValueStore

  constructor(options: UniRideRepositoryOptions) {
    this.baseStore = options.store
    this.store = options.store
  }

  setNamespace(prefix = ''): void {
    this.store = prefix === '' ? this.baseStore : new ScopedKeyValueStore(this.baseStore, prefix)
  }

  loadVehicles(): Vehicle[] {
    return this.store.get<Vehicle[]>(storageKeys.vehicles) ?? []
  }

  saveVehicles(vehicles: readonly Vehicle[]): void {
    this.store.set(storageKeys.vehicles, [...vehicles])
  }

  loadActiveVehicleId(): string | null {
    return this.store.get<string>(storageKeys.activeVehicleId)
  }

  saveActiveVehicleId(vehicleId: string | null): void {
    if (vehicleId === null) this.store.remove(storageKeys.activeVehicleId)
    else this.store.set(storageKeys.activeVehicleId, vehicleId)
  }

  loadMonthReport(key: ReportCacheKey): MonthRideReport | null {
    const report = this.store.get<MonthRideReport>(storageKeys.month(key.vehicleId, key.month))
    if (!report) return null
    // 车辆不匹配的缓存视为脏数据，避免切换车辆后读到别人的里程。
    if (report.vehicleId !== '' && report.vehicleId !== key.vehicleId) return null
    if (report.month !== key.month) return null
    return report
  }

  saveMonthReport(report: MonthRideReport): void {
    this.store.set(storageKeys.month(report.vehicleId, report.month), report)
  }

  removeMonthReport(key: ReportCacheKey): void {
    this.store.remove(storageKeys.month(key.vehicleId, key.month))
  }

  listCachedMonths(vehicleId: string): MonthKey[] {
    const prefix = storageKeys.monthPrefix(vehicleId)
    const months: MonthKey[] = []
    for (const key of this.store.keys(prefix)) {
      const parsed = parseMonthStorageKey(key)
      if (!parsed || parsed.vehicleId !== vehicleId || parsed.month === '') continue
      months.push(parsed.month as MonthKey)
    }
    return [...new Set(months)].sort(compareMonth)
  }

  loadMonthReports(vehicleId: string, months: readonly MonthKey[]): Map<MonthKey, MonthRideReport | null> {
    const map = new Map<MonthKey, MonthRideReport | null>()
    for (const month of months) {
      const report = this.loadMonthReport({ vehicleId, month })
      if (report) map.set(month, report)
    }
    return map
  }

  loadSyncState(vehicleId: string): VehicleSyncState | null {
    return this.store.get<VehicleSyncState>(storageKeys.sync(vehicleId))
  }

  saveSyncState(state: VehicleSyncState): void {
    this.store.set(storageKeys.sync(state.vehicleId), state)
  }

  loadProfile(): UserProfile | null {
    return this.store.get<UserProfile>(storageKeys.profile)
  }

  saveProfile(profile: UserProfile): void {
    this.store.set(storageKeys.profile, profile)
  }

  loadRefuelRecords(vehicleId: string): RefuelRecord[] {
    const raw = this.store.get<Array<Record<string, unknown>>>(storageKeys.refuels(vehicleId)) ?? []
    return raw.flatMap((item) => {
      const time = typeof item['time'] === 'string' ? item['time'] : item['refueledAt']
      const liters = Number(item['liters'])
      if (typeof time !== 'string' || !Number.isFinite(liters) || liters <= 0) return []
      const rawPrice = item['price'] ?? item['pricePaidYuan']
      const price = Number(rawPrice)
      const grade = item['grade'] ?? item['priceGrade']
      return [
        {
          time: time as RefuelRecord['time'],
          liters,
          price: Number.isFinite(price) && price > 0 ? price : null,
          grade: typeof grade === 'string' ? grade : null,
        },
      ]
    })
  }

  saveRefuelRecords(vehicleId: string, records: readonly RefuelRecord[]): void {
    this.store.set(
      storageKeys.refuels(vehicleId),
      records.map((record) => ({
        time: record.time,
        liters: record.liters,
        price: record.price,
        grade: record.grade,
      })),
    )
  }

  loadFuelSettings(vehicleId: string): FuelSettings | null {
    return this.store.get<FuelSettings>(storageKeys.fuelSettings(vehicleId))
  }

  saveFuelSettings(vehicleId: string, settings: FuelSettings): void {
    this.store.set(storageKeys.fuelSettings(vehicleId), settings)
  }

  clearVehicleData(vehicleId: string): void {
    for (const key of this.store.keys(storageKeys.monthPrefix(vehicleId))) {
      this.store.remove(key)
    }
    this.store.remove(storageKeys.sync(vehicleId))
    this.store.remove(storageKeys.refuels(vehicleId))
    this.store.remove(storageKeys.fuelSettings(vehicleId))
  }
}
