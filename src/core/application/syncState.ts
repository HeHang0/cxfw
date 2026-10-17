import type { FailedMonth, VehicleSyncState } from '../contracts/RideRepository'
import { compareMonth } from '../domain/datetime'
import type { MonthKey } from '../domain/identifiers'
import type { MonthRideReport } from '../domain/models'
import { errorCode, toAppError } from './errors'

/**
 * 同步状态的不可变更新工具。
 *
 * 关键约定：**失败时只追加 `failedMonths`，绝不删除已缓存的有效数据**。
 */

export function withSyncedMonth(
  state: VehicleSyncState,
  month: MonthKey,
  report: MonthRideReport | null,
  at: string,
): VehicleSyncState {
  const syncedMonths = addMonth(state.syncedMonths, month)
  const emptyMonths =
    report === null ? addMonth(state.emptyMonths, month) : state.emptyMonths.filter((item) => item !== month)
  const earliestCandidates = [state.earliestMonth, report?.firstBindMonth ?? null, month].filter(
    (item): item is MonthKey => item !== null,
  )
  const earliestMonth = earliestCandidates.reduce<MonthKey | null>(
    (min, item) => (min === null || compareMonth(item, min) < 0 ? item : min),
    null,
  )
  return {
    ...state,
    syncedMonths,
    emptyMonths,
    earliestMonth,
    lastSyncedAt: at,
    failedMonths: state.failedMonths.filter((item) => item.month !== month),
  }
}

export function withFailedMonth(
  state: VehicleSyncState,
  month: MonthKey,
  error: unknown,
  at: string,
): VehicleSyncState {
  const appError = toAppError(error)
  const failure: FailedMonth = { month, code: errorCode(error), message: appError.message, at }
  return {
    ...state,
    failedMonths: [...state.failedMonths.filter((item) => item.month !== month), failure].sort((a, b) =>
      compareMonth(a.month, b.month),
    ),
  }
}

export function isEmptyMonth(state: VehicleSyncState | null, month: MonthKey): boolean {
  if (!state) return false
  return state.emptyMonths.includes(month)
}

function addMonth(months: readonly MonthKey[], month: MonthKey): MonthKey[] {
  if (months.includes(month)) return [...months]
  return [...months, month].sort(compareMonth)
}
