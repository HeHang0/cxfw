/**
 * 合理性阈值。超出范围的值会被标记为 `OUT_OF_RANGE` 并从统计中排除，
 * 避免官方接口异常数据（例如 GPS 漂移导致的 9999 km/h）污染年度/历史汇总。
 */
export const LIMITS = {
  /** 单日里程上限（km）。 */
  maxDailyDistanceKm: 2000,
  /** 单日骑行时长上限（秒），即 24 小时。 */
  maxDailyDurationSeconds: 24 * 60 * 60,
  /** 最高车速上限（km/h）。量产摩托不存在超过 400 的记录。 */
  maxSpeedKph: 400,
  /** 单日急事件次数上限。 */
  maxDailyRapidEvents: 2000,
} as const
