import type { DateKey, DateTimeText, MonthKey } from './identifiers'

/**
 * 纯日期/月份工具。全部基于字符串与本地时间，不依赖 uni-app 或第三方日期库。
 * 小程序与 Web 端行为一致：`Date` 只用于"当前时间"的换算，不参与跨时区解析。
 */

const MONTH_PATTERN = /^\d{4}-(0[1-9]|1[0-2])$/
const DATE_PATTERN = /^\d{4}-(0[1-9]|1[0-2])-(0[1-9]|[12]\d|3[01])$/

export function isMonthKey(value: unknown): value is MonthKey {
  return typeof value === 'string' && MONTH_PATTERN.test(value)
}

export function isDateKey(value: unknown): value is DateKey {
  return typeof value === 'string' && DATE_PATTERN.test(value) && isValidDateKey(value as DateKey)
}

function isValidDateKey(key: DateKey): boolean {
  const parts = key.split('-')
  const year = Number(parts[0])
  const month = Number(parts[1])
  const day = Number(parts[2])
  return day <= daysInMonth(`${year}-${String(month).padStart(2, '0')}` as MonthKey)
}

export function pad2(value: number): string {
  return value < 10 ? `0${value}` : String(value)
}

export function formatMonth(date: Date): MonthKey {
  return `${date.getFullYear()}-${pad2(date.getMonth() + 1)}` as MonthKey
}

export function formatDate(date: Date): DateKey {
  return `${formatMonth(date)}-${pad2(date.getDate())}` as DateKey
}

export function parseDateKey(key: DateKey): { year: number; month: number; day: number } {
  const parts = key.split('-')
  return { year: Number(parts[0]), month: Number(parts[1]), day: Number(parts[2]) }
}

export function parseMonthKey(key: MonthKey): { year: number; month: number } {
  const parts = key.split('-')
  return { year: Number(parts[0]), month: Number(parts[1]) }
}

export function monthOf(date: DateKey): MonthKey {
  return date.slice(0, 7) as MonthKey
}

export function daysInMonth(month: MonthKey): number {
  const { year, month: m } = parseMonthKey(month)
  return new Date(year, m, 0).getDate()
}

export function compareMonth(a: MonthKey, b: MonthKey): number {
  return a < b ? -1 : a > b ? 1 : 0
}

export function compareDate(a: DateKey, b: DateKey): number {
  return a < b ? -1 : a > b ? 1 : 0
}

export function addMonths(month: MonthKey, delta: number): MonthKey {
  const { year, month: m } = parseMonthKey(month)
  const zeroBased = year * 12 + (m - 1) + delta
  const nextYear = Math.floor(zeroBased / 12)
  const nextMonth = (zeroBased % 12) + 1
  return `${nextYear}-${pad2(nextMonth)}` as MonthKey
}

export function monthSpan(from: MonthKey, to: MonthKey): number {
  const a = parseMonthKey(from)
  const b = parseMonthKey(to)
  return (b.year * 12 + b.month) - (a.year * 12 + a.month)
}

/** 含首尾的月份枚举；`from > to` 时返回空数组。 */
export function enumerateMonths(from: MonthKey, to: MonthKey): MonthKey[] {
  const span = monthSpan(from, to)
  if (span < 0) return []
  const result: MonthKey[] = []
  for (let i = 0; i <= span; i += 1) result.push(addMonths(from, i))
  return result
}

/** 枚举某个月的全部日期。 */
export function enumerateDates(month: MonthKey): DateKey[] {
  const total = daysInMonth(month)
  const result: DateKey[] = []
  for (let day = 1; day <= total; day += 1) {
    result.push(`${month}-${pad2(day)}` as DateKey)
  }
  return result
}

export function enumerateDatesUpTo(month: MonthKey, upTo: DateKey): DateKey[] {
  return enumerateDates(month).filter((date) => compareDate(date, upTo) <= 0)
}

export function yearOf(month: MonthKey): number {
  return parseMonthKey(month).year
}

/** epoch 毫秒 → 本地时区下的 `yyyy-MM`，非法输入返回 null。 */
export function monthFromEpochMs(value: unknown): MonthKey | null {
  const ms = typeof value === 'number' ? value : typeof value === 'string' ? Number(value) : NaN
  if (!Number.isFinite(ms) || ms <= 0) return null
  return formatMonth(new Date(ms))
}

/** epoch 毫秒 → 本地时区下的 `yyyy-MM-dd`，非法输入返回 null。 */
export function dateFromEpochMs(value: unknown): DateKey | null {
  const ms = typeof value === 'number' ? value : typeof value === 'string' ? Number(value) : NaN
  if (!Number.isFinite(ms) || ms <= 0) return null
  return formatDate(new Date(ms))
}

export function monthsOfYear(year: number): MonthKey[] {
  const result: MonthKey[] = []
  for (let month = 1; month <= 12; month += 1) result.push(`${year}-${pad2(month)}` as MonthKey)
  return result
}

/**
 * 把 `yyyy-MM-dd` 解释为**本地时间**零点，返回 epoch 毫秒。
 *
 * `/app/ride/report/v2` 的 `date` 参数要求 epoch 毫秒。api.yaml 给的样例
 * `1792080000000` 对应 UTC+8 的 `2026-10-16 00:00:00`，因此这里按本地时区零点换算。
 */
export function dateKeyToEpochMs(key: DateKey): number {
  const { year, month, day } = parseDateKey(key)
  return new Date(year, month - 1, day, 0, 0, 0, 0).getTime()
}

export function dateToDateTimeText(key: DateKey, time: string): DateTimeText {
  return `${key} ${time}` as DateTimeText
}

export function startOfDayText(key: DateKey): DateTimeText {
  return dateToDateTimeText(key, '00:00:00')
}

export function endOfDayText(key: DateKey): DateTimeText {
  return dateToDateTimeText(key, '23:59:59')
}

/** 从任意 ISO/时间戳文本中取出 `yyyy-MM-dd` 部分，失败返回 null。 */
export function extractDateKey(text: unknown): DateKey | null {
  if (typeof text !== 'string') return null
  const match = /(\d{4})-(\d{2})-(\d{2})/.exec(text)
  if (!match) return null
  const candidate = `${match[1]}-${match[2]}-${match[3]}`
  return isDateKey(candidate) ? candidate : null
}

/** 从任意文本中取出 `yyyy-MM` 部分，失败返回 null。 */
export function extractMonthKey(text: unknown): MonthKey | null {
  if (typeof text === 'string' && MONTH_PATTERN.test(text.trim())) return text.trim() as MonthKey
  const date = extractDateKey(text)
  return date ? monthOf(date) : null
}

/** 该月份是否已经结束（相对给定"今天"）。 */
export function isMonthFinished(month: MonthKey, today: DateKey): boolean {
  return monthOf(today) > month
}

/** 该月份是否尚未开始。 */
export function isMonthFuture(month: MonthKey, today: DateKey): boolean {
  return monthOf(today) < month
}

/** 月内在"今天"之前已经过去的天数；未来月份为 0，已结束月份为整月天数。 */
export function elapsedDaysInMonth(month: MonthKey, today: DateKey): number {
  if (isMonthFuture(month, today)) return 0
  if (isMonthFinished(month, today)) return daysInMonth(month)
  return parseDateKey(today).day
}

export function toMinuteText(date: Date): string {
  return `${formatDate(date)} ${pad2(date.getHours())}:${pad2(date.getMinutes())}:${pad2(date.getSeconds())}`
}
