import { computed, ref } from 'vue'
import { defineLiteStore } from './lite'
import { toAppError, userFacingMessage, type AppError } from '@/core/application/errors'
import type { DateKey } from '@/core/domain/identifiers'
import type { RideHistoryDetail, RideHistoryItem } from '@/core/domain/models'
import { getContainer } from '@/services/container'

export const useRideHistoryStore = defineLiteStore(() => {
  const container = getContainer()
  const date = ref<DateKey | null>(null)
  const trips = ref<RideHistoryItem[]>([])
  const detail = ref<RideHistoryDetail | null>(null)
  const loading = ref(false)
  const detailLoading = ref(false)
  const error = ref<AppError | null>(null)

  const errorMessage = computed(() => (error.value ? userFacingMessage(error.value) : null))

  function requireRef() {
    const ref_ = container.vehicleService.getActiveRef()
    if (!ref_) error.value = toAppError(new Error('请先选择车辆'))
    return ref_
  }

  async function loadDay(target: DateKey): Promise<void> {
    const ref_ = requireRef()
    if (!ref_) return
    date.value = target
    loading.value = true
    error.value = null
    trips.value = []
    try {
      const result = await container.rideHistoryService.listDayTrips(ref_, target)
      trips.value = result.data?.items ? [...result.data.items] : []
      error.value = result.status === 'error' ? result.error : null
    } catch (caught) {
      error.value = toAppError(caught)
      trips.value = []
    } finally {
      loading.value = false
    }
  }

  async function loadDetail(id: string): Promise<void> {
    const ref_ = requireRef()
    if (!ref_) return
    detailLoading.value = true
    error.value = null
    detail.value = null
    try {
      const result = await container.rideHistoryService.getDetail(ref_, id)
      detail.value = result.data
      error.value = result.status === 'error' ? result.error : null
    } catch (caught) {
      error.value = toAppError(caught)
      detail.value = null
    } finally {
      detailLoading.value = false
    }
  }

  return {
    date,
    trips,
    detail,
    loading,
    detailLoading,
    error,
    errorMessage,
    loadDay,
    loadDetail,
  }
})
