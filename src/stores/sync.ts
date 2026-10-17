import { computed, ref } from 'vue'
import { defineLiteStore } from './lite'
import { toAppError, userFacingMessage, type AppError } from '@/core/application/errors'
import type { SyncMode, SyncPlanEntry, SyncProgress, SyncRunResult, QueryableRange } from '@/core/application/HistorySyncService'
import type { FailedMonth } from '@/core/contracts/RideRepository'
import type { MonthKey } from '@/core/domain/identifiers'
import { getContainer } from '@/services/container'

export type AutoSyncStatus = 'idle' | 'running' | 'completed' | 'partial' | 'error'

/**
 * 历史档案同步状态。
 *
 * 进度、失败月份、可查询范围都保留在这里，页面只负责展示与触发。
 */

export const useSyncStore = defineLiteStore(() => {
  const range = ref<QueryableRange | null>(null)
  const plan = ref<SyncPlanEntry[]>([])
  const localMonths = ref<MonthKey[]>([])
  const failedMonths = ref<FailedMonth[]>([])
  const progress = ref<SyncProgress | null>(null)
  const lastResult = ref<SyncRunResult | null>(null)
  const lastSyncedAt = ref<string | null>(null)
  const planning = ref(false)
  const running = ref(false)
  const error = ref<AppError | null>(null)
  const autoStatus = ref<AutoSyncStatus>('idle')
  const autoResult = ref<SyncRunResult | null>(null)
  const autoAttemptedVehicles = new Set<string>()
  let cancelRequested = false

  const errorMessage = computed(() => (error.value ? userFacingMessage(error.value) : null))
  const progressPercent = computed(() =>
    progress.value && progress.value.total > 0
      ? Math.round((progress.value.completed / progress.value.total) * 100)
      : 0,
  )
  const missingCount = computed(() => plan.value.filter((entry) => entry.reason === 'missing').length)

  function requireRef() {
    const ref_ = getContainer().vehicleService.getActiveRef()
    if (!ref_) {
      error.value = toAppError(new Error('尚未选择车辆，请先到车辆页刷新车辆列表'))
      return null
    }
    return ref_
  }

  function refreshLocalState(): void {
    const ref_ = getContainer().vehicleService.getActiveRef()
    if (!ref_) return
    const service = getContainer().historySyncService
    localMonths.value = service.listLocalMonths(ref_.vehicleId)
    const state = service.getSyncState(ref_.vehicleId)
    failedMonths.value = [...(state?.failedMonths ?? [])]
    lastSyncedAt.value = state?.lastSyncedAt ?? null
  }

  async function plan_(mode: SyncMode = 'missing'): Promise<void> {
    const ref_ = requireRef()
    if (!ref_) return
    planning.value = true
    error.value = null
    try {
      const service = getContainer().historySyncService
      range.value = await service.resolveQueryableRange(ref_)
      plan.value = service.planSync(ref_, range.value, { mode })
      refreshLocalState()
    } catch (caught) {
      error.value = toAppError(caught)
    } finally {
      planning.value = false
    }
  }

  async function run(mode: SyncMode = 'missing'): Promise<SyncRunResult | null> {
    const ref_ = requireRef()
    if (!ref_ || running.value) return null
    running.value = true
    cancelRequested = false
    error.value = null
    progress.value = { total: 0, completed: 0, currentMonth: null, ok: true }
    try {
      const result = await getContainer().historySyncService.sync(ref_, {
        mode,
        onProgress: (event) => {
          progress.value = event
        },
        shouldCancel: () => cancelRequested,
      })
      lastResult.value = result.data
      error.value = result.status === 'error' ? result.error : null
      refreshLocalState()
      plan.value = []
      return result.data
    } catch (caught) {
      error.value = toAppError(caught)
      return null
    } finally {
      running.value = false
    }
  }

  /**
   * 首次进入档案时自动补齐缺失月份。
   *
   * 每个车辆在当前小程序生命周期内只自动尝试一次，避免切换页面后反复请求；
   * 已完成的月份立即写缓存，失败时保留有效缓存，并交给页面展示重试入口。
   */
  async function autoFillMissing(options: { force?: boolean } = {}): Promise<void> {
    const ref_ = requireRef()
    if (!ref_ || running.value) return
    if (!options.force && autoAttemptedVehicles.has(ref_.vehicleId)) return
    autoAttemptedVehicles.add(ref_.vehicleId)
    autoStatus.value = 'running'
    autoResult.value = null
    progress.value = null
    error.value = null

    try {
      await plan_('missing')
      if (error.value) {
        autoStatus.value = 'error'
        return
      }
      if (plan.value.length === 0) {
        autoStatus.value = 'idle'
        return
      }

      const result = await run('missing')
      autoResult.value = result
      if (!result) {
        autoStatus.value = 'error'
        return
      }
      autoStatus.value = result.failed.length > 0 || result.cancelled ? 'partial' : 'completed'
    } catch (caught) {
      error.value = toAppError(caught)
      autoStatus.value = 'error'
    }
  }

  function retryAutoFill(): Promise<void> {
    return autoFillMissing({ force: true })
  }

  function dismissAutoNotice(): void {
    autoStatus.value = 'idle'
  }

  async function syncOneMonth(month: MonthKey): Promise<void> {
    const ref_ = requireRef()
    if (!ref_) return
    running.value = true
    error.value = null
    try {
      const result = await getContainer().historySyncService.syncMonth(ref_, month)
      error.value = result.status === 'error' ? result.error : null
      refreshLocalState()
    } catch (caught) {
      error.value = toAppError(caught)
    } finally {
      running.value = false
    }
  }

  function cancel(): void {
    cancelRequested = true
  }

  function clearError(): void {
    error.value = null
  }

  return {
    range,
    plan,
    localMonths,
    failedMonths,
    progress,
    lastResult,
    lastSyncedAt,
    planning,
    running,
    error,
    autoStatus,
    autoResult,
    errorMessage,
    progressPercent,
    missingCount,
    restore: refreshLocalState,
    refresh: refreshLocalState,
    planSync: plan_,
    autoFillMissing,
    retryAutoFill,
    dismissAutoNotice,
    run,
    syncOneMonth,
    cancel,
    clearError,
  }
})
