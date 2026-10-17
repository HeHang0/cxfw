import type { Clock } from '../contracts/Clock'
import type { RideDataSource } from '../contracts/RideDataSource'
import type { RideRepository } from '../contracts/RideRepository'
import { createIssue } from '../domain/issues'
import type { VehicleRef } from '../domain/identifiers'
import type { Vehicle, VehicleState, VehicleTelemetry } from '../domain/models'
import { missingRefFields, toVehicleRef } from '../domain/vehicle'
import { createLogger, silentLogger, type Logger } from '../shared/logger'
import { AppError, toAppError } from './errors'
import { errorResult, okResult, partialResult, type DataResult } from './results'

/**
 * 车辆用例：列表、缓存、当前选中车辆、车辆状态。
 *
 * 车辆标识的完整性在这里把关：只有 vehicleId + deviceId + vin 齐全的车才返回 `ref`，
 * 否则页面能明确看到"缺少哪个标识"，而不是发出必然失败的请求。
 */

export interface VehicleServiceDeps {
  readonly dataSource: RideDataSource
  readonly repository: RideRepository
  readonly clock: Clock
  readonly logger?: Logger
}

export interface VehicleListItem {
  readonly vehicle: Vehicle
  readonly ref: VehicleRef | null
  readonly missingFields: readonly string[]
}

export class VehicleService {
  private readonly deps: VehicleServiceDeps
  private readonly logger: Logger

  constructor(deps: VehicleServiceDeps) {
    this.deps = deps
    this.logger = deps.logger ?? silentLogger
  }

  loadCachedVehicles(): VehicleListItem[] {
    return this.decorate(this.deps.repository.loadVehicles())
  }

  async listVehicles(options: { refresh?: boolean } = {}): Promise<DataResult<VehicleListItem[]>> {
    const cached = this.deps.repository.loadVehicles()
    if (!options.refresh && cached.length > 0) {
      return okResult(this.decorate(cached), { fromCache: true })
    }
    try {
      const vehicles = await this.deps.dataSource.listVehicles()
      this.deps.repository.saveVehicles(vehicles)
      const items = this.decorate(vehicles)
      const incomplete = items.filter((item) => item.ref === null)
      const issues = incomplete.map((item) =>
        createIssue('MISSING_FIELD', `车辆 ${item.vehicle.vin} 缺少标识：${item.missingFields.join('、')}`, {
          path: 'vehicles',
          value: item.vehicle.vin,
        }),
      )
      return issues.length > 0
        ? partialResult(items, { issues })
        : okResult(items)
    } catch (error) {
      const appError = toAppError(error)
      this.logger.warn('获取车辆列表失败', { code: appError.code, message: appError.message })
      if (cached.length > 0) {
        // 网络失败时保留已有缓存，页面仍可查看历史数据。
        return partialResult(this.decorate(cached), {
          fromCache: true,
          failedMonths: [],
          issues: [
            createIssue('PARTIAL_DATA', `车辆列表刷新失败，显示本地缓存（${appError.message}）`, { path: 'vehicles' }),
          ],
        })
      }
      return errorResult(appError)
    }
  }

  getActiveVehicleId(): string | null {
    return this.deps.repository.loadActiveVehicleId()
  }

  getActiveRef(): VehicleRef | null {
    const vehicles = this.deps.repository.loadVehicles()
    const activeId = this.deps.repository.loadActiveVehicleId()
    if (vehicles.length === 0) return null
    if (activeId === null) {
      const first = vehicles[0]
      return first ? toVehicleRef(first) : null
    }
    const selected = vehicles.find((vehicle) => vehicle.vehicleId === activeId)
    return selected ? toVehicleRef(selected) : null
  }

  selectVehicle(vehicleId: string | null): void {
    this.deps.repository.saveActiveVehicleId(vehicleId)
  }

  /** 选中车辆必须能构造出完整 `VehicleRef`，否则抛出可展示的错误。 */
  requireActiveRef(): VehicleRef {
    const ref = this.getActiveRef()
    if (ref) return ref
    const vehicles = this.deps.repository.loadVehicles()
    if (vehicles.length === 0) {
      throw new AppError('尚未选择车辆', { code: 'INVALID_INPUT', hint: '请先在车辆页刷新车辆列表' })
    }
    const activeId = this.deps.repository.loadActiveVehicleId()
    const target = vehicles.find((vehicle) => vehicle.vehicleId === activeId) ?? vehicles[0]
    const missing = target ? missingRefFields(target) : []
    throw new AppError('选中车辆缺少调用骑行接口所需的标识', {
      code: 'VEHICLE_INCOMPLETE',
      details: { missing },
      hint: `缺少：${missing.join('、') || '未知'}`,
    })
  }

  async getVehicleState(ref: VehicleRef): Promise<DataResult<VehicleState>> {
    try {
      const state = await this.deps.dataSource.getVehicleState(ref)
      const issues = [...state.issues]
      if (issues.some((issue) => issue.severity === 'error')) {
        return partialResult(state, { issues })
      }
      return issues.length > 0 ? partialResult(state, { issues }) : okResult(state)
    } catch (error) {
      const appError = toAppError(error)
      this.logger.warn('获取车辆状态失败', { code: appError.code, message: appError.message })
      return errorResult(appError)
    }
  }

  async getVehicleTelemetry(ref: VehicleRef): Promise<DataResult<VehicleTelemetry>> {
    try {
      const telemetry = await this.deps.dataSource.getVehicleTelemetry(ref)
      if (telemetry.issues.length > 0) {
        return partialResult(telemetry, { issues: [...telemetry.issues] })
      }
      return okResult(telemetry)
    } catch (error) {
      const appError = toAppError(error)
      this.logger.warn('获取实时车况失败', { code: appError.code, message: appError.message })
      return errorResult(appError)
    }
  }

  getArchiveSummary(): { ref: VehicleRef | null; vehicle: Vehicle | null; cachedMonths: string[] } {
    const vehicles = this.deps.repository.loadVehicles()
    const ref = this.getActiveRef()
    const vehicle = ref
      ? vehicles.find((item) => item.vehicleId === ref.vehicleId) ?? null
      : vehicles[0] ?? null
    const cachedMonths = ref ? this.deps.repository.listCachedMonths(ref.vehicleId) : []
    return { ref, vehicle, cachedMonths }
  }

  private decorate(vehicles: readonly Vehicle[]): VehicleListItem[] {
    return vehicles.map((vehicle) => ({
      vehicle,
      ref: toVehicleRef(vehicle),
      missingFields: missingRefFields(vehicle),
    }))
  }
}

export function createVehicleService(deps: VehicleServiceDeps): VehicleService {
  return new VehicleService({ ...deps, logger: deps.logger ?? createLogger({ scope: 'vehicle' }) })
}

