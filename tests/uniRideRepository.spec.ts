import { describe, expect, it } from 'vitest'
import type { MonthKey } from '@/core/domain/identifiers'
import { MemoryKeyValueStore } from '@/infrastructure/storage/MemoryKeyValueStore'
import { UniRideRepository } from '@/infrastructure/storage/UniRideRepository'
import { storageKeys } from '@/infrastructure/storage/storageKeys'
import { UniSessionStore } from '@/infrastructure/storage/UniSessionStore'
import { emptySyncState } from '@/core/contracts/RideRepository'
import { TEST_REF, makeMonthReport } from './helpers/fixtures'

const VEHICLE_A = '1001'
const VEHICLE_B = '1002'

function reportFor(vehicleId: string, month: MonthKey) {
  return {
    ...makeMonthReport(month, [
      { date: `${month}-01`, distanceMeters: '10000', durationSeconds: '600', maxSpeedKph: '60' },
    ]),
    vehicleId,
  }
}

describe('本地存储仓储', () => {
  it('按车辆与月份分别缓存月报', () => {
    const store = new MemoryKeyValueStore()
    const repository = new UniRideRepository({ store })

    repository.saveMonthReport(reportFor(VEHICLE_A, '2026-09' as MonthKey))
    repository.saveMonthReport(reportFor(VEHICLE_A, '2026-08' as MonthKey))
    repository.saveMonthReport(reportFor(VEHICLE_B, '2026-09' as MonthKey))

    expect(repository.listCachedMonths(VEHICLE_A)).toEqual(['2026-08', '2026-09'])
    expect(repository.listCachedMonths(VEHICLE_B)).toEqual(['2026-09'])
    expect(repository.loadMonthReport({ vehicleId: VEHICLE_A, month: '2026-08' as MonthKey })?.vehicleId).toBe(VEHICLE_A)
    expect(repository.loadMonthReport({ vehicleId: VEHICLE_A, month: '2026-07' as MonthKey })).toBeNull()
  })

  it('车辆不匹配的缓存视为脏数据', () => {
    const store = new MemoryKeyValueStore()
    const repository = new UniRideRepository({ store })
    repository.saveMonthReport(reportFor(VEHICLE_A, '2026-09' as MonthKey))
    expect(repository.loadMonthReport({ vehicleId: VEHICLE_B, month: '2026-09' as MonthKey })).toBeNull()
  })

  it('删除月份缓存不影响其他月份', () => {
    const store = new MemoryKeyValueStore()
    const repository = new UniRideRepository({ store })
    repository.saveMonthReport(reportFor(VEHICLE_A, '2026-09' as MonthKey))
    repository.saveMonthReport(reportFor(VEHICLE_A, '2026-08' as MonthKey))
    repository.removeMonthReport({ vehicleId: VEHICLE_A, month: '2026-09' as MonthKey })
    expect(repository.listCachedMonths(VEHICLE_A)).toEqual(['2026-08'])
  })

  it('保存与读取同步状态', () => {
    const store = new MemoryKeyValueStore()
    const repository = new UniRideRepository({ store })
    repository.saveSyncState({
      ...emptySyncState(VEHICLE_A, TEST_REF.deviceId),
      syncedMonths: ['2026-09' as MonthKey],
      earliestMonth: '2025-09' as MonthKey,
    })
    const state = repository.loadSyncState(VEHICLE_A)
    expect(state?.syncedMonths).toEqual(['2026-09'])
    expect(state?.earliestMonth).toBe('2025-09')
  })

  it('清理车辆数据只影响该车辆', () => {
    const store = new MemoryKeyValueStore()
    const repository = new UniRideRepository({ store })
    repository.saveMonthReport(reportFor(VEHICLE_A, '2026-09' as MonthKey))
    repository.saveMonthReport(reportFor(VEHICLE_B, '2026-09' as MonthKey))
    repository.clearVehicleData(VEHICLE_A)
    expect(repository.listCachedMonths(VEHICLE_A)).toEqual([])
    expect(repository.listCachedMonths(VEHICLE_B)).toEqual(['2026-09'])
  })

  it('车辆与选中车辆持久化', () => {
    const store = new MemoryKeyValueStore()
    const repository = new UniRideRepository({ store })
    repository.saveVehicles([
      {
        vehicleId: VEHICLE_A,
        deviceId: TEST_REF.deviceId,
        vin: TEST_REF.vin,
        equipmentNum: null,
        model: 'CF250-12',
        imageUrl: null,
        bindDate: null,
      },
    ])
    repository.saveActiveVehicleId(VEHICLE_A)
    expect(repository.loadVehicles()).toHaveLength(1)
    expect(repository.loadActiveVehicleId()).toBe(VEHICLE_A)
    repository.saveActiveVehicleId(null)
    expect(repository.loadActiveVehicleId()).toBeNull()
  })

  it('会话按本地存储键保存，可清除', () => {
    const store = new MemoryKeyValueStore()
    const sessions = new UniSessionStore({ store })
    sessions.saveSession({
      ticket: 'TK-1',
      userId: '1',
      nickname: 'n',
      isVip: null,
      loginAt: '2026-10-17T00:00:00.000Z',
    })
    expect(sessions.loadSession()?.ticket).toBe('TK-1')
    expect(store.keys(storageKeys.session)).toHaveLength(1)
    sessions.clearSession()
    expect(sessions.loadSession()).toBeNull()
  })
})
