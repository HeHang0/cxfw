/**
 * 官方原始 DTO。
 *
 * 这里严格按 api.yaml 的字段名建模（包括下划线命名），
 * 业务模型只使用 `src/core/domain` 中的类型，两者通过 mappers 转换。
 * 未在 api.yaml 中定义结构的字段一律保留为 unknown / 索引签名，不做猜测。
 */

export interface CfMotoEnvelope<T> {
  readonly code?: number
  readonly msg?: string
  readonly data?: T
}

/* ---------------- 登录 / 用户 ---------------- */

export interface LoginByVerifyCodeDto {
  readonly ticket?: unknown
  readonly user_id?: unknown
  readonly nickname?: unknown
  readonly is_vip?: unknown
}

export interface LoginByPasswordDto {
  readonly ticket?: unknown
  readonly user_id?: unknown
  readonly nickname?: unknown
  readonly is_vip?: unknown
  readonly [key: string]: unknown
}

export interface UserInfoDto {
  readonly userId?: unknown
  readonly id?: unknown
  readonly nickname?: unknown
  readonly phone?: unknown
  readonly cfmotoNumber?: unknown
  readonly isVip?: unknown
  readonly photo?: unknown
  /** 注册时间，epoch 毫秒。 */
  readonly dateJoined?: unknown
}

/* ---------------- 车辆 ---------------- */

export interface VehicleListDto {
  readonly vehicleId?: unknown
  readonly vin?: unknown
  readonly equipmentNum?: unknown
  readonly vehicleType?: unknown
  readonly vehicleTypeImageUrl?: unknown
}

export interface VehicleOptionDto {
  readonly deviceId?: unknown
  readonly vehicleName?: unknown
  readonly vin?: unknown
  readonly type?: unknown
  readonly bindDate?: unknown
}

export interface ElectricFenceDto {
  readonly rideRangeName?: unknown
  readonly address?: unknown
  readonly radius?: unknown
}

/** `/app/vehicle/state/overview/v2`。api.yaml 只给了样例，其余字段保留原始结构。 */
export interface VehicleOverviewDto {
  readonly vin?: unknown
  readonly simExpire?: unknown
  readonly simExpireTime?: unknown
  readonly simFreeDate?: unknown
  readonly electricFenceList?: unknown
  readonly vehicleFunctionList?: unknown
  readonly vehicleMessageSet?: unknown
  readonly vehicleSet?: unknown
  readonly [key: string]: unknown
}

/** `vehicleFunctionList[]`：功能名 + 是否支持。 */
export interface VehicleFunctionDto {
  readonly id?: unknown
  readonly name?: unknown
  readonly isSupport?: unknown
  readonly sign?: unknown
  readonly type?: unknown
}

/** `vehicleMessageSet[]`：消息提醒开关，type 为提醒类型编码。 */
export interface VehicleMessageSettingDto {
  readonly type?: unknown
  readonly enable?: unknown
  readonly threshold?: unknown
}

/** `vehicleSet`：车辆设置。单位的数字编码含义 api.yaml 未说明。 */
export interface VehicleSetDto {
  readonly deviceId?: unknown
  readonly themeName?: unknown
  readonly lowPower?: unknown
  readonly [key: string]: unknown
}

/** `/app/vehicle/detail`：只用 `equipmentNum` 查询，返回实时车况所需的 `vehicleTypeId`。 */
export interface VehicleDetailDto {
  readonly deviceId?: unknown
  readonly deviceName?: unknown
  readonly itemCode?: unknown
  readonly userId?: unknown
  readonly vehicleTypeId?: unknown
  readonly vinNo?: unknown
}

export interface VehicleGeoLocationDto {
  readonly altitude?: unknown
  readonly latitude?: unknown
  readonly longitude?: unknown
  readonly report?: unknown
}

export interface VehicleRecentRideDto {
  readonly dateYmd?: unknown
  readonly id?: unknown
  readonly shardingId?: unknown
  readonly rideMileage?: unknown
  readonly ridingTime?: unknown
  readonly maxSpeed?: unknown
  readonly startTime?: unknown
  readonly endTime?: unknown
  readonly startAddr?: unknown
  readonly endAddr?: unknown
}

/** `/app/vehicle/detail/v1`：实时车况。其余未建模字段保留在响应里，不臆造语义。 */
export interface VehicleNowInfoDto {
  readonly deviceId?: unknown
  readonly deviceState?: unknown
  readonly vehicleType?: unknown
  readonly vehicleTypeId?: unknown
  readonly vehicleTypeImageUrl?: unknown
  readonly remainingOil?: unknown
  readonly totalOilNum?: unknown
  readonly remainingOilDisplay?: unknown
  readonly gsmRxLev?: unknown
  readonly gsmRxLevStr?: unknown
  readonly fireVoltage?: unknown
  readonly fireVoltageDisplay?: unknown
  readonly fireVoltageThreshold?: unknown
  readonly geoLocation?: unknown
  readonly dataLastUpdateTime?: unknown
  readonly totalRideMile?: unknown
  readonly rideMileageMonth?: unknown
  readonly ridingTimeMonth?: unknown
  readonly avgRideSpeed?: unknown
  readonly vehicleRideHistoryListVO?: unknown
  readonly [key: string]: unknown
}

export interface FuelUseDayDto {
  readonly date?: unknown
  readonly powerUseDate?: unknown
  readonly powerUseValue?: unknown
}

export interface MonthlyFuelDto {
  readonly firstBindDate?: unknown
  readonly powerUseMonth?: unknown
  readonly powerUseMonthNew?: unknown
  readonly useList?: unknown
}

/* ---------------- 骑行 ---------------- */

export interface MonthRideItemDto {
  /** `yyyy-MM-dd` */
  readonly intraday_date?: unknown
  /** 单位米（api.yaml 标注） */
  readonly intraday_mileage?: unknown
  /** 单位秒 */
  readonly drive_seconds?: unknown
  /** km/h */
  readonly max_speed?: unknown
}

export interface MonthRideReportDto {
  /** `yyyy-MM` */
  readonly date?: unknown
  /** `yyyy-MM`，最早绑定月份 */
  readonly firstBindDate?: unknown
  /** 单位未在 api.yaml 中说明 */
  readonly total_mileage?: unknown
  readonly vehicle_report?: unknown
}

export interface DayRideStatsDto {
  readonly drive_seconds?: unknown
  readonly max_speed?: unknown
  /** 字段名与"单日"语义不符，api.yaml 未说明含义与单位 */
  readonly month_mileage?: unknown
  readonly rapid_turn?: unknown
  readonly rapid_acceleration?: unknown
  readonly rapid_deceleration?: unknown
}

export interface RideHistoryItemDto {
  readonly id?: unknown
  readonly shardingId?: unknown
  readonly [key: string]: unknown
}
