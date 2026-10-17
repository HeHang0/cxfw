import type { MonthKey } from '@/core/domain/identifiers'

/** 展示层格式化。未知值统一显示为 '—'，避免把 null 当成 0 展示。 */

export const UNKNOWN_TEXT = '—'

export function formatNumber(value: number | null | undefined, digits = 1): string {
  if (value === null || value === undefined || !Number.isFinite(value)) return UNKNOWN_TEXT
  return value.toFixed(digits)
}

export function formatKm(value: number | null | undefined, digits = 1): string {
  const text = formatNumber(value, digits)
  return text === UNKNOWN_TEXT ? text : `${text} km`
}

export function formatDuration(seconds: number | null | undefined): string {
  if (seconds === null || seconds === undefined || !Number.isFinite(seconds)) return UNKNOWN_TEXT
  const total = Math.round(seconds)
  const hours = Math.floor(total / 3600)
  const minutes = Math.floor((total % 3600) / 60)
  if (hours === 0 && minutes === 0) return `${total}s`
  if (hours === 0) return `${minutes}min`
  if (minutes === 0) return `${hours}h`
  return `${hours}h ${minutes}min`
}

/** 统计卡片用的紧凑时长，避免长时间文本在三分栏里换行。 */
export function formatDurationShort(seconds: number | null | undefined): string {
  if (seconds === null || seconds === undefined || !Number.isFinite(seconds)) return UNKNOWN_TEXT
  const total = Math.max(0, Math.round(seconds))
  if (total >= 3600) return `${(total / 3600).toFixed(1)}h`
  if (total >= 60) return `${Math.round(total / 60)}min`
  return `${total}s`
}

export function formatSpeed(value: number | null | undefined, digits = 1): string {
  const text = formatNumber(value, digits)
  return text === UNKNOWN_TEXT ? text : `${text} km/h`
}

export function formatCount(value: number | null | undefined): string {
  if (value === null || value === undefined || !Number.isFinite(value)) return UNKNOWN_TEXT
  return String(Math.round(value))
}

export function formatMonthLabel(month: MonthKey): string {
  const [year, index] = month.split('-')
  return `${year} 年 ${Number(index)} 月`
}

export function formatDayLabel(date: string): string {
  const parts = date.split('-')
  if (parts.length !== 3) return date
  return `${Number(parts[1])}/${Number(parts[2])}`
}

/** `2026-10-15` → `10 月 15 日`（设计稿里「最近骑行」用的格式）。 */
export function formatMonthDay(date: string): string {
  const parts = date.split('-')
  if (parts.length !== 3) return date
  return `${Number(parts[1])} 月 ${Number(parts[2])} 日`
}

/** 取月份字符串里的「几月」，用于柱状图标签。 */
export function formatMonthShort(month: string): string {
  const parts = month.split('-')
  if (parts.length !== 2) return month
  return `${Number(parts[1])}月`
}

export function formatCoverageStatus(status: 'complete' | 'partial' | 'unavailable'): string {
  if (status === 'complete') return '数据完整'
  if (status === 'partial') return '数据不完整'
  return '暂无数据'
}

export function formatDateTimeText(iso: string | null | undefined): string {
  if (!iso) return UNKNOWN_TEXT
  const date = new Date(iso)
  if (Number.isNaN(date.getTime())) return iso
  const pad = (value: number): string => (value < 10 ? `0${value}` : String(value))
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} ${pad(date.getHours())}:${pad(date.getMinutes())}`
}

/**
 * 手机号/车架号/设备号等敏感信息的中间脱敏，保留首尾便于用户核对。
 * 设计稿的「车辆信息」卡片也是这个做法（`LF2***8971`）。
 */
export function maskMiddle(text: string | null | undefined, head = 3, tail = 4): string {
  if (!text) return UNKNOWN_TEXT
  if (text.length <= head + tail) return text
  return `${text.slice(0, head)}***${text.slice(-tail)}`
}

/** 只取日期部分：`2025-09-24 23:37:32` → `2025-09-24`。 */
export function formatDateOnly(text: string | null | undefined): string {
  if (!text) return UNKNOWN_TEXT
  const match = /(\d{4}-\d{2}-\d{2})/.exec(text)
  return match?.[1] ?? text
}
