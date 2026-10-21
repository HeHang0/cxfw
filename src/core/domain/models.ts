import type { DateKey, DateTimeText, MonthKey } from './identifiers'
import type { DataIssue } from './issues'

/* ------------------------------------------------------------------ 用户与认证 */

export interface UserProfile {
  readonly userId: string
  readonly nickname: string | null
  readonly phone: string | null
  readonly cfmotoNumber: string | null
  readonly isVip: boolean | null
  readonly avatarUrl: string | null
  /**
   * 账号注册月份（来自 `/user/info` 的 `dateJoined`）。
   * 仅用于展示账号信息；车辆骑行范围使用车辆简表的 `bindDate`。
   */
  readonly joinedMonth: MonthKey | null
  /** 账号注册日期（`dateJoined` 的本地日期）。 */
  readonly joinedAt: DateKey | null
}

/** 登录会话。`ticket` 属于敏感凭证：不写入日志，UI 也不展示。 */
export interface AuthSession {
  readonly ticket: string
  readonly userId: string
  readonly nickname: string | null
  readonly isVip: boolean | null
  readonly loginAt: string
}

/* ------------------------------------------------------------------ 车辆 */

export interface ElectricFence {
  readonly name: string | null
  readonly address: string | null
  readonly radiusKm: number | null
  /** `addrPosition`，格式 `lng,lat`。 */
  readonly position: string | null
}

/** 车辆功能项（`vehicleFunctionList`）：官方逐项给出是否支持。 */
export interface VehicleFunction {
  readonly id: string
  readonly name: string
  readonly supported: boolean
}

/** 消息提醒设置（`vehicleMessageSet`）：按 type 区分提醒类型，enable 表示是否开启。 */
export interface VehicleMessageSetting {
  readonly type: string
  readonly enabled: boolean
  readonly threshold: string | null
}

/**
 * 车辆设置（`vehicleSet`）。
 *
 * 只解析语义明确的字段：`themeName` 是主题名、`lowPower` 是低电量阈值。
 * `mileageUnit` / `temperatureUnit` / `timeFormat` 只是数字编码，api.yaml 未说明取值含义，
 * 因此保留在 `raw` 里，不猜"1 代表公里"。
 */
export interface VehicleSettings {
  readonly deviceId: string | null
  readonly themeName: string | null
  readonly lowPowerPercent: number | null
  readonly raw: Readonly<Record<string, unknown>>
}

/**
 * 车辆信息。两个官方接口各提供一部分字段，按 `vin` 合并：
 * - `/app/vehicle/list` → `vehicleId`、`equipmentNum`
 * - `/app/vehicle/option` → `deviceId`、`bindDate`
 */
export interface Vehicle {
  readonly vehicleId: string | null
  readonly deviceId: string | null
  readonly vin: string
  readonly equipmentNum: string | null
  readonly model: string | null
  readonly imageUrl: string | null
  readonly bindDate: string | null
}

export interface VehicleState {
  readonly vin: string
  readonly simExpire: boolean | null
  readonly simExpireTime: string | null
  /** `simFreeDate`：SIM 剩余天数。 */
  readonly simFreeDays: number | null
  readonly electricFences: readonly ElectricFence[]
  readonly functions: readonly VehicleFunction[]
  readonly messageSettings: readonly VehicleMessageSetting[]
  readonly settings: VehicleSettings | null
  readonly issues: readonly DataIssue[]
}

/** 摔车救援提醒开关，接口一次返回所有车辆。 */
export interface CrashRescueSetting {
  readonly vin: string
  readonly vehicleName: string | null
  readonly imageUrl: string | null
  readonly enabled: boolean | null
}

/** 实时车况里的车辆位置（`geoLocation`）。 */
export interface VehicleLocation {
  readonly latitude: number | null
  readonly longitude: number | null
  readonly altitudeMeters: number | null
  readonly reportedAtEpochSeconds: number | null
}

/** `/app/vehicle/detail/v1` 返回的最近一趟行程。 */
export interface VehicleRecentRide {
  readonly id: string
  readonly shardingId: string | null
  readonly date: DateKey | null
  readonly distanceKm: number | null
  readonly durationSeconds: number | null
  readonly maxSpeedKph: number | null
  readonly startTime: string | null
  readonly endTime: string | null
  readonly startAddress: string | null
  readonly endAddress: string | null
}

/**
 * 车辆实时车况。
 *
 * 来源：
 * - `/app/vehicle/detail`：`equipmentNum` → `vehicleTypeId`；
 * - `/app/vehicle/detail/v1`：油量、信号、电压、位置、最近行程。
 */
export interface VehicleTelemetry {
  readonly deviceId: string
  readonly deviceName: string | null
  readonly vehicleTypeId: string | null
  readonly itemCode: string | null
  readonly vinNo: string | null
  readonly vehicleTypeName: string | null
  readonly imageUrl: string | null
  readonly deviceState: string | null
  readonly online: boolean | null
  /** `remainingOil`：当前油表格数/剩余油量值。 */
  readonly remainingOil: number | null
  /** `totalOilNum`：仪表油表总格数，不是油箱升数。 */
  readonly totalOilSegments: number | null
  readonly oilPercent: number | null
  readonly remainingOilDisplay: string | null
  readonly signalLevel: number | null
  readonly signalText: string | null
  readonly batteryVoltage: number | null
  /** `fireVoltageDisplay`：官方直接展示的电池电压文字。 */
  readonly batteryVoltageDisplay: string | null
  readonly batteryStatus: string | null
  readonly batteryThreshold: number | null
  readonly totalMileageKm: number | null
  readonly monthMileageKm: number | null
  readonly monthDurationSeconds: number | null
  readonly averageSpeedKph: number | null
  readonly location: VehicleLocation | null
  readonly lastUpdate: string | null
  readonly recentRide: VehicleRecentRide | null
  readonly issues: readonly DataIssue[]
}

export interface FuelUseDay {
  readonly date: DateKey
  readonly liters: number | null
}

/** `/app/power/list/month` 的月度油耗。 */
export interface MonthlyFuelConsumption {
  readonly month: MonthKey
  readonly firstBindMonth: MonthKey | null
  /** `powerUseMonth`，单位 L。 */
  readonly totalLiters: number | null
  /** `powerUseMonthNew`，单位 L（精度更高）。 */
  readonly totalLitersPrecise: number | null
  readonly days: readonly FuelUseDay[]
}

/** 手动加油记录；日期精确到分钟，同一天可多条。 */
export interface RefuelRecord {
  /** `yyyy-MM-dd HH:mm:ss`，同时作为唯一键。 */
  readonly time: DateTimeText
  readonly liters: number
  /** 本次加油总金额（元），可为空。 */
  readonly price: number | null
  /** 汽油标号，如 95#。 */
  readonly grade: string | null
}

/* ------------------------------------------------------------------ 骑行数据 */

/**
 * 单日骑行记录。
 *
 * `distanceKm` 来自月报的 `intraday_mileage`（api.yaml 标注单位为**米**，在这里换算为公里）。
 * `rapid*` 三个字段只有单日统计接口 `/app/ride/report/v2` 会返回，
 * 月报接口不含这些字段，因此默认是 null（"未知"），不是 0。
 */
export interface DayRideRecord {
  readonly date: DateKey
  readonly distanceKm: number | null
  readonly durationSeconds: number | null
  readonly maxSpeedKph: number | null
  readonly rapidAcceleration: number | null
  readonly rapidDeceleration: number | null
  readonly rapidTurn: number | null
  readonly issues: readonly DataIssue[]
}

/**
 * 月度骑行报表（基础数据，缓存与聚合都以它为单位）。
 *
 * 关于 `vehicleTotalMileageKm`：官方字段 `total_mileage` 经实测样例判定为
 * 「车辆累计总里程（km）」——样例 `'9434.8'` 与按月累加的里程（约 390 km/月）量级不同，
 * 却与绑定时间（2025-09）以来的累计骑行里程吻合。它**不是**当月合计，
 * 当月合计一律由按天数据累加得到。
 */
export interface MonthRideReport {
  readonly month: MonthKey
  readonly vehicleId: string
  readonly deviceId: string
  /** `firstBindDate`，形如 `2025-09`。用于推断可查询的最早月份。 */
  readonly firstBindMonth: MonthKey | null
  readonly vehicleTotalMileageKm: number | null
  readonly vehicleTotalMileageRaw: string | null
  /** 按天累加得到的月总里程，是统计模块使用的权威值。 */
  readonly days: readonly DayRideRecord[]
  readonly issues: readonly DataIssue[]
  /** 抓取时间（ISO 字符串）。 */
  readonly fetchedAt: string
  readonly source: string
}

/** 单日统计接口返回的额外指标（含月报没有的急加速/急减速/急转弯）。 */
export interface DayRideStats {
  readonly date: DateKey
  readonly durationSeconds: number | null
  readonly maxSpeedKph: number | null
  /**
   * `month_mileage`。该字段名与"单日统计"语义不符，api.yaml 未给出单位与含义，
   * 因此保留原始文本，不参与统计计算。
   */
  readonly monthDistanceRaw: string | null
  readonly rapidAcceleration: number | null
  readonly rapidDeceleration: number | null
  readonly rapidTurn: number | null
  readonly issues: readonly DataIssue[]
}

export interface RideHistoryItem {
  readonly id: string
  readonly shardingId: string | null
  readonly date: DateKey | null
  readonly startTime: string | null
  readonly endTime: string | null
  readonly startAddress: string | null
  readonly endAddress: string | null
  readonly distanceKm: number | null
  readonly durationSeconds: number | null
  readonly maxSpeedKph: number | null
  readonly raw: Readonly<Record<string, unknown>>
}

export interface RideTrajectoryPoint {
  /** WGS84 经度。 */
  readonly longitude: number
  /** WGS84 纬度。 */
  readonly latitude: number
  readonly speedKph: number | null
  readonly cumulativeDistanceKm: number | null
  readonly timestampSeconds: number | null
}

export interface RideHistoryDetail {
  readonly id: string
  readonly shardingId: string | null
  readonly startTime: string | null
  readonly endTime: string | null
  readonly startAddress: string | null
  readonly endAddress: string | null
  readonly distanceKm: number | null
  readonly durationSeconds: number | null
  readonly maxSpeedKph: number | null
  readonly accelerationTimes: number | null
  readonly brakesTimes: number | null
  readonly bendingTimes: number | null
  readonly trajectory: readonly RideTrajectoryPoint[]
  readonly raw: Readonly<Record<string, unknown>>
}

export interface Paged<T> {
  readonly items: readonly T[]
  readonly pageNumber: number
  readonly pageSize: number
  /** 官方返回为空数组且未给出总数，无法判定时为 null。 */
  readonly total: number | null
  readonly issues: readonly DataIssue[]
}

export interface RideHistoryQuery {
  readonly from?: DateKey
  readonly to?: DateKey
  readonly pageNumber: number
  readonly pageSize: number
}

