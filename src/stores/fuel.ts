import { computed, ref } from 'vue'
import { defineLiteStore } from './lite'
import { toAppError, userFacingMessage, type AppError } from '@/core/application/errors'
import type { FuelMonthView, FuelVehicleContext } from '@/core/application/FuelService'
import { formatMonth } from '@/core/domain/datetime'
import type { DateKey, MonthKey, VehicleRef } from '@/core/domain/identifiers'
import type { RefuelRecord } from '@/core/domain/models'
import { getContainer } from '@/services/container'

export const useFuelStore = defineLiteStore(() => {
  const container = getContainer()
  const month = ref<MonthKey>(formatMonth(container.clock.now()))
  const view = ref<FuelMonthView | null>(null)
  const records = ref<RefuelRecord[]>([])
  const tankCapacity = ref(12)
  const loading = ref(false)
  const error = ref<AppError | null>(null)
  let lastContext: FuelVehicleContext & { hasRideRecords?: boolean } = {}

  const errorMessage = computed(() => (error.value ? userFacingMessage(error.value) : null))

  function requireRef(): VehicleRef | null {
    const ref_ = container.vehicleService.getActiveRef()
    if (!ref_) error.value = toAppError(new Error('请先选择车辆'))
    return ref_
  }

  function reloadRecords(): void {
    const ref_ = requireRef()
    records.value = ref_ ? container.fuelService.listRecords(ref_) : []
  }

  async function load(
    targetMonth: MonthKey = month.value,
    options: FuelVehicleContext & { hasRideRecords?: boolean } = {},
  ): Promise<void> {
    const ref_ = requireRef()
    if (!ref_) return
    month.value = targetMonth
    lastContext = { ...lastContext, ...options }
    loading.value = true
    error.value = null
    try {
      const result = await container.fuelService.getMonthFuel(ref_, targetMonth, lastContext)
      view.value = result.data
      tankCapacity.value = result.data?.tankCapacityLiters ?? container.fuelService.getTankCapacity(ref_)
      records.value = container.fuelService.listRecords(ref_)
      error.value = result.status === 'error' ? result.error : null
    } catch (caught) {
      error.value = toAppError(caught)
    } finally {
      loading.value = false
    }
  }

  function setTankCapacity(liters: number): boolean {
    const ref_ = requireRef()
    if (!ref_) return false
    try {
      tankCapacity.value = container.fuelService.setTankCapacity(ref_, liters)
      void load()
      return true
    } catch (caught) {
      error.value = toAppError(caught)
      return false
    }
  }

  function add(input: {
    refueledAt: string
    liters: number
    price?: number | null
    grade?: string | null
  }): boolean {
    const ref_ = requireRef()
    if (!ref_) return false
    try {
      container.fuelService.addRecordWithPrice(ref_, input)
      reloadRecords()
      return true
    } catch (caught) {
      error.value = toAppError(caught)
      return false
    }
  }

  function remove(time: string): void {
    const ref_ = requireRef()
    if (!ref_) return
    container.fuelService.removeRecord(ref_, time)
    reloadRecords()
  }

  function importJson(payload: unknown): { imported: number; total: number } | null {
    const ref_ = requireRef()
    if (!ref_) return null
    try {
      const result = container.fuelService.importRecords(ref_, payload)
      reloadRecords()
      return result
    } catch (caught) {
      error.value = toAppError(caught)
      return null
    }
  }

  function exportPayload(): unknown {
    const ref_ = requireRef()
    return ref_ ? container.fuelService.exportPayload(ref_) : null
  }

  async function lookupPrice(province: string, date: DateKey) {
    try {
      return await container.fuelService.lookupPrice(province, date)
    } catch (caught) {
      error.value = toAppError(caught)
      return null
    }
  }

  function clearError(): void {
    error.value = null
  }

  return {
    month,
    view,
    records,
    tankCapacity,
    loading,
    error,
    errorMessage,
    load,
    add,
    setTankCapacity,
    lookupPrice,
    remove,
    importJson,
    exportPayload,
    reloadRecords,
    clearError,
  }
})
