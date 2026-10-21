import type { RideDataSource, RideDataSourceCapabilities } from '@/core/contracts/RideDataSource'
import { dateKeyToEpochMs, endOfDayText, startOfDayText } from '@/core/domain/datetime'
import type { DateKey, MonthKey, VehicleRef } from '@/core/domain/identifiers'
import type {
  CrashRescueSetting,
  Paged,
  RideHistoryDetail,
  RideHistoryItem,
  RideHistoryQuery,
  Vehicle,
  VehicleState,
  VehicleTelemetry,
  DayRideStats,
  MonthRideReport,
  MonthlyFuelConsumption,
} from '@/core/domain/models'
import { createMonthRideReport, createDayRideStats, createVehicle } from '@/core/domain/validation'
import { mergeVehicleLists } from '@/core/domain/vehicle'
import { AppError } from '@/core/application/errors'
import { createLogger, silentLogger, type Logger } from '@/core/shared/logger'
import type { CfMotoApiClient } from './CfMotoApiClient'
import { CFMOTO_PATHS } from './endpoints'
import type {
  DayRideStatsDto,
  MonthRideReportDto,
  MonthlyFuelDto,
  VehicleDetailDto,
  VehicleListDto,
  VehicleNowInfoDto,
  VehicleOverviewDto,
} from './dto'
import {
  monthReportConsistencyIssues,
  toRawDayStatsInput,
  toRawMonthRideInput,
  toRideHistoryDetail,
  toRideHistoryItems,
  toVehicleListInputs,
  toVehicleOptionInputs,
  toCrashRescueSettings,
  toVehicleState,
  toVehicleTelemetry,
  toMonthlyFuelConsumption,
} from './mappers'

/**
 * 官方接口数据源。
 *
 * 关于 `deviceId` 参数的重要区别（api.yaml 明确标注，且容易写错）：
 * - 月报 `/app/ride/report/list/month` 的 `deviceId` = **车辆简表的 T-Box deviceId**
 * - 单日统计 `/app/ride/report/v2` 的 `deviceId` = **车辆列表的 vehicleId**
 * - 行程列表 `/app/ridehistory/list` 的 `deviceId` = **车辆列表的 vehicleId**
 */

export interface CfMotoRideDataSourceDeps {
  readonly client: CfMotoApiClient
  readonly logger?: Logger
  readonly now?: () => Date
}

export const CFMOTO_SOURCE_ID = 'cfmoto'

export class CfMotoRideDataSource implements RideDataSource {
  readonly sourceId = CFMOTO_SOURCE_ID
  readonly capabilities: RideDataSourceCapabilities = {
    monthReport: {
      available: true,
      status: 'verified',
      supportsArbitraryMonth: true,
      note: '按月查询（yyyy-MM），需要车辆简表的 deviceId；最早可查月份由 firstBindDate 推断，api.yaml 未说明可回溯范围',
    },
    dayStats: {
      available: true,
      status: 'verified',
      note: 'deviceId 传 vehicleId，date 传 epoch 毫秒；month_mileage 字段含义未确认，未参与统计',
    },
    rapidEvents: {
      available: true,
      viaDayStats: true,
      note: '急加速/急减速/急转弯只在单日统计接口返回，需要按天补抓',
    },
    vehicleState: { available: true, status: 'verified' },
    history: {
      available: true,
      status: 'unverified',
      note: '接口受理正常但当前账号返回空数组，列表项结构未实测',
    },
    aggregatedReports: {
      source: 'monthly-aggregation',
      note: '官方没有年报/历史总报告接口，全部由月报聚合得到',
    },
  }

  private readonly client: CfMotoApiClient
  private readonly logger: Logger
  private readonly now: () => Date

  constructor(deps: CfMotoRideDataSourceDeps) {
    this.client = deps.client
    this.logger = deps.logger ?? silentLogger
    this.now = deps.now ?? (() => new Date())
  }

  async listVehicles(): Promise<Vehicle[]> {
    const session = this.client.getSession()
    if (!session || session.userId === '') {
      throw new AppError('缺少 userId，无法查询车辆列表', {
        code: 'UNAUTHORIZED',
        hint: '请重新登录后再试',
      })
    }

    const listResult = await this.client.call<VehicleListDto[]>({
      path: CFMOTO_PATHS.vehicleList,
      method: 'GET',
      query: { userId: session.userId },
      requiresAuth: true,
    })
    const optionResult = await this.client.call<unknown>({
      path: CFMOTO_PATHS.vehicleOption,
      method: 'GET',
      requiresAuth: true,
    })

    const fromList = toVehicleListInputs(listResult).map(createVehicle).filter(isVehicle)
    const fromOption = toVehicleOptionInputs(optionResult).map(createVehicle).filter(isVehicle)
    const merged = mergeVehicleLists(fromList, fromOption)

    if (merged.length === 0) {
      this.logger.warn('车辆接口返回空列表')
    }
    const incomplete = merged.filter((vehicle) => !vehicle.vehicleId || !vehicle.deviceId)
    if (incomplete.length > 0) {
      this.logger.warn('存在标识不完整的车辆', { vin: incomplete.map((vehicle) => vehicle.vin) })
    }
    return merged
  }

  async getVehicleState(ref: VehicleRef): Promise<VehicleState> {
    const [dto, crashRescueSettings] = await Promise.all([
      this.client.call<VehicleOverviewDto>({
        path: CFMOTO_PATHS.vehicleStateOverview,
        method: 'GET',
        query: { vin: ref.vin },
        requiresAuth: true,
        deviceId: ref.deviceId,
      }),
      this.getCrashRescueSettings().catch((error: unknown) => {
        this.logger.warn('获取摔车提醒设置失败', {
          message: error instanceof Error ? error.message : String(error),
        })
        return [] as CrashRescueSetting[]
      }),
    ])

    const state = toVehicleState(ref, dto)
    const crashRescue = crashRescueSettings.find(
      (item) => item.vin.trim().toUpperCase() === ref.vin.trim().toUpperCase(),
    )
    if (!crashRescue || crashRescue.enabled === null) return state

    return {
      ...state,
      messageSettings: [
        ...state.messageSettings.filter((item) => item.type !== 'crashRescue'),
        {
          type: 'crashRescue',
          enabled: crashRescue.enabled,
          threshold: null,
        },
      ],
    }
  }

  private async getCrashRescueSettings(): Promise<CrashRescueSetting[]> {
    const dto = await this.client.call<unknown>({
      path: CFMOTO_PATHS.vehicleCrashRescueSettings,
      method: 'GET',
      requiresAuth: true,
    })
    return toCrashRescueSettings(dto)
  }

  async getVehicleTelemetry(ref: VehicleRef): Promise<VehicleTelemetry> {
    if (!ref.equipmentNum) {
      throw new AppError('缺少 equipmentNum，无法查询实时车况', {
        code: 'VEHICLE_INCOMPLETE',
        hint: '请刷新车辆列表后再试',
      })
    }

    const detail = await this.client.call<VehicleDetailDto>({
      path: CFMOTO_PATHS.vehicleDetail,
      method: 'GET',
      query: { deviceName: ref.equipmentNum },
      requiresAuth: true,
      deviceId: ref.deviceId,
    })
    const vehicleTypeId = detail?.vehicleTypeId
    if (vehicleTypeId === undefined || vehicleTypeId === null || String(vehicleTypeId).trim() === '') {
      throw new AppError('车辆明细没有返回 vehicleTypeId，无法查询实时车况', {
        code: 'PARSE',
        details: { deviceName: ref.equipmentNum },
      })
    }

    const live = await this.client.call<VehicleNowInfoDto>({
      path: CFMOTO_PATHS.vehicleNowInfo,
      method: 'GET',
      query: { deviceId: ref.deviceId, type: String(vehicleTypeId) },
      requiresAuth: true,
      deviceId: ref.deviceId,
    })
    return toVehicleTelemetry(ref, detail, live)
  }

  async getMonthReport(ref: VehicleRef, month: MonthKey): Promise<MonthRideReport> {
    const dto = await this.client.call<MonthRideReportDto>({
      path: CFMOTO_PATHS.monthRideReport,
      method: 'GET',
      // 官方要求：月报必须用车辆简表的 T-Box deviceId。
      query: { deviceId: ref.deviceId, month },
      requiresAuth: true,
      deviceId: ref.deviceId,
    })
    const report = createMonthRideReport(
      toRawMonthRideInput(month, ref, dto, {
        fetchedAt: this.now().toISOString(),
        source: this.sourceId,
      }),
    )
    const extra = monthReportConsistencyIssues(month, dto)
    return extra.length === 0 ? report : { ...report, issues: [...report.issues, ...extra] }
  }

  async getMonthlyFuel(ref: VehicleRef, month: MonthKey): Promise<MonthlyFuelConsumption> {
    const dto = await this.client.call<MonthlyFuelDto>({
      path: CFMOTO_PATHS.monthlyFuel,
      method: 'GET',
      query: { deviceId: ref.deviceId, month },
      requiresAuth: true,
      deviceId: ref.deviceId,
    })
    return toMonthlyFuelConsumption(month, dto)
  }

  async getDayStats(ref: VehicleRef, date: DateKey): Promise<DayRideStats> {
    const dto = await this.client.call<DayRideStatsDto>({
      path: CFMOTO_PATHS.dayRideReport,
      method: 'GET',
      // 官方要求：单日统计的 deviceId 传车辆列表的 vehicleId，date 为 epoch 毫秒。
      query: { deviceId: ref.vehicleId, date: String(dateKeyToEpochMs(date)) },
      requiresAuth: true,
      deviceId: ref.deviceId,
    })
    const stats = createDayRideStats(toRawDayStatsInput(date, dto))
    if (!stats) {
      throw new AppError(`单日统计返回的日期与请求不一致（请求 ${date}）`, {
        code: 'PARSE',
        details: { date },
      })
    }
    return stats
  }

  async listRideHistory(ref: VehicleRef, query: RideHistoryQuery): Promise<Paged<RideHistoryItem>> {
    const startDate = query.from ? startOfDayText(query.from) : undefined
    const endDate = query.to ? endOfDayText(query.to) : undefined
    const lastShardingId = endDate ? String(new Date(endDate.replace(' ', 'T')).getTime()) : undefined
    const result = await this.client.call<unknown>({
      path: CFMOTO_PATHS.rideHistoryList,
      method: 'GET',
      query: {
        deviceId: ref.deviceId,
        ...(startDate ? { startDate } : {}),
        ...(endDate ? { endDate } : {}),
        ...(lastShardingId ? { isLoadMore: 'true', lastShardingId } : {}),
        pageNumber: query.pageNumber,
        pageSize: query.pageSize,
      },
      requiresAuth: true,
      deviceId: ref.deviceId,
    })
    return toRideHistoryItems(result, { pageNumber: query.pageNumber, pageSize: query.pageSize })
  }

  async getRideHistoryDetail(
    ref: VehicleRef,
    id: string,
  ): Promise<RideHistoryDetail> {
    const result = await this.client.call<unknown>({
      path: CFMOTO_PATHS.rideHistoryDetail,
      method: 'GET',
      query: { id },
      requiresAuth: true,
      deviceId: ref.deviceId,
    })
    return toRideHistoryDetail(result, { id })
  }

}

function isVehicle(value: Vehicle | null): value is Vehicle {
  return value !== null
}

export function createCfMotoRideDataSource(deps: CfMotoRideDataSourceDeps): CfMotoRideDataSource {
  return new CfMotoRideDataSource({ ...deps, logger: deps.logger ?? createLogger({ scope: 'cfmoto.ride' }) })
}
