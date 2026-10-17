import type { DataIssue } from '../domain/issues'
import type { MonthKey } from '../domain/identifiers'
import type { FailedMonth } from '../contracts/RideRepository'
import type { AppError } from './errors'

/**
 * 业务用例的统一返回结构。
 *
 * `status` 与 `error` 并存是有意的：拉取 12 个月里有 3 个月失败时，
 * 仍然返回已经拿到的部分数据（`status: 'partial'`），同时把失败月份列出来。
 */

export type ResultStatus =
  | 'ok'
  /** 有数据但覆盖不完整（缺月份/字段无法解析/拉取失败）。 */
  | 'partial'
  /** 请求成功但确实没有数据。 */
  | 'empty'
  /** 完全失败，没有可用数据。 */
  | 'error'

export interface ResultMeta {
  /** 数据是否主要来自本地缓存。 */
  readonly fromCache: boolean
  /** 缓存写入时间（ISO），无缓存时为 null。 */
  readonly cachedAt: string | null
  /** 本次真正发起网络请求的月份。 */
  readonly fetchedMonths: readonly MonthKey[]
  /** 本次拉取失败的月份（已有缓存会被保留）。 */
  readonly failedMonths: readonly FailedMonth[]
  /** 数据质量问题，供页面提示。 */
  readonly issues: readonly DataIssue[]
}

export interface DataResult<T> {
  readonly data: T | null
  readonly status: ResultStatus
  readonly error: AppError | null
  readonly meta: ResultMeta
}

export function emptyMeta(): ResultMeta {
  return { fromCache: false, cachedAt: null, fetchedMonths: [], failedMonths: [], issues: [] }
}

export function okResult<T>(data: T, meta: Partial<ResultMeta> = {}): DataResult<T> {
  return { data, status: 'ok', error: null, meta: { ...emptyMeta(), ...meta } }
}

export function partialResult<T>(data: T, meta: Partial<ResultMeta> = {}): DataResult<T> {
  return { data, status: 'partial', error: null, meta: { ...emptyMeta(), ...meta } }
}

export function errorResult<T>(error: AppError, meta: Partial<ResultMeta> = {}): DataResult<T> {
  return { data: null, status: 'error', error, meta: { ...emptyMeta(), ...meta } }
}
