import type { DateKey, MonthKey, VehicleRef } from '../domain/identifiers'
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
} from '../domain/models'

/**
 * 骑行数据源契约。
 *
 * 当前实现是 `CfMotoDataSource`（直连官方接口）；未来接入自建 Server 时新增
 * `ServerDataSource` 即可，页面与业务逻辑不感知差异。
 *
 * 每个接口对应的标识符要求见方法注释 —— 这是本项目最容易出错的地方。
 */

export type VerificationStatus = 'verified' | 'unverified'

export interface RideDataSourceCapabilities {
  /** 月报：官方接口只支持按 `yyyy-MM` 单月查询，因此 earliest 由 firstBindDate 推断。 */
  readonly monthReport: {
    readonly available: boolean
    readonly status: VerificationStatus
    readonly supportsArbitraryMonth: boolean
    readonly note: string
  }
  readonly dayStats: {
    readonly available: boolean
    readonly status: VerificationStatus
    readonly note: string
  }
  /** 急加速/急减速/急转弯只在单日统计接口里出现。 */
  readonly rapidEvents: {
    readonly available: boolean
    readonly viaDayStats: boolean
    readonly note: string
  }
  readonly vehicleState: {
    readonly available: boolean
    readonly status: VerificationStatus
  }
  readonly history: {
    readonly available: boolean
    readonly status: VerificationStatus
    readonly note: string
  }
  /** 官方没有年报/历史总报告接口，必须由月报聚合。 */
  readonly aggregatedReports: {
    readonly source: 'monthly-aggregation'
    readonly note: string
  }
}

export interface RideDataSource {
  readonly sourceId: string
  readonly capabilities: RideDataSourceCapabilities

  /** 车辆列表。合并 `/vehicle/list`（vehicleId）与 `/vehicle/option`（deviceId）。 */
  listVehicles(): Promise<Vehicle[]>

  /** 车辆状态总览。按 `vin` 查询。 */
  getVehicleState(ref: VehicleRef): Promise<VehicleState>

  /** 实时车况：油量、信号、电压、位置与最近行程。 */
  getVehicleTelemetry(ref: VehicleRef): Promise<VehicleTelemetry>

  /** 月度报表。官方要求传车辆简表的 `deviceId`（T-Box 号）。 */
  getMonthReport(ref: VehicleRef, month: MonthKey): Promise<MonthRideReport>

  /** 月度油耗。官方要求传车辆简表的 `deviceId`（T-Box 号）。 */
  getMonthlyFuel(ref: VehicleRef, month: MonthKey): Promise<MonthlyFuelConsumption>

  /** 单日统计。官方要求传车辆列表的 `vehicleId`，`date` 为 epoch 毫秒。 */
  getDayStats(ref: VehicleRef, date: DateKey): Promise<DayRideStats>

  /** 单次行程列表。`deviceId` 传 T-Box 号。 */
  listRideHistory(ref: VehicleRef, query: RideHistoryQuery): Promise<Paged<RideHistoryItem>>

  /** 单次行程详情。 */
  getRideHistoryDetail(ref: VehicleRef, id: string): Promise<RideHistoryDetail>
}
