import { describe, expect, it } from 'vitest'
import { AuthService } from '@/core/application/AuthService'
import { HistorySyncService } from '@/core/application/HistorySyncService'
import { ReportService } from '@/core/application/ReportService'
import { VehicleService } from '@/core/application/VehicleService'
import { AppError } from '@/core/application/errors'
import { fixedClock } from '@/core/contracts/Clock'
import { formatDate } from '@/core/domain/datetime'
import { FixtureAuthDataSource, FixtureRideDataSource } from '@/infrastructure/fixture/FixtureRideDataSource'
import { MemoryKeyValueStore } from '@/infrastructure/storage/MemoryKeyValueStore'
import { UniRideRepository } from '@/infrastructure/storage/UniRideRepository'
import { UniSessionStore } from '@/infrastructure/storage/UniSessionStore'

/**
 * 端到端串联测试（不依赖 uni-app）。
 *
 * 装配方式与 `services/container.ts` 完全一致，只是把 uni 相关实现换成了内存实现。
 * 这一步用于证明：登录 → 车辆 → 月报/年报/历史总报告 → 历史同步 的链路真的能跑通，
 * 且页面消费的数据结构是可用的。
 */

function createStack() {
  const clock = fixedClock('2026-10-17T08:00:00.000Z')
  const store = new MemoryKeyValueStore()
  const repository = new UniRideRepository({ store })
  const sessionStore = new UniSessionStore({ store })
  const rideDataSource = new FixtureRideDataSource({ clock })
  const authDataSource = new FixtureAuthDataSource({ clock })

  return {
    clock,
    sessionStore,
    repository,
    auth: new AuthService({ authDataSource, sessionStore, repository, clock }),
    vehicle: new VehicleService({ dataSource: rideDataSource, repository, clock }),
    report: new ReportService({ dataSource: rideDataSource, repository, clock }),
    sync: new HistorySyncService({ dataSource: rideDataSource, repository, clock }),
  }
}

/** 与 App.vue / 页面一致的启动顺序：登录 → 拉车辆 → 选中车辆。 */
async function loginAndLoadVehicles(stack: ReturnType<typeof createStack>) {
  const login = await stack.auth.loginByVerifyCode('13900000000', '123456')
  expect(login.status).toBe('ok')
  expect(login.data?.session.ticket).toBe('test')
  expect(login.data?.profile?.userId).toBe('demo-user')

  const vehicles = await stack.vehicle.listVehicles()
  expect(vehicles.data).toHaveLength(1)
  expect(vehicles.data?.[0]?.ref).not.toBeNull()

  return { ref: stack.vehicle.requireActiveRef() }
}

describe('端到端链路', () => {
  it('未登录时拿不到用户资料，也不会留下会话', async () => {
    const stack = createStack()
    expect(stack.auth.isLoggedIn()).toBe(false)

    const profile = await stack.auth.loadProfile()
    expect(profile.status).toBe('error')
    expect(profile.error).toBeInstanceOf(AppError)
    expect(profile.error?.code).toBe('UNAUTHORIZED')

    const restored = await stack.auth.restoreSession()
    expect(restored.status).toBe('error')
    expect(restored.error?.code).toBe('UNAUTHORIZED')
  })

  it('登录后可以拿到车辆、月报、年报与历史总报告', async () => {
    const stack = createStack()
    const { ref } = await loginAndLoadVehicles(stack)
    expect(ref.vehicleId).not.toBe(ref.deviceId)

    const month = await stack.report.getMonthReport(ref, '2026-10')
    expect(month.status).not.toBe('error')
    expect(month.data?.statistics.inProgress).toBe(true)
    expect(month.data?.report?.days.length).toBeGreaterThan(0)

    const year = await stack.report.getYearReport(ref, 2026)
    expect(year.data?.statistics.year).toBe(2026)
    expect(year.data?.statistics.monthsCovered.length).toBeGreaterThan(0)
    // 2026 年尚未结束，因此状态必然是"不完整"
    expect(year.data?.statistics.inProgress).toBe(true)
    expect(year.data?.statistics.status).toBe('partial')

    const lifetime = await stack.report.getLifetimeReport(ref, { fetchMissing: false })
    expect(lifetime.data?.statistics.range?.to).toBe('2026-10')
    expect(lifetime.data?.statistics.totalDistanceKm).toBeGreaterThan(0)
  })

  it('月报缓存命中后不再重复请求，强制刷新会重新取数', async () => {
    const stack = createStack()
    const { ref } = await loginAndLoadVehicles(stack)

    const first = await stack.report.getMonthReport(ref, '2026-09')
    expect(first.meta.fromCache).toBe(false)
    const cachedAt = first.data?.report?.fetchedAt

    const second = await stack.report.getMonthReport(ref, '2026-09')
    expect(second.meta.fromCache).toBe(true)
    expect(second.data?.report?.fetchedAt).toBe(cachedAt)

    const forced = await stack.report.getMonthReport(ref, '2026-09', { force: true })
    expect(forced.meta.fromCache).toBe(false)
  })

  it('总览把历史累计与当月统计组合在同一份结果里', async () => {
    const stack = createStack()
    const { ref } = await loginAndLoadVehicles(stack)

    const overview = await stack.report.getOverview(ref)
    expect(overview.data?.currentMonth.month).toBe('2026-10')
    expect(overview.data?.recentMonths.length).toBeLessThanOrEqual(6)
    expect(overview.data?.lifetime.generatedAt).toBe('2026-10-17T08:00:00.000Z')
  })

  it('自定义月份区间由月报聚合，并保留安全事件统计', async () => {
    const stack = createStack()
    const { ref } = await loginAndLoadVehicles(stack)

    const range = await stack.report.getRangeReport(ref, '2026-07', '2026-09')
    expect(range.status).not.toBe('error')
    expect(range.data?.range).toEqual({ from: '2026-07', to: '2026-09' })
    expect(range.data?.statistics.monthlyTrend.map((point) => point.month)).toEqual([
      '2026-07',
      '2026-08',
      '2026-09',
    ])
    expect(range.data?.statistics.totalDistanceKm).toBeGreaterThan(0)
    expect(range.data?.statistics.rapid.acceleration).not.toBeNull()
    expect(range.data?.statistics.rapid.deceleration).not.toBeNull()
    expect(range.data?.statistics.rapid.turn).not.toBeNull()

    const invalid = await stack.report.getRangeReport(ref, '2026-09', '2026-07')
    expect(invalid.status).toBe('error')
  })

  it('历史同步补齐缺失月份并写入同步状态', async () => {
    const stack = createStack()
    const { ref } = await loginAndLoadVehicles(stack)

    const result = await stack.sync.sync(ref, { from: '2026-07', to: '2026-10', mode: 'missing' })
    expect(result.data?.failed).toHaveLength(0)
    expect(result.data?.succeeded).toEqual(['2026-10', '2026-09', '2026-08', '2026-07'])

    const localMonths = stack.sync.listLocalMonths(ref.vehicleId)
    expect(localMonths).toEqual(['2026-07', '2026-08', '2026-09', '2026-10'])
    expect(stack.sync.getSyncState(ref.vehicleId)?.lastSyncedAt).not.toBeNull()

    // 第二次同步没有缺口，不再发起请求
    const again = await stack.sync.sync(ref, { from: '2026-07', to: '2026-10', mode: 'missing' })
    expect(again.data?.succeeded).toHaveLength(0)
  })

  it('退出登录会清除本地会话与资料', async () => {
    const stack = createStack()
    await stack.auth.loginByVerifyCode('13900000000', '123456')
    expect(stack.auth.isLoggedIn()).toBe(true)
    expect(stack.repository.loadProfile()).not.toBeNull()

    await stack.auth.logout()
    expect(stack.auth.isLoggedIn()).toBe(false)
    expect(stack.repository.loadProfile()).toBeNull()
    expect(stack.sessionStore.loadSession()).toBeNull()
  })

  it('时间基准来自注入的 Clock，可以替换成任意"今天"', () => {
    const stack = createStack()
    expect(formatDate(stack.clock.now())).toBe('2026-10-17')
  })
})
