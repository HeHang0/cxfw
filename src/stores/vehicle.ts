import { computed, ref } from 'vue'
import { defineLiteStore } from './lite'
import { toAppError, userFacingMessage, type AppError } from '@/core/application/errors'
import type { DataIssue } from '@/core/domain/issues'
import type { VehicleRef } from '@/core/domain/identifiers'
import type { Vehicle, VehicleState, VehicleTelemetry } from '@/core/domain/models'
import { toVehicleRef } from '@/core/domain/vehicle'
import { getContainer } from '@/services/container'

/**
 * 车辆列表、当前选中车辆与车辆状态。
 *
 * 与 auth store 一样，缓存数据在创建时直接读取，页面不必再调用 restore()。
 */

export const useVehicleStore = defineLiteStore(() => {
  const container = getContainer()
  const service = container.vehicleService
  const cached = service.loadCachedVehicles()

  const vehicles = ref<Vehicle[]>(cached.map((item) => item.vehicle))
  const activeVehicleId = ref<string | null>(service.getActiveVehicleId())
  const state = ref<VehicleState | null>(null)
  const telemetry = ref<VehicleTelemetry | null>(null)
  const loading = ref(false)
  const stateLoading = ref(false)
  const telemetryLoading = ref(false)
  const error = ref<AppError | null>(null)
  const issues = ref<DataIssue[]>([])
  const loadedOnce = ref(false)
  let telemetryTask: Promise<void> | null = null

  const activeVehicle = computed<Vehicle | null>(() => {
    if (vehicles.value.length === 0) return null
    const id = activeVehicleId.value
    if (id === null) return vehicles.value[0] ?? null
    return vehicles.value.find((item) => item.vehicleId === id) ?? vehicles.value[0] ?? null
  })

  const activeRef = computed<VehicleRef | null>(() => {
    const vehicle = activeVehicle.value
    return vehicle ? toVehicleRef(vehicle) : null
  })

  const errorMessage = computed(() => (error.value ? userFacingMessage(error.value) : null))
  const missingFields = computed(() => {
    const vehicle = activeVehicle.value
    if (!vehicle) return []
    const missing: string[] = []
    if (!vehicle.vehicleId) missing.push('vehicleId')
    if (!vehicle.deviceId) missing.push('deviceId')
    if (!vehicle.vin) missing.push('vin')
    return missing
  })

  /** 从本地存储重新读取车辆缓存。 */
  function reloadFromStorage(): void {
    vehicles.value = service.loadCachedVehicles().map((item) => item.vehicle)
    activeVehicleId.value = service.getActiveVehicleId()
  }

  /** 会话切换后清掉内存中的旧账号车辆，后续页面会按新会话重新加载。 */
  function resetForSession(): void {
    reloadFromStorage()
    state.value = null
    telemetry.value = null
    issues.value = []
    error.value = null
    loadedOnce.value = false
  }

  async function load(refresh = false): Promise<void> {
    loading.value = true
    error.value = null
    try {
      const result = await service.listVehicles({ refresh })
      if (result.data) vehicles.value = result.data.map((item) => item.vehicle)
      issues.value = [...result.meta.issues]
      error.value = result.status === 'error' ? result.error : null
      loadedOnce.value = true
    } catch (caught) {
      error.value = toAppError(caught)
    } finally {
      loading.value = false
    }
  }

  function select(vehicleId: string | null): void {
    service.selectVehicle(vehicleId)
    activeVehicleId.value = vehicleId
    state.value = null
    telemetry.value = null
  }

  async function loadState(): Promise<void> {
    const ref_ = activeRef.value
    if (!ref_) {
      error.value = toAppError(new Error('车辆标识不完整，无法查询状态'))
      return
    }
    stateLoading.value = true
    error.value = null
    try {
      const result = await service.getVehicleState(ref_)
      state.value = result.data
      issues.value = [...result.meta.issues]
      error.value = result.status === 'error' ? result.error : null
    } catch (caught) {
      error.value = toAppError(caught)
    } finally {
      stateLoading.value = false
    }
  }

  function loadTelemetry(): Promise<void> {
    if (telemetryTask) return telemetryTask
    telemetryTask = runTelemetryLoad().finally(() => {
      telemetryTask = null
    })
    return telemetryTask
  }

  async function runTelemetryLoad(): Promise<void> {
    const ref_ = activeRef.value
    if (!ref_) {
      error.value = toAppError(new Error('车辆标识不完整，无法查询实时车况'))
      return
    }
    telemetryLoading.value = true
    error.value = null
    try {
      const result = await service.getVehicleTelemetry(ref_)
      telemetry.value = result.data
      issues.value = [...result.meta.issues]
      error.value = result.status === 'error' ? result.error : null
    } catch (caught) {
      error.value = toAppError(caught)
    } finally {
      telemetryLoading.value = false
    }
  }

  function clearError(): void {
    error.value = null
  }

  return {
    vehicles,
    activeVehicleId,
    state,
    telemetry,
    loading,
    stateLoading,
    telemetryLoading,
    error,
    issues,
    loadedOnce,
    activeVehicle,
    activeRef,
    errorMessage,
    missingFields,
    reloadFromStorage,
    resetForSession,
    load,
    select,
    loadState,
    loadTelemetry,
    clearError,
  }
})
