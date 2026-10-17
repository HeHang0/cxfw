import type { RideDataSource, RideDataSourceCapabilities } from '@/core/contracts/RideDataSource'
import type { DateKey, MonthKey, VehicleRef } from '@/core/domain/identifiers'
import type {
  DayRideStats,
  MonthRideReport,
  MonthlyFuelConsumption,
  Paged,
  RideHistoryDetail,
  RideHistoryItem,
  RideHistoryQuery,
  Vehicle,
  VehicleState,
  VehicleTelemetry,
} from '@/core/domain/models'
import { AppError } from '@/core/application/errors'

/**
 * 未来自建 Server 数据源的接入点。
 *
 * 这里只保留签名与能力声明，**没有**臆造任何服务端接口：
 * Server 端 API 尚未设计，因此每个方法都抛出 NOT_IMPLEMENTED 并给出需要确认的信息。
 * 页面与用例已经只依赖 `RideDataSource` 接口，接入时只需替换 container 里的装配。
 *
 * 见 ./README.md 中的接入清单。
 */

export interface ServerDataSourceConfig {
  readonly baseUrl: string
  /** 自建 Server 的鉴权方式尚未确定（自签 token / 微信登录换取），因此留空。 */
  readonly authToken: string | null
  readonly timeoutMs: number
}

export const SERVER_ENDPOINTS_PENDING =
  '自建 Server 的接口路径、鉴权方式、响应结构均未设计；api.yaml 只描述官方接口'

export class ServerRideDataSource implements RideDataSource {
  readonly sourceId = 'server'
  readonly capabilities: RideDataSourceCapabilities = {
    monthReport: {
      available: false,
      status: 'unverified',
      supportsArbitraryMonth: true,
      note: `待实现：${SERVER_ENDPOINTS_PENDING}`,
    },
    dayStats: { available: false, status: 'unverified', note: `待实现：${SERVER_ENDPOINTS_PENDING}` },
    rapidEvents: { available: false, viaDayStats: true, note: `待实现：${SERVER_ENDPOINTS_PENDING}` },
    vehicleState: { available: false, status: 'unverified' },
    history: { available: false, status: 'unverified', note: `待实现：${SERVER_ENDPOINTS_PENDING}` },
    aggregatedReports: {
      source: 'monthly-aggregation',
      note: '统计仍然只依赖月报，Server 端不需要重复维护年度/历史汇总',
    },
  }

  private readonly config: ServerDataSourceConfig

  constructor(config: ServerDataSourceConfig) {
    this.config = config
  }

  getConfig(): ServerDataSourceConfig {
    return this.config
  }

  listVehicles(): Promise<Vehicle[]> {
    return this.notImplemented('listVehicles')
  }

  getVehicleState(_ref: VehicleRef): Promise<VehicleState> {
    return this.notImplemented('getVehicleState')
  }

  getVehicleTelemetry(_ref: VehicleRef): Promise<VehicleTelemetry> {
    return this.notImplemented('getVehicleTelemetry')
  }

  getMonthReport(_ref: VehicleRef, _month: MonthKey): Promise<MonthRideReport> {
    return this.notImplemented('getMonthReport')
  }

  getMonthlyFuel(_ref: VehicleRef, _month: MonthKey): Promise<MonthlyFuelConsumption> {
    return this.notImplemented('getMonthlyFuel')
  }

  getDayStats(_ref: VehicleRef, _date: DateKey): Promise<DayRideStats> {
    return this.notImplemented('getDayStats')
  }

  listRideHistory(_ref: VehicleRef, _query: RideHistoryQuery): Promise<Paged<RideHistoryItem>> {
    return this.notImplemented('listRideHistory')
  }

  getRideHistoryDetail(
    _ref: VehicleRef,
    _id: string,
  ): Promise<RideHistoryDetail> {
    return this.notImplemented('getRideHistoryDetail')
  }

  private notImplemented(method: string): Promise<never> {
    return Promise.reject(
      new AppError(`自建 Server 数据源的 ${method} 尚未实现`, {
        code: 'NOT_IMPLEMENTED',
        hint: SERVER_ENDPOINTS_PENDING,
      }),
    )
  }
}
