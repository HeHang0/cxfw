import type { RawDayRideInput, RawDayStatsInput, RawMonthRideInput, RawVehicleInput } from '@/core/domain/validation'
import { dateFromEpochMs, extractDateKey, extractMonthKey, monthFromEpochMs } from '@/core/domain/datetime'
import type { DateKey, MonthKey, VehicleRef } from '@/core/domain/identifiers'
import { createIssue, type DataIssue } from '@/core/domain/issues'
import type {
  AuthSession,
  CrashRescueSetting,
  Paged,
  MonthlyFuelConsumption,
  RideHistoryDetail,
  RideHistoryItem,
  RideTrajectoryPoint,
  UserProfile,
  VehicleFunction,
  VehicleMessageSetting,
  VehicleSettings,
  VehicleState,
  VehicleTelemetry,
} from '@/core/domain/models'
import type {
  DayRideStatsDto,
  CrashRescueSettingDto,
  LoginByVerifyCodeDto,
  MonthRideReportDto,
  MonthlyFuelDto,
  UserInfoDto,
  VehicleListDto,
  VehicleNowInfoDto,
  VehicleOptionDto,
  VehicleOverviewDto,
  VehicleDetailDto,
} from '../dto'
import { parseNullableNumber } from '@/core/domain/numbers'

/**
 * 官方 DTO → 领域输入 的转换。
 *
 * 这一层只做"改名字段"和"拆解嵌套"，不做数值校验（校验在 domain/validation.ts），
 * 也不生成业务结论。因此每个函数都很薄，容易对照 api.yaml 复核。
 */

export function asArray(value: unknown): unknown[] {
  if (Array.isArray(value)) return value
  if (value === null || value === undefined) return []
  return [value]
}

function asRecord(value: unknown): Record<string, unknown> {
  return value !== null && typeof value === 'object' ? (value as Record<string, unknown>) : {}
}

export function toRawDayRideInputs(value: unknown): RawDayRideInput[] {
  return asArray(value).map((item) => {
    const record = asRecord(item)
    return {
      date: record['intraday_date'],
      distanceMeters: record['intraday_mileage'],
      durationSeconds: record['drive_seconds'],
      maxSpeedKph: record['max_speed'],
      // 实测样例表明月报的按天记录本身就带急事件计数，不需要再逐日调用单日统计接口
      rapidAcceleration: record['rapid_acceleration'],
      rapidDeceleration: record['rapid_deceleration'],
      rapidTurn: record['rapid_turn'],
    }
  })
}

export function toRawMonthRideInput(
  month: MonthKey,
  ref: VehicleRef,
  dto: MonthRideReportDto | undefined,
  options: { fetchedAt: string; source: string },
): RawMonthRideInput {
  return {
    month,
    vehicleId: ref.vehicleId,
    deviceId: ref.deviceId,
    firstBindMonth: dto?.firstBindDate,
    reportedTotalRaw: dto?.total_mileage,
    days: toRawDayRideInputs(dto?.vehicle_report),
    fetchedAt: options.fetchedAt,
    source: options.source,
  }
}

export function toMonthlyFuelConsumption(
  month: MonthKey,
  dto: MonthlyFuelDto | undefined,
): MonthlyFuelConsumption {
  const record = asRecord(dto)
  const days = asArray(record['useList']).flatMap((item) => {
    const day = asRecord(item)
    const date = extractDateKey(day['powerUseDate']) ?? dateFromEpochMs(day['date'])
    if (!date) return []
    return [{ date, liters: parseNullableNumber(day['powerUseValue']) }]
  })
  return {
    month,
    firstBindMonth: extractMonthKey(record['firstBindDate']),
    totalLiters: parseNullableNumber(record['powerUseMonth']),
    totalLitersPrecise: parseNullableNumber(record['powerUseMonthNew']),
    days,
  }
}

/** 月报响应里 `date` 与请求的月份不一致时，以请求月份为准并记录问题。 */
export function monthReportConsistencyIssues(month: MonthKey, dto: MonthRideReportDto | undefined): DataIssue[] {
  const issues: DataIssue[] = []
  const reported = extractMonthKey(dto?.date)
  if (reported !== null && reported !== month) {
    issues.push(
      createIssue('INCONSISTENT_TOTAL', `接口返回的月份 ${reported} 与请求的 ${month} 不一致`, {
        path: 'date',
        value: dto?.date,
      }),
    )
  }
  return issues
}

export function toRawDayStatsInput(date: DateKey, dto: DayRideStatsDto | undefined): RawDayStatsInput {
  return {
    date,
    durationSeconds: dto?.drive_seconds,
    maxSpeedKph: dto?.max_speed,
    monthDistanceRaw: dto?.month_mileage,
    rapidAcceleration: dto?.rapid_acceleration,
    rapidDeceleration: dto?.rapid_deceleration,
    rapidTurn: dto?.rapid_turn,
  }
}

export function toVehicleListInputs(value: unknown): RawVehicleInput[] {
  return asArray(value).map((item) => {
    const record = asRecord(item) as VehicleListDto
    return {
      vehicleId: record.vehicleId,
      deviceId: null,
      vin: record.vin,
      equipmentNum: record.equipmentNum,
      model: record.vehicleType,
      imageUrl: record.vehicleTypeImageUrl,
      bindDate: null,
    }
  })
}

export function toVehicleOptionInputs(value: unknown): RawVehicleInput[] {
  return asArray(value).map((item) => {
    const record = asRecord(item) as VehicleOptionDto
    return {
      vehicleId: null,
      deviceId: record.deviceId,
      vin: record.vin,
      equipmentNum: null,
      model: record.vehicleName,
      imageUrl: null,
      bindDate: record.bindDate,
    }
  })
}

export function toVehicleState(ref: VehicleRef, dto: VehicleOverviewDto | undefined): VehicleState {
  const issues: DataIssue[] = []
  const record = asRecord(dto)
  const fences = asArray(record['electricFenceList']).map((item) => {
    const fence = asRecord(item)
    return {
      name: fence['rideRangeName'] === undefined ? null : String(fence['rideRangeName']),
      address: fence['address'] === undefined ? null : String(fence['address']),
      radiusKm: parseNullableNumber(fence['radius']),
      position: fence['addrPosition'] === undefined ? null : String(fence['addrPosition']),
    }
  })

  // 功能列表：官方逐项给出 isSupport，是「功能与服务」的真实来源
  const functions: VehicleFunction[] = asArray(record['vehicleFunctionList']).flatMap((item, index) => {
    const fn = asRecord(item)
    const name = toText(fn['name'])
    if (!name) {
      issues.push(
        createIssue('MISSING_FIELD', `第 ${index + 1} 项车辆功能缺少名称，已忽略`, {
          path: `vehicleFunctionList[${index}].name`,
        }),
      )
      return []
    }
    return [
      {
        id: toText(fn['id']) ?? String(index),
        name,
        supported: fn['isSupport'] === true,
      },
    ]
  })

  // 消息提醒开关：type 是提醒类型编码，api.yaml 未给出编码含义，因此只保留原始编码
  const messageSettings: VehicleMessageSetting[] = asArray(record['vehicleMessageSet']).map((item) => {
    const setting = asRecord(item)
    return {
      type: toText(setting['type']) ?? '',
      enabled: setting['enable'] === true,
      threshold: toText(setting['threshold']),
    }
  })

  const rawSet = asRecord(record['vehicleSet'])
  const settings: VehicleSettings | null =
    Object.keys(rawSet).length === 0
      ? null
      : {
          deviceId: toText(rawSet['deviceId']),
          themeName: toText(rawSet['themeName']),
          lowPowerPercent: parseNullableNumber(rawSet['lowPower']),
          raw: rawSet,
        }
  if (settings) {
    issues.push(
      createIssue(
        'UNKNOWN_UNIT',
        'vehicleSet 中 mileageUnit / temperatureUnit / timeFormat 等只是数字编码，含义未确认，已按原值保留',
        { path: 'vehicleSet' },
      ),
    )
  }

  const rawVin = record['vin']
  if (rawVin !== undefined && String(rawVin) !== ref.vin) {
    issues.push(
      createIssue('INCONSISTENT_TOTAL', '车辆状态返回的 vin 与请求不一致', { path: 'vin', value: rawVin }),
    )
  }

  return {
    vin: rawVin === undefined ? ref.vin : String(rawVin),
    simExpire: typeof record['simExpire'] === 'boolean' ? record['simExpire'] : null,
    simExpireTime: record['simExpireTime'] === undefined ? null : String(record['simExpireTime']),
    simFreeDays: parseNullableNumber(record['simFreeDate']),
    electricFences: fences,
    functions,
    messageSettings,
    settings,
    issues,
  }
}

export function toCrashRescueSettings(value: unknown): CrashRescueSetting[] {
  return asArray(value).flatMap((item) => {
    const record = asRecord(item) as CrashRescueSettingDto
    const vin = toText(record.vin)
    if (!vin) return []

    return [
      {
        vin,
        vehicleName: toText(record.vehicleName),
        imageUrl: toText(record.vehiclePicUrl),
        enabled:
          typeof record.vehicleCrashRescueServiceSwitch === 'boolean'
            ? record.vehicleCrashRescueServiceSwitch
            : null,
      },
    ]
  })
}

export function toVehicleTelemetry(
  ref: VehicleRef,
  detail: VehicleDetailDto | undefined,
  live: VehicleNowInfoDto | undefined,
  issues: readonly DataIssue[] = [],
): VehicleTelemetry {
  const detailRecord = asRecord(detail)
  const liveRecord = asRecord(live)
  const locationRecord = asRecord(liveRecord['geoLocation'])
  const locationReport = asRecord(locationRecord['report'])
  const recentRecord = asRecord(liveRecord['vehicleRideHistoryListVO'])

  const remainingOil = parseNullableNumber(liveRecord['remainingOil'])
  // totalOilNum 是仪表油表格数（样例 6 格），不是油箱容量升数。
  const totalOilSegments = parseNullableNumber(liveRecord['totalOilNum'])
  const oilPercent =
    remainingOil !== null && totalOilSegments !== null && totalOilSegments > 0
      ? Math.round((remainingOil / totalOilSegments) * 100)
      : null
  const batteryVoltage = parseNullableNumber(liveRecord['fireVoltage'])
  const batteryVoltageDisplay =
    toText(liveRecord['fireVoltageDisplay']) ??
    toText(liveRecord['fireVoltageDisplayV2'])
  const deviceState = toText(liveRecord['deviceState'])
  const monthMileageRaw = parseNullableNumber(liveRecord['rideMileageMonth'])
  const recentDistance = parseNullableNumber(recentRecord['rideMileage'])

  return {
    deviceId: toText(detailRecord['deviceId']) ?? ref.deviceId,
    deviceName: toText(detailRecord['deviceName']),
    vehicleTypeId: toText(detailRecord['vehicleTypeId']) ?? toText(liveRecord['vehicleTypeId']),
    itemCode: toText(detailRecord['itemCode']),
    vinNo: toText(detailRecord['vinNo']) ?? ref.vin,
    vehicleTypeName: toText(liveRecord['vehicleType']),
    imageUrl: toText(liveRecord['vehicleTypeImageUrl']),
    deviceState,
    online: deviceState === null ? null : deviceState.toUpperCase() === 'ONLINE',
    remainingOil,
    totalOilSegments,
    oilPercent,
    remainingOilDisplay: toText(liveRecord['remainingOilDisplay']),
    signalLevel: parseNullableNumber(liveRecord['gsmRxLev']),
    signalText: toText(liveRecord['gsmRxLevStr']),
    batteryVoltage,
    batteryVoltageDisplay,
    batteryStatus: batteryVoltageDisplay,
    batteryThreshold: parseNullableNumber(liveRecord['fireVoltageThreshold']),
    totalMileageKm: parseNullableNumber(liveRecord['totalRideMile']),
    // rideMileageMonth 样例为 391900.00，与同月月报 391.9 km 对应，按米换算。
    monthMileageKm: monthMileageRaw === null ? null : Math.round((monthMileageRaw / 1000) * 100) / 100,
    monthDurationSeconds: parseNullableNumber(liveRecord['ridingTimeMonth']),
    averageSpeedKph: parseNullableNumber(liveRecord['avgRideSpeed']),
    location:
      Object.keys(locationRecord).length === 0
        ? null
        : {
            latitude: parseNullableNumber(locationRecord['latitude']),
            longitude: parseNullableNumber(locationRecord['longitude']),
            altitudeMeters: parseNullableNumber(locationRecord['altitude']),
            reportedAtEpochSeconds: parseNullableNumber(locationReport['datetime']),
          },
    lastUpdate: toText(liveRecord['dataLastUpdateTime']),
    recentRide:
      Object.keys(recentRecord).length === 0
        ? null
        : {
            id: toText(recentRecord['id']) ?? '',
            shardingId: toText(recentRecord['shardingId']),
            date: extractDateKey(recentRecord['dateYmd']),
            distanceKm: recentDistance,
            durationSeconds: parseNullableNumber(recentRecord['ridingTime']),
            maxSpeedKph: parseNullableNumber(recentRecord['maxSpeed']),
            startTime: toText(recentRecord['startTime']),
            endTime: toText(recentRecord['endTime']),
            startAddress: toText(recentRecord['startAddr']),
            endAddress: toText(recentRecord['endAddr']),
          },
    issues,
  }
}

function toText(value: unknown): string | null {
  if (value === null || value === undefined) return null
  const text = String(value).trim()
  return text === '' ? null : text
}

export function toAuthSession(dto: LoginByVerifyCodeDto | undefined, fallbackNickname: string | null): AuthSession | null {
  const record = asRecord(dto)
  const ticket = record['ticket']
  if (typeof ticket !== 'string' || ticket.trim() === '') return null
  const userId = record['user_id'] ?? record['userId'] ?? record['id']
  return {
    ticket: ticket.trim(),
    userId: userId === undefined || userId === null ? '' : String(userId),
    nickname: record['nickname'] === undefined ? fallbackNickname : String(record['nickname']),
    isVip: typeof record['is_vip'] === 'boolean' ? record['is_vip'] : null,
    loginAt: new Date().toISOString(),
  }
}

export function toUserProfile(dto: UserInfoDto | undefined): UserProfile | null {
  const record = asRecord(dto)
  const userId = record['userId'] ?? record['id']
  if (userId === undefined || userId === null) return null
  return {
    userId: String(userId),
    nickname: record['nickname'] === undefined ? null : String(record['nickname']),
    phone: record['phone'] === undefined ? null : String(record['phone']),
    cfmotoNumber: record['cfmotoNumber'] === undefined ? null : String(record['cfmotoNumber']),
    isVip: typeof record['isVip'] === 'boolean' ? record['isVip'] : null,
    avatarUrl: record['photo'] === undefined ? null : String(record['photo']),
    // dateJoined 是 epoch 毫秒；仅用于账号资料展示。
    joinedMonth: monthFromEpochMs(record['dateJoined']),
    joinedAt: dateFromEpochMs(record['dateJoined']),
  }
}

/**
 * 行程列表。
 *
 * api.yaml 只说"列表项里的 id + shardingId 一起传"，且当前账号返回空数组，
 * 其余字段结构未实测，因此这里只提取这两个必需字段，原始对象原样保留。
 */
export function toRideHistoryItems(
  value: unknown,
  page: { pageNumber: number; pageSize: number },
): Paged<RideHistoryItem> {
  const issues: DataIssue[] = []
  const rawItems = asArray(value)
  const items: RideHistoryItem[] = []
  rawItems.forEach((item, index) => {
    const record = asRecord(item)
    const id = record['id']
    if (id === undefined || id === null) {
      issues.push(
        createIssue('MISSING_FIELD', `第 ${index + 1} 条行程缺少 id，已忽略`, {
          path: `ridehistory[${index}].id`,
          severity: 'error',
        }),
      )
      return
    }
    const shardingId = record['shardingId']
    const startTime = toText(record['startTime'])
    items.push({
      id: String(id),
      shardingId: shardingId === undefined || shardingId === null ? null : String(shardingId),
      date: extractDateKey(startTime),
      startTime,
      endTime: toText(record['endTime']),
      startAddress: toText(record['startAddr']),
      endAddress: toText(record['endAddr']),
      distanceKm: parseNullableNumber(record['rideMileage']),
      durationSeconds: parseNullableNumber(record['ridingTime']),
      maxSpeedKph: parseNullableNumber(record['maxSpeed']),
      raw: record,
    })
  })
  return {
    items,
    pageNumber: page.pageNumber,
    pageSize: page.pageSize,
    total: null,
    issues,
  }
}

export function toRideHistoryDetail(
  value: unknown,
  requested: { id: string },
): RideHistoryDetail {
  const record = asRecord(value)
  const id = record['id'] === undefined ? requested.id : String(record['id'])
  const shardingId =
    record['shardingId'] === undefined || record['shardingId'] === null
      ? null
      : String(record['shardingId'])
  return {
    id,
    shardingId,
    startTime: toText(record['startTime']),
    endTime: toText(record['endTime']),
    startAddress: toText(record['startAddr']),
    endAddress: toText(record['endAddr']),
    distanceKm: parseNullableNumber(record['rideMileage']),
    durationSeconds: parseNullableNumber(record['ridingTime']),
    maxSpeedKph: parseNullableNumber(record['maxSpeed']),
    accelerationTimes: parseNullableNumber(record['accelerationTimes']),
    brakesTimes: parseNullableNumber(record['brakesTimes']),
    bendingTimes: parseNullableNumber(record['bendingTimes']),
    trajectory: parseTrajectory(record['trajectory']),
    raw: record,
  }
}

function parseTrajectory(value: unknown): RideTrajectoryPoint[] {
  if (typeof value !== 'string' || value.trim() === '') return []
  return value.split('&').flatMap((segment) => {
    const parts = segment.split(',').map((item) => Number(item))
    const [longitude, latitude, speed, mileage, timestamp] = parts
    if (
      longitude === undefined ||
      latitude === undefined ||
      !Number.isFinite(longitude) ||
      !Number.isFinite(latitude)
    ) {
      return []
    }
    return [
      {
        longitude,
        latitude,
        speedKph: speed !== undefined && Number.isFinite(speed) ? speed : null,
        cumulativeDistanceKm: mileage !== undefined && Number.isFinite(mileage) ? mileage : null,
        timestampSeconds: timestamp !== undefined && Number.isFinite(timestamp) ? timestamp : null,
      },
    ]
  })
}

