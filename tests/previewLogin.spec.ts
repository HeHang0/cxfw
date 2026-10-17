import { describe, expect, it } from 'vitest'
import { AuthService } from '@/core/application/AuthService'
import { VehicleService } from '@/core/application/VehicleService'
import type { AuthCapabilities, AuthDataSource } from '@/core/contracts/AuthDataSource'
import { fixedClock } from '@/core/contracts/Clock'
import type { RideDataSource } from '@/core/contracts/RideDataSource'
import { PREVIEW_TICKET } from '@/core/domain/preview'
import type { Vehicle } from '@/core/domain/models'
import {
  FixtureAuthDataSource,
  FixtureRideDataSource,
} from '@/infrastructure/fixture/FixtureRideDataSource'
import {
  TicketRoutedAuthDataSource,
  TicketRoutedRideDataSource,
} from '@/infrastructure/fixture/TicketRoutedDataSources'
import { MemoryKeyValueStore } from '@/infrastructure/storage/MemoryKeyValueStore'
import { TicketRoutedKeyValueStore } from '@/infrastructure/storage/TicketRoutedKeyValueStore'
import { UniRideRepository } from '@/infrastructure/storage/UniRideRepository'
import { UniSessionStore } from '@/infrastructure/storage/UniSessionStore'

const REAL_VEHICLE: Vehicle = {
  vehicleId: 'real-vehicle',
  deviceId: 'real-device',
  vin: 'LREAL000000000001',
  equipmentNum: '860000000000001',
  model: '真实车辆',
  imageUrl: null,
  bindDate: '2024-01-01 00:00:00',
}

class ForbiddenRemoteAuthDataSource implements AuthDataSource {
  readonly sourceId = 'forbidden-remote'
  readonly capabilities: AuthCapabilities = {
    sendVerifyCode: 'verified',
    loginByVerifyCode: 'verified',
    loginByPassword: 'unverified',
    checkRegistered: 'verified',
    checkTicket: 'verified',
    logout: 'verified',
  }

  private fail(): never {
    throw new Error('预览账号不应请求官方认证接口')
  }

  async sendVerifyCode(): Promise<void> {
    this.fail()
  }

  async loginByVerifyCode(): Promise<never> {
    return this.fail()
  }

  async loginByPassword(): Promise<never> {
    return this.fail()
  }

  async getUserProfile(): Promise<never> {
    return this.fail()
  }

  async checkRegistered(): Promise<boolean | null> {
    return this.fail()
  }

  async checkTicket(): Promise<boolean | null> {
    return this.fail()
  }

  async logout(): Promise<void> {
    this.fail()
  }
}

function createForbiddenRemoteRideDataSource(): RideDataSource {
  const fail = (): never => {
    throw new Error('预览账号不应请求官方骑行接口')
  }
  return {
    sourceId: 'forbidden-remote',
    capabilities: {
      monthReport: { available: true, status: 'verified', supportsArbitraryMonth: true, note: '' },
      dayStats: { available: true, status: 'verified', note: '' },
      rapidEvents: { available: true, viaDayStats: true, note: '' },
      vehicleState: { available: true, status: 'verified' },
      history: { available: true, status: 'verified', note: '' },
      aggregatedReports: { source: 'monthly-aggregation', note: '' },
    },
    listVehicles: async () => fail(),
    getVehicleState: async () => fail(),
    getVehicleTelemetry: async () => fail(),
    getMonthReport: async () => fail(),
    getMonthlyFuel: async () => fail(),
    getDayStats: async () => fail(),
    listRideHistory: async () => fail(),
    getRideHistoryDetail: async () => fail(),
  }
}

describe('test/test 本地预览账号', () => {
  it('写入 test ticket，并把所有取数路由到演示数据', async () => {
    const clock = fixedClock('2026-10-17T08:00:00.000Z')
    const persistentStore = new MemoryKeyValueStore()
    const previewStore = new MemoryKeyValueStore()
    const sessionStore = new UniSessionStore({ store: persistentStore })
    const persistentRepository = new UniRideRepository({ store: persistentStore })
    const previewRepository = new UniRideRepository({ store: previewStore })
    persistentRepository.saveVehicles([REAL_VEHICLE])

    const repositoryStore = new TicketRoutedKeyValueStore({
      persistent: persistentStore,
      preview: previewStore,
      isPreview: () => sessionStore.loadSession()?.ticket === PREVIEW_TICKET,
    })
    const repository = new UniRideRepository({ store: repositoryStore })
    const fixtureAuth = new FixtureAuthDataSource({ clock })
    const fixtureRide = new FixtureRideDataSource({ clock })
    const authDataSource = new TicketRoutedAuthDataSource({
      remote: new ForbiddenRemoteAuthDataSource(),
      preview: fixtureAuth,
    })
    const rideDataSource = new TicketRoutedRideDataSource({
      remote: createForbiddenRemoteRideDataSource(),
      preview: fixtureRide,
      sessionProvider: () => sessionStore.loadSession(),
    })

    const auth = new AuthService({ authDataSource, sessionStore, repository, clock })
    const login = await auth.loginByPassword('test', 'test')
    expect(login.status).toBe('ok')
    expect(login.data?.session.ticket).toBe(PREVIEW_TICKET)
    expect(login.data?.profile?.nickname).toBe('演示骑士')

    const vehicles = new VehicleService({
      dataSource: rideDataSource,
      repository,
      clock,
    })
    const result = await vehicles.listVehicles({ refresh: true })
    expect(result.status).toBe('ok')
    expect(result.data?.[0]?.vehicle.vin).toBe('LTEST00000000001')

    // 演示数据只写入内存存储，真实账号的持久化缓存保持不变。
    expect(persistentRepository.loadVehicles().map((vehicle) => vehicle.vin)).toEqual([REAL_VEHICLE.vin])
    expect(previewRepository.loadVehicles().map((vehicle) => vehicle.vin)).toEqual(['LTEST00000000001'])
    expect(persistentStore.keys().filter((key) => key.includes('month'))).toEqual([])
  })
})
