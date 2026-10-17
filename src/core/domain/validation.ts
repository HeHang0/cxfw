import { isDateKey, isMonthKey, monthOf } from './datetime'
import type { DateKey, MonthKey } from './identifiers'
import { createIssue, dedupeIssues, type DataIssue } from './issues'
import { LIMITS } from './limits'
import type { DayRideRecord, DayRideStats, MonthRideReport, Vehicle } from './models'
import { parseNullableInt, parseNullableNumber, round } from './numbers'

/**
 * 官方 DTO → 领域模型的校验与归一化。
 *
 * 这一层不认识官方字段名（`intraday_mileage` 之类），只接收已经"改名"的字段值，
 * 因此可以独立于具体数据源被测试和替换。
 */

export interface RawDayRideInput {
  /** `intraday_date`，`yyyy-MM-dd`。 */
  readonly date: unknown
  /** `intraday_mileage`，单位米（api.yaml 标注）。 */
  readonly distanceMeters: unknown
  /** `drive_seconds`，单位秒。 */
  readonly durationSeconds: unknown
  /** `max_speed`，单位 km/h。 */
  readonly maxSpeedKph: unknown
  /** 只有单日统计接口会提供。 */
  readonly rapidAcceleration?: unknown
  readonly rapidDeceleration?: unknown
  readonly rapidTurn?: unknown
  /** 问题定位用的字段前缀。 */
  readonly pathPrefix?: string
}

export interface RawMonthRideInput {
  readonly month: unknown
  readonly vehicleId: unknown
  readonly deviceId: unknown
  /** `firstBindDate`。 */
  readonly firstBindMonth?: unknown
  /** `total_mileage` 原始文本。 */
  readonly reportedTotalRaw?: unknown
  readonly days: readonly RawDayRideInput[]
  readonly fetchedAt: string
  readonly source: string
}

export interface RawDayStatsInput {
  readonly date: unknown
  readonly durationSeconds: unknown
  readonly maxSpeedKph: unknown
  readonly monthDistanceRaw: unknown
  readonly rapidAcceleration: unknown
  readonly rapidDeceleration: unknown
  readonly rapidTurn: unknown
}

function checkRange(
  value: number | null,
  label: string,
  path: string,
  max: number,
  issues: DataIssue[],
  options: { allowZero?: boolean } = {},
): number | null {
  if (value === null) return null
  const allowZero = options.allowZero ?? true
  if (value < 0 || (!allowZero && value === 0)) {
    issues.push(
      createIssue('NEGATIVE_VALUE', `${label}为负数或非法值（${value}）`, { path, value, severity: 'error' }),
    )
    return null
  }
  if (value > max) {
    issues.push(createIssue('OUT_OF_RANGE', `${label}超出合理范围（${value}）`, { path, value, severity: 'error' }))
    return null
  }
  return value
}

export interface DayRideParseResult {
  /** 无法使用时为 null（整行丢弃）。 */
  readonly record: DayRideRecord | null
  /** 该行产生的问题，无论成功与否都会向上传递，避免"为什么丢了这一行"无从查证。 */
  readonly issues: readonly DataIssue[]
}

/**
 * 把单日原始字段归一化为 `DayRideRecord`。
 * 只有日期非法或全部指标都不可用时 `record` 才为 null，此时 `issues` 会说明原因。
 */
export function parseDayRideRecord(input: RawDayRideInput, month: MonthKey): DayRideParseResult {
  const prefix = input.pathPrefix ?? 'vehicle_report'
  const issues: DataIssue[] = []
  const datePath = `${prefix}.date`

  const date = typeof input.date === 'string' ? input.date.trim() : input.date
  if (!isDateKey(date)) {
    issues.push(
      createIssue('MISSING_FIELD', '单日记录缺少合法日期，已丢弃该行', { path: datePath, value: input.date, severity: 'error' }),
    )
    return { record: null, issues }
  }
  const dateKey = date as DateKey
  if (monthOf(dateKey) !== month) {
    issues.push(
      createIssue('DAY_OUTSIDE_MONTH', `日期 ${dateKey} 不属于月份 ${month}，已丢弃该行`, {
        path: datePath,
        value: dateKey,
        severity: 'error',
      }),
    )
    return { record: null, issues }
  }

  const rawDistance = parseNullableNumber(input.distanceMeters)
  const distanceMeters = checkRange(rawDistance, '单日里程', `${prefix}.intraday_mileage`, LIMITS.maxDailyDistanceKm * 1000, issues)
  const distanceKm = distanceMeters === null ? null : round(distanceMeters / 1000, 3)

  const rawDuration = parseNullableInt(input.durationSeconds)
  const durationSeconds = checkRange(
    rawDuration,
    '单日骑行时长',
    `${prefix}.drive_seconds`,
    LIMITS.maxDailyDurationSeconds,
    issues,
  )

  const rawSpeed = parseNullableNumber(input.maxSpeedKph)
  const maxSpeedKph = checkRange(rawSpeed, '最高车速', `${prefix}.max_speed`, LIMITS.maxSpeedKph, issues)

  const rapidAcceleration = checkRange(
    parseNullableInt(input.rapidAcceleration),
    '急加速次数',
    `${prefix}.rapid_acceleration`,
    LIMITS.maxDailyRapidEvents,
    issues,
  )
  const rapidDeceleration = checkRange(
    parseNullableInt(input.rapidDeceleration),
    '急减速次数',
    `${prefix}.rapid_deceleration`,
    LIMITS.maxDailyRapidEvents,
    issues,
  )
  const rapidTurn = checkRange(
    parseNullableInt(input.rapidTurn),
    '急转弯次数',
    `${prefix}.rapid_turn`,
    LIMITS.maxDailyRapidEvents,
    issues,
  )

  const hasAnyMetric =
    distanceKm !== null || durationSeconds !== null || maxSpeedKph !== null ||
    rapidAcceleration !== null || rapidDeceleration !== null || rapidTurn !== null
  if (!hasAnyMetric) {
    issues.push(
      createIssue('MISSING_FIELD', `日期 ${dateKey} 的所有指标都无法解析`, { path: prefix, severity: 'error' }),
    )
    return { record: null, issues }
  }

  return {
    record: {
      date: dateKey,
      distanceKm,
      durationSeconds,
      maxSpeedKph,
      rapidAcceleration,
      rapidDeceleration,
      rapidTurn,
      issues,
    },
    issues,
  }
}

/** 便捷封装：只关心成功结果时使用。 */
export function createDayRideRecord(input: RawDayRideInput, month: MonthKey): DayRideRecord | null {
  return parseDayRideRecord(input, month).record
}

/**
 * 解析官方 `total_mileage`。
 *
 * 实测样例（`'9434.8'`、同期按天累加约 390 km、绑定时间 2025-09）表明它是
 * **车辆累计总里程（km）**，不是当月合计。因此按 km 解析，不做"与当月合计比对"的推断；
 * 月合计始终由按天数据累加得出。
 */
export function parseVehicleTotalMileageKm(raw: unknown): number | null {
  const parsed = parseNullableNumber(raw)
  if (parsed === null || parsed < 0) return null
  return round(parsed, 1)
}

/**
 * 组装月度报表。
 *
 * - 重复日期只保留第一条，并记录 `DUPLICATE_DAY`。
 * - `total_mileage` 不参与统计，只用于交叉校验（`INCONSISTENT_TOTAL`）。
 */
export function createMonthRideReport(input: RawMonthRideInput): MonthRideReport {
  const issues: DataIssue[] = []

  const month = typeof input.month === 'string' ? input.month.trim() : input.month
  if (!isMonthKey(month)) {
    throw new Error(`无法识别的月份：${String(input.month)}`)
  }
  const monthKey = month
  const vehicleId = String(input.vehicleId ?? '')
  const deviceId = String(input.deviceId ?? '')

  const firstBindRaw = typeof input.firstBindMonth === 'string' ? input.firstBindMonth.trim() : input.firstBindMonth
  const firstBindMonth = isMonthKey(firstBindRaw) ? firstBindRaw : null
  if (input.firstBindMonth !== undefined && input.firstBindMonth !== null && firstBindMonth === null) {
    issues.push(
      createIssue('UNKNOWN_UNIT', 'firstBindDate 无法解析为 yyyy-MM', {
        path: 'firstBindDate',
        value: input.firstBindMonth,
      }),
    )
  }

  const days: DayRideRecord[] = []
  const seen = new Set<string>()
  input.days.forEach((rawDay, index) => {
    const parsed = parseDayRideRecord({ ...rawDay, pathPrefix: `vehicle_report[${index}]` }, monthKey)
    for (const issue of parsed.issues) issues.push(issue)
    const record = parsed.record
    if (!record) {
      return
    }
    if (seen.has(record.date)) {
      issues.push(
        createIssue('DUPLICATE_DAY', `日期 ${record.date} 重复出现，已忽略后出现的记录`, {
          path: `vehicle_report[${index}]`,
          value: record.date,
        }),
      )
      return
    }
    seen.add(record.date)
    days.push(record)
  })
  days.sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0))

  const totalRaw =
    input.reportedTotalRaw === undefined || input.reportedTotalRaw === null
      ? null
      : String(input.reportedTotalRaw).trim()
  const vehicleTotalMileageRaw = totalRaw === '' ? null : totalRaw
  const vehicleTotalMileageKm = parseVehicleTotalMileageKm(vehicleTotalMileageRaw)
  if (vehicleTotalMileageRaw !== null && vehicleTotalMileageKm === null) {
    issues.push(
      createIssue('INVALID_NUMBER', 'total_mileage 无法解析为数值，已忽略', {
        path: 'total_mileage',
        value: vehicleTotalMileageRaw,
      }),
    )
  }

  return {
    month: monthKey,
    vehicleId,
    deviceId,
    firstBindMonth,
    vehicleTotalMileageKm,
    vehicleTotalMileageRaw,
    days,
    issues: dedupeIssues(issues),
    fetchedAt: input.fetchedAt,
    source: input.source,
  }
}

export function createDayRideStats(input: RawDayStatsInput): DayRideStats | null {
  const date = typeof input.date === 'string' ? input.date.trim() : input.date
  if (!isDateKey(date)) return null
  const issues: DataIssue[] = []
  const durationSeconds = checkRange(
    parseNullableInt(input.durationSeconds),
    '骑行时长',
    'drive_seconds',
    LIMITS.maxDailyDurationSeconds,
    issues,
  )
  const maxSpeedKph = checkRange(parseNullableNumber(input.maxSpeedKph), '最高车速', 'max_speed', LIMITS.maxSpeedKph, issues)
  const rapidAcceleration = checkRange(
    parseNullableInt(input.rapidAcceleration),
    '急加速次数',
    'rapid_acceleration',
    LIMITS.maxDailyRapidEvents,
    issues,
  )
  const rapidDeceleration = checkRange(
    parseNullableInt(input.rapidDeceleration),
    '急减速次数',
    'rapid_deceleration',
    LIMITS.maxDailyRapidEvents,
    issues,
  )
  const rapidTurn = checkRange(
    parseNullableInt(input.rapidTurn),
    '急转弯次数',
    'rapid_turn',
    LIMITS.maxDailyRapidEvents,
    issues,
  )
  const monthDistanceRaw =
    input.monthDistanceRaw === undefined || input.monthDistanceRaw === null
      ? null
      : String(input.monthDistanceRaw)
  if (monthDistanceRaw !== null) {
    issues.push(
      createIssue('UNKNOWN_UNIT', 'month_mileage 字段含义与单位未确认，未参与统计', {
        path: 'month_mileage',
        value: monthDistanceRaw,
      }),
    )
  }
  return {
    date: date as DateKey,
    durationSeconds,
    maxSpeedKph,
    monthDistanceRaw,
    rapidAcceleration,
    rapidDeceleration,
    rapidTurn,
    issues,
  }
}

export interface RawVehicleInput {
  readonly vehicleId: unknown
  readonly deviceId: unknown
  readonly vin: unknown
  readonly equipmentNum?: unknown
  readonly model?: unknown
  readonly imageUrl?: unknown
  readonly bindDate?: unknown
}

function optionalText(value: unknown): string | null {
  if (value === null || value === undefined) return null
  const text = String(value).trim()
  return text === '' ? null : text
}

export function createVehicle(input: RawVehicleInput): Vehicle | null {
  const vin = optionalText(input.vin)
  if (!vin) return null
  return {
    vehicleId: optionalText(input.vehicleId),
    deviceId: optionalText(input.deviceId),
    vin,
    equipmentNum: optionalText(input.equipmentNum),
    model: optionalText(input.model),
    imageUrl: optionalText(input.imageUrl),
    bindDate: optionalText(input.bindDate),
  }
}
