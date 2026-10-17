import type { DateKey, MonthKey } from '../identifiers'
import type { DataIssue } from '../issues'

/**
 * 数据覆盖状态：
 * - `complete`：范围内每个已过去的时间单位都有数据。
 * - `partial`：有数据但存在缺失（缺月份/缺天数/字段无法解析）。
 * - `unavailable`：完全没有可用数据。
 */
export type CoverageStatus = 'complete' | 'partial' | 'unavailable'

export interface DailyTrendPoint {
  readonly date: DateKey
  readonly distanceKm: number | null
  readonly durationSeconds: number | null
  readonly maxSpeedKph: number | null
}

export interface MonthlyTrendPoint {
  readonly month: MonthKey
  readonly distanceKm: number | null
  readonly durationSeconds: number | null
  readonly rideDays: number | null
  readonly maxSpeedKph: number | null
  /** 该月是否有本地数据。false 表示"未知"，不代表 0。 */
  readonly hasData: boolean
}

export interface LongestRideDay {
  readonly date: DateKey
  readonly distanceKm: number
}

export interface TopSpeedRecord {
  readonly date: DateKey
  readonly speedKph: number
}

export interface RapidEventSummary {
  readonly acceleration: number | null
  readonly deceleration: number | null
  readonly turn: number | null
  /** 有急事件数据的有效天数。 */
  readonly coveredDays: number
  /** 范围内没有急事件数据的天数（这些天不能当作 0）。 */
  readonly missingDays: number
}

export interface MonthlyStatistics {
  readonly month: MonthKey
  readonly status: CoverageStatus
  /** 是否为"当前尚未结束"的月份。 */
  readonly inProgress: boolean
  readonly coverage: {
    /** 有数据的天数。 */
    readonly daysWithData: number
    /** 已过去的天数（当前月为今天之前的天数）。 */
    readonly daysElapsed: number
    /** 该月自然天数。 */
    readonly daysInMonth: number
    /** 已过去但没有骑行记录的天数（已结束月份视为"没有骑行"，不是"数据缺失"）。 */
    readonly daysWithoutRecord: number
    /** 该月最后一条记录的日期，用于说明"数据覆盖到哪天"。 */
    readonly lastRecordedDate: DateKey | null
  }
  readonly totalDistanceKm: number | null
  readonly totalDurationSeconds: number | null
  readonly rideDays: number
  /** 日均里程（按"有骑行的天"平均）。 */
  readonly averageDistancePerRideDayKm: number | null
  /** 日均里程（按"已过去的天"平均）。 */
  readonly averageDistancePerElapsedDayKm: number | null
  readonly dailyTrend: readonly DailyTrendPoint[]
  readonly longestRideDay: LongestRideDay | null
  readonly topSpeed: TopSpeedRecord | null
  readonly rapid: RapidEventSummary
  readonly issues: readonly DataIssue[]
}

export interface YearlyStatistics {
  readonly year: number
  readonly status: CoverageStatus
  readonly inProgress: boolean
  /** 有数据的月份。 */
  readonly monthsCovered: readonly MonthKey[]
  /** 该月确实没有骑行记录（服务端返回空）。 */
  readonly monthsWithoutData: readonly MonthKey[]
  /** 尚未获取到的月份，属于"未知"。 */
  readonly monthsUnknown: readonly MonthKey[]
  readonly totalDistanceKm: number | null
  readonly totalDurationSeconds: number | null
  readonly rideDays: number
  readonly monthlyTrend: readonly MonthlyTrendPoint[]
  readonly topSpeed: TopSpeedRecord | null
  readonly longestRideDay: LongestRideDay | null
  readonly rapid: RapidEventSummary
  readonly issues: readonly DataIssue[]
}

export interface LifetimeStatistics {
  readonly status: CoverageStatus
  /** 数据实际覆盖范围。 */
  readonly range: { readonly from: MonthKey; readonly to: MonthKey } | null
  readonly monthsCovered: number
  readonly monthsWithoutData: readonly MonthKey[]
  readonly monthsUnknown: readonly MonthKey[]
  readonly totalDistanceKm: number | null
  readonly totalDurationSeconds: number | null
  readonly totalRideDays: number
  readonly topSpeed: TopSpeedRecord | null
  readonly longestRideDay: LongestRideDay | null
  readonly rapid: RapidEventSummary
  readonly monthlyTrend: readonly MonthlyTrendPoint[]
  readonly issues: readonly DataIssue[]
  readonly generatedAt: string
}
