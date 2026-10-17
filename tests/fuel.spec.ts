import { describe, expect, it } from 'vitest'
import { FuelService } from '@/core/application/FuelService'
import { ReportService } from '@/core/application/ReportService'
import { fixedClock } from '@/core/contracts/Clock'
import type { MonthKey, VehicleRef } from '@/core/domain/identifiers'
import type { MonthlyFuelConsumption } from '@/core/domain/models'
import { FixtureRideDataSource, FIXTURE_REF } from '@/infrastructure/fixture/FixtureRideDataSource'
import { MemoryKeyValueStore } from '@/infrastructure/storage/MemoryKeyValueStore'
import { UniRideRepository } from '@/infrastructure/storage/UniRideRepository'

const clock = fixedClock('2026-10-17T08:00:00.000Z')

class FuelSource extends FixtureRideDataSource {
  private readonly total: number

  constructor(total: number) {
    super({ clock })
    this.total = total
  }

  override async getMonthlyFuel(_ref: VehicleRef, month: MonthKey): Promise<MonthlyFuelConsumption> {
    return {
      month,
      firstBindMonth: '2025-09',
      totalLiters: this.total,
      totalLitersPrecise: this.total,
      days: [],
    }
  }
}

function createStack(total: number) {
  const repository = new UniRideRepository({ store: new MemoryKeyValueStore() })
  const dataSource = new FuelSource(total)
  const reportService = new ReportService({ dataSource, repository, clock })
  const fuelService = new FuelService({
    dataSource,
    reportService,
    repository,
    priceDataSource: { getNearestPrice: async () => null },
    clock,
  })
  return { repository, fuelService }
}

describe('油耗与手动加油记录', () => {
  it('官方 powerUseMonth 有值时优先使用官方数据', async () => {
    const { fuelService } = createStack(2.5)
    const result = await fuelService.getMonthFuel(FIXTURE_REF, '2026-10', { hasRideRecords: true })
    expect(result.data).toMatchObject({
      source: 'official',
      displayLiters: 2.5,
      officialUsable: true,
      unsupportedByVehicle: false,
    })
  })

  it('未手动设置时按车型匹配油箱容量，保存后优先使用手动值', () => {
    const { fuelService } = createStack(0)
    expect(fuelService.getTankCapacity(FIXTURE_REF, '250 CLC')).toBe(13.5)
    fuelService.setTankCapacity(FIXTURE_REF, 15)
    expect(fuelService.getTankCapacity(FIXTURE_REF, '250 CLC')).toBe(15)
  })

  it('官方返回 0 且当月有骑行时，用两次加油区间估算月耗和累计油耗', async () => {
    const { fuelService } = createStack(0)
    fuelService.addRecord(FIXTURE_REF, { refueledAt: '2026-09-30 18:00', liters: 10 })
    fuelService.addRecord(FIXTURE_REF, { refueledAt: '2026-10-05 08:30', liters: 5 })
    fuelService.addRecord(FIXTURE_REF, { refueledAt: '2026-10-15 19:20', liters: 6 })

    const result = await fuelService.getMonthFuel(FIXTURE_REF, '2026-10', {
      hasRideRecords: true,
      totalMileageKm: 9347.5,
      remainingOil: 3,
      totalOilSegments: 6,
    })
    expect(result.data).toMatchObject({
      source: 'manual',
      displayLiters: 12,
      manualMonthLiters: 12,
      manualTotalLiters: 15,
      unsupportedByVehicle: true,
    })
    expect(result.data?.monthConsumptionLPer100Km).not.toBeNull()
    expect(result.data?.historicalConsumptionLPer100Km).not.toBeNull()
  })

  it('导入 JSON 时相同日期时间覆盖原记录，并支持一天多条', async () => {
    const { fuelService } = createStack(0)
    fuelService.addRecord(FIXTURE_REF, { refueledAt: '2026-10-10 08:00', liters: 8 })
    const result = fuelService.importRecords(FIXTURE_REF, [
      { date: '2026-10-10 08:00', liters: 9.55 },
      { time: '2026-10-10 20:30', liters: 3.2, price: 88.8, grade: '95#' },
    ])
    expect(result).toEqual({ imported: 2, total: 2 })
    const records = fuelService.listRecords(FIXTURE_REF)
    expect(records.map((record) => [record.time, record.liters])).toEqual([
      ['2026-10-10 08:00:00', 9.55],
      ['2026-10-10 20:30:00', 3.2],
    ])
    expect(fuelService.exportPayload(FIXTURE_REF)).toEqual({
      vehicleId: FIXTURE_REF.vehicleId,
      records: [
        { time: '2026-10-10 08:00:00', liters: 9.55, price: null, grade: null },
        { time: '2026-10-10 20:30:00', liters: 3.2, price: 88.8, grade: '95#' },
      ],
    })
  })

  it('导入时拒绝其他车辆的 JSON 文件', () => {
    const { fuelService } = createStack(0)
    expect(() =>
      fuelService.importRecords(FIXTURE_REF, {
        vehicleId: 'another-vehicle',
        records: [{ time: '2026-10-10 08:00', liters: 8 }],
      }),
    ).toThrow('导入文件属于其他车辆')
  })
})
