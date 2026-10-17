import { describe, expect, it } from 'vitest'
import { HistorySyncService } from '@/core/application/HistorySyncService'
import type { RideDataSource, RideDataSourceCapabilities } from '@/core/contracts/RideDataSource'
import { fixedClock, type Clock } from '@/core/contracts/Clock'
import { AppError } from '@/core/application/errors'
import type { MonthKey, VehicleRef } from '@/core/domain/identifiers'
import type { MonthRideReport } from '@/core/domain/models'
import { MemoryKeyValueStore } from '@/infrastructure/storage/MemoryKeyValueStore'
import { UniRideRepository } from '@/infrastructure/storage/UniRideRepository'
import { TEST_REF, makeMonthReport } from './helpers/fixtures'

const clock: Clock = fixedClock('2026-10-17T08:00:00.000Z')

const CAPABILITIES: RideDataSourceCapabilities = {
  monthReport: { available: true, status: 'verified', supportsArbitraryMonth: true, note: '' },
  dayStats: { available: true, status: 'verified', note: '' },
  rapidEvents: { available: true, viaDayStats: true, note: '' },
  vehicleState: { available: true, status: 'verified' },
  history: { available: true, status: 'unverified', note: '' },
  aggregatedReports: { source: 'monthly-aggregation', note: '' },
}

class FakeSource implements RideDataSource {
  readonly sourceId = 'fake'
  readonly capabilities = CAPABILITIES
  readonly requests: MonthKey[] = []
  private readonly failing: Set<MonthKey>
  private readonly firstBindMonth: MonthKey | null

  constructor(options: { failing?: MonthKey[]; firstBindMonth?: MonthKey | null } = {}) {
    this.failing = new Set(options.failing ?? [])
    this.firstBindMonth = options.firstBindMonth ?? null
  }

  async getMonthReport(_ref: VehicleRef, month: MonthKey): Promise<MonthRideReport> {
    this.requests.push(month)
    if (this.failing.has(month)) {
      throw new AppError(`模拟 ${month} 失败`, { code: 'NETWORK', retriable: true })
    }
    return makeMonthReport(
      month,
      [{ date: `${month}-01`, distanceMeters: '10000', durationSeconds: '600', maxSpeedKph: '60' }],
      this.firstBindMonth === null ? {} : { firstBindMonth: this.firstBindMonth },
    )
  }

  getMonthlyFuel() {
    return Promise.reject(new AppError('未使用', { code: 'NOT_IMPLEMENTED' }))
  }

  listVehicles() {
    return Promise.reject(new AppError('未使用', { code: 'NOT_IMPLEMENTED' }))
  }
  getVehicleState() {
    return Promise.reject(new AppError('未使用', { code: 'NOT_IMPLEMENTED' }))
  }
  getVehicleTelemetry() {
    return Promise.reject(new AppError('未使用', { code: 'NOT_IMPLEMENTED' }))
  }
  getDayStats() {
    return Promise.reject(new AppError('未使用', { code: 'NOT_IMPLEMENTED' }))
  }
  listRideHistory() {
    return Promise.reject(new AppError('未使用', { code: 'NOT_IMPLEMENTED' }))
  }
  getRideHistoryDetail() {
    return Promise.reject(new AppError('未使用', { code: 'NOT_IMPLEMENTED' }))
  }
}

function createService(source: FakeSource, lookback?: number, store?: MemoryKeyValueStore) {
  const repository = new UniRideRepository({ store: store ?? new MemoryKeyValueStore() })
  const service = new HistorySyncService({
    dataSource: source,
    repository,
    clock,
    ...(lookback === undefined ? {} : { fallbackLookbackMonths: lookback }),
  })
  return { service, repository }
}

describe('历史同步', () => {
  it('可查询范围由 firstBindDate 推断，且不会超出当前月', async () => {
    const source = new FakeSource({ firstBindMonth: '2026-08' })
    const { service } = createService(source)
    const range = await service.resolveQueryableRange(TEST_REF)
    expect(range.evidence).toBe('firstBindDate')
    expect(range.from).toBe('2026-08')
    expect(range.to).toBe('2026-10')

    // 推断范围时会顺带取一次当前月，因此它已经进入本地缓存
    expect(source.requests).toEqual(['2026-10'])
    const plan = service.planSync(TEST_REF, range, { mode: 'missing' })
    expect(plan.map((entry) => entry.month)).toEqual(['2026-09', '2026-08'])
  })

  it('无法获得 firstBindDate 时退回假设范围并明确标注', async () => {
    const source = new FakeSource({ firstBindMonth: null })
    const { service } = createService(source, 3)
    const range = await service.resolveQueryableRange(TEST_REF)
    expect(range.evidence).toBe('fallback-assumption')
    expect(range.from).toBe('2026-08')
    expect(range.note).toContain('未经验证')
  })

  it('车辆绑定月份（bindDate）之前不发起请求', async () => {
    const source = new FakeSource({ firstBindMonth: '2025-09' })
    const { service } = createService(source)
    const ref = { ...TEST_REF, bindMonth: '2026-06' as MonthKey }
    const range = await service.resolveQueryableRange(ref)
    expect(range.from).toBe('2026-06')
    const plan = service.planSync(ref, range, { mode: 'missing' })
    expect(plan.every((entry) => entry.month >= '2026-06')).toBe(true)
  })

  it('同步成功后记录本地月份与 lastSyncedAt', async () => {
    const source = new FakeSource({ firstBindMonth: '2026-09' })
    const { service } = createService(source)
    const result = await service.sync(TEST_REF)
    // 10 月由范围探测阶段取得，本轮同步只补 9 月
    expect(result.data?.succeeded).toEqual(['2026-09'])
    expect(result.data?.failed).toHaveLength(0)
    expect(service.listLocalMonths(TEST_REF.vehicleId)).toEqual(['2026-09', '2026-10'])
    expect(service.getSyncState(TEST_REF.vehicleId)?.lastSyncedAt).not.toBeNull()
  })

  it('失败月份记录在案，且不删除已有缓存', async () => {
    const source = new FakeSource({ firstBindMonth: '2026-09' })
    const store = new MemoryKeyValueStore()
    const { service, repository } = createService(source, undefined, store)
    await service.sync(TEST_REF)
    const cachedBefore = repository.loadMonthReport({ vehicleId: TEST_REF.vehicleId, month: '2026-09' })
    expect(cachedBefore?.days[0]?.distanceKm).toBe(10)

    // 第二次同步时让 09 失败（复用同一份本地存储，验证缓存是否被保留）
    const failingSource = new FakeSource({ firstBindMonth: '2026-09', failing: ['2026-09'] })
    const second = createService(failingSource, undefined, store)
    const result = await second.service.sync(TEST_REF, { from: '2026-09', to: '2026-09', mode: 'all' })
    expect(result.data?.failed.map((item) => item.month)).toEqual(['2026-09'])
    expect(result.status).toBe('partial')
    const cachedAfter = second.repository.loadMonthReport({ vehicleId: TEST_REF.vehicleId, month: '2026-09' })
    expect(cachedAfter?.days[0]?.distanceKm).toBe(10)
    expect(cachedAfter?.fetchedAt).toBe(cachedBefore?.fetchedAt)
  })

  it('retry-failed 模式只处理失败过的月份', async () => {
    const source = new FakeSource({ firstBindMonth: '2026-08', failing: ['2026-09'] })
    const { service } = createService(source)
    await service.sync(TEST_REF)
    const state = service.getSyncState(TEST_REF.vehicleId)
    expect(state?.failedMonths.map((item) => item.month)).toEqual(['2026-09'])

    const plan = service.planSync(
      TEST_REF,
      { from: '2026-08', to: '2026-10', evidence: 'firstBindDate', note: '' },
      { mode: 'retry-failed' },
    )
    expect(plan).toEqual([{ month: '2026-09', reason: 'retry-failed' }])
  })

  it('已同步月份在 missing 模式下不再重复请求', async () => {
    const source = new FakeSource({ firstBindMonth: '2026-09' })
    const { service } = createService(source)
    await service.sync(TEST_REF)
    const requestsAfterFirst = source.requests.length
    await service.sync(TEST_REF)
    expect(source.requests.length).toBe(requestsAfterFirst)
  })

  it('单月同步失败时保留缓存并返回提示', async () => {
    const source = new FakeSource({ firstBindMonth: '2026-09' })
    const store = new MemoryKeyValueStore()
    const { service } = createService(source, undefined, store)
    await service.syncMonth(TEST_REF, '2026-09')
    const failing = new FakeSource({ failing: ['2026-09'] })
    const repository = new UniRideRepository({ store })
    const service2 = new HistorySyncService({
      dataSource: failing,
      repository,
      clock,
    })
    const result = await service2.syncMonth(TEST_REF, '2026-09')
    expect(result.status).toBe('error')
    expect(result.error?.hint).toContain('已保留原有缓存')
    // 原有缓存必须还在
    expect(repository.loadMonthReport({ vehicleId: TEST_REF.vehicleId, month: '2026-09' })).not.toBeNull()
  })

  it('未来月份不同步', async () => {
    const source = new FakeSource()
    const { service } = createService(source)
    const result = await service.syncMonth(TEST_REF, '2027-01')
    expect(result.status).toBe('error')
    expect(result.error?.code).toBe('INVALID_INPUT')
  })

  it('支持中断，已完成的月份保留', async () => {
    const source = new FakeSource({ firstBindMonth: '2026-06' })
    const { service } = createService(source)
    let count = 0
    const result = await service.sync(TEST_REF, {
      from: '2026-06' as MonthKey,
      to: '2026-10' as MonthKey,
      shouldCancel: () => {
        count += 1
        return count > 2
      },
    })
    expect(result.data?.cancelled).toBe(true)
    expect(result.data?.succeeded).toEqual(['2026-10', '2026-09'])
    expect(result.data?.skipped).toEqual(['2026-08', '2026-07', '2026-06'])
  })
})
