import type { MonthKey } from '../identifiers'
import { dedupeIssues, type DataIssue } from '../issues'
import type { DayRideRecord, MonthRideReport } from '../models'
import { round, sumKnown, type SumResult } from '../numbers'
import type { LongestRideDay, MonthlyTrendPoint, RapidEventSummary, TopSpeedRecord } from './types'

/**
 * 月/年/历史三套统计的公共计算。
 * 每个函数都是纯函数：输入缺失数据时返回 null 并把缺失量单独统计出来，
 * 绝不把"未知"当作 0 参与汇总。
 */

export function isRideDay(day: DayRideRecord): boolean {
  const distance = day.distanceKm ?? 0
  const duration = day.durationSeconds ?? 0
  return distance > 0 || duration > 0
}

export interface RideTotals {
  readonly totalDistanceKm: number | null
  readonly totalDurationSeconds: number | null
  readonly rideDays: number
  readonly distanceSum: SumResult
  readonly durationSum: SumResult
}

export function sumDays(days: readonly DayRideRecord[]): RideTotals {
  const distanceSum = sumKnown(days.map((day) => day.distanceKm))
  const durationSum = sumKnown(days.map((day) => day.durationSeconds))
  return {
    totalDistanceKm: distanceSum.total === null ? null : round(distanceSum.total, 2),
    totalDurationSeconds: durationSum.total === null ? null : Math.round(durationSum.total),
    rideDays: days.filter(isRideDay).length,
    distanceSum,
    durationSum,
  }
}

export function findLongestRideDay(days: readonly DayRideRecord[]): LongestRideDay | null {
  let best: LongestRideDay | null = null
  for (const day of days) {
    if (day.distanceKm === null || day.distanceKm <= 0) continue
    if (!best || day.distanceKm > best.distanceKm) {
      best = { date: day.date, distanceKm: round(day.distanceKm, 2) }
    }
  }
  return best
}

export function findTopSpeed(days: readonly DayRideRecord[]): TopSpeedRecord | null {
  let best: TopSpeedRecord | null = null
  for (const day of days) {
    if (day.maxSpeedKph === null || day.maxSpeedKph <= 0) continue
    if (!best || day.maxSpeedKph > best.speedKph) {
      best = { date: day.date, speedKph: round(day.maxSpeedKph, 1) }
    }
  }
  return best
}

/**
 * 急事件汇总。
 *
 * 只要某天的急加速/急减速/急转弯字段全为 null，就视为"该天没有数据"并计入 `missingDays`，
 * 而不是按 0 计入总和。这样上层看到 `missingDays > 0` 就能明确提示统计不完整。
 */
export function summarizeRapidEvents(days: readonly DayRideRecord[]): RapidEventSummary {
  let acceleration: number | null = null
  let deceleration: number | null = null
  let turn: number | null = null
  let coveredDays = 0
  let missingDays = 0

  for (const day of days) {
    const hasData = day.rapidAcceleration !== null || day.rapidDeceleration !== null || day.rapidTurn !== null
    if (hasData) coveredDays += 1
    else missingDays += 1
    if (day.rapidAcceleration !== null) acceleration = (acceleration ?? 0) + day.rapidAcceleration
    if (day.rapidDeceleration !== null) deceleration = (deceleration ?? 0) + day.rapidDeceleration
    if (day.rapidTurn !== null) turn = (turn ?? 0) + day.rapidTurn
  }

  return { acceleration, deceleration, turn, coveredDays, missingDays }
}

export function mergeRapidSummaries(items: readonly RapidEventSummary[]): RapidEventSummary {
  let acceleration: number | null = null
  let deceleration: number | null = null
  let turn: number | null = null
  let coveredDays = 0
  let missingDays = 0
  for (const item of items) {
    if (item.acceleration !== null) acceleration = (acceleration ?? 0) + item.acceleration
    if (item.deceleration !== null) deceleration = (deceleration ?? 0) + item.deceleration
    if (item.turn !== null) turn = (turn ?? 0) + item.turn
    coveredDays += item.coveredDays
    missingDays += item.missingDays
  }
  return { acceleration, deceleration, turn, coveredDays, missingDays }
}

/** 由月度报表生成趋势点。`null` 报表表示"未知"；`hasData=true` 且值为 0 表示"确实没骑"。 */
export function monthlyTrendPoint(month: MonthKey, report: MonthRideReport | null): MonthlyTrendPoint {
  if (!report) {
    return { month, distanceKm: null, durationSeconds: null, rideDays: null, maxSpeedKph: null, hasData: false }
  }
  const totals = sumDays(report.days)
  const topSpeed = findTopSpeed(report.days)
  return {
    month,
    distanceKm: totals.totalDistanceKm,
    durationSeconds: totals.totalDurationSeconds,
    rideDays: totals.rideDays,
    maxSpeedKph: topSpeed === null ? null : topSpeed.speedKph,
    hasData: true,
  }
}

export function collectDayIssues(days: readonly DayRideRecord[]): DataIssue[] {
  const issues: DataIssue[] = []
  for (const day of days) for (const issue of day.issues) issues.push(issue)
  return issues
}

export function dedupeAndCollect(...groups: readonly (readonly DataIssue[])[]): DataIssue[] {
  const all: DataIssue[] = []
  for (const group of groups) for (const issue of group) all.push(issue)
  return dedupeIssues(all)
}
