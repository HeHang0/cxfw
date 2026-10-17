import type { Clock } from '../contracts/Clock'
import type { FuelPriceDataSource, FuelPriceQuote } from '../contracts/FuelPriceDataSource'
import type { RideDataSource } from '../contracts/RideDataSource'
import type { RideRepository } from '../contracts/RideRepository'
import { addMonths, enumerateMonths, formatDate, monthOf } from '../domain/datetime'
import type { DateKey, DateTimeText, MonthKey, VehicleRef } from '../domain/identifiers'
import type { MonthlyFuelConsumption, RefuelRecord } from '../domain/models'
import { createIssue, type DataIssue } from '../domain/issues'
import { round } from '../domain/numbers'
import { tankCapacityForVehicle } from '../domain/tankCapacities'
import { createLogger, silentLogger, type Logger } from '../shared/logger'
import { AppError, toAppError } from './errors'
import type { ReportService } from './ReportService'
import { errorResult, okResult, partialResult, type DataResult } from './results'

export type FuelSource = 'official' | 'manual' | 'none'

export interface FuelVehicleContext {
  readonly totalMileageKm?: number | null
  readonly remainingOil?: number | null
  readonly totalOilSegments?: number | null
  readonly vehicleTypeName?: string | null
}

export interface DailyFuelConsumption {
  readonly date: DateKey
  readonly liters: number
  readonly distanceKm: number | null
  readonly lPer100Km: number | null
}

export interface FuelMonthView {
  readonly month: MonthKey
  readonly official: MonthlyFuelConsumption | null
  readonly officialUsable: boolean
  readonly unsupportedByVehicle: boolean
  readonly hasRideRecords: boolean
  readonly manualTotalLiters: number | null
  readonly manualMonthLiters: number | null
  readonly manualRecordCount: number
  readonly source: FuelSource
  readonly displayLiters: number | null
  readonly tankCapacityLiters: number
  readonly remainingFuelLiters: number | null
  readonly monthDistanceKm: number | null
  readonly monthConsumptionLPer100Km: number | null
  readonly historicalDistanceKm: number | null
  readonly historicalFuelLiters: number | null
  readonly historicalConsumptionLPer100Km: number | null
  readonly latestDaily: DailyFuelConsumption | null
}

export interface FuelServiceDeps {
  readonly dataSource: RideDataSource
  readonly reportService: ReportService
  readonly repository: RideRepository
  readonly priceDataSource: FuelPriceDataSource
  readonly clock: Clock
  readonly logger?: Logger
}

export class FuelService {
  private readonly deps: FuelServiceDeps
  private readonly logger: Logger

  constructor(deps: FuelServiceDeps) {
    this.deps = deps
    this.logger = deps.logger ?? silentLogger
  }

  async getMonthFuel(
    ref: VehicleRef,
    month: MonthKey,
    options: FuelVehicleContext & { hasRideRecords?: boolean } = {},
  ): Promise<DataResult<FuelMonthView>> {
    let official: MonthlyFuelConsumption | null = null
    let officialError: AppError | null = null
    const issues: DataIssue[] = []
    try {
      official = await this.deps.dataSource.getMonthlyFuel(ref, month)
    } catch (error) {
      officialError = toAppError(error)
      issues.push(
        createIssue('PARTIAL_DATA', `月度油耗获取失败：${officialError.message}`, {
          path: 'fuel/month',
          value: month,
        }),
      )
      this.logger.warn('月度油耗获取失败', { month, code: officialError.code })
    }

    const hasRideRecords =
      options.hasRideRecords ??
      (await this.rideRecordsExist(ref, month))
    const records = this.listRecords(ref)
    const tankCapacityLiters = this.getTankCapacity(ref, options.vehicleTypeName)
    const manual = await this.computeManual(ref, records, month, tankCapacityLiters, options)
    const total = official?.totalLiters ?? null
    const officialUsable = total !== null && (total > 0 || !hasRideRecords)
    const unsupportedByVehicle = total === 0 && hasRideRecords

    let source: FuelSource = 'none'
    let displayLiters: number | null = null
    if (officialUsable && total !== null) {
      source = 'official'
      displayLiters = total
    } else if (manual.monthLiters !== null) {
      source = 'manual'
      displayLiters = manual.monthLiters
    }

    let officialMonthDistanceKm: number | null = null
    let officialMonthlyLPer100Km: number | null = null
    let latestDaily: DailyFuelConsumption | null = null
    if (officialUsable) {
      const monthReport = await this.deps.reportService.getMonthReport(ref, month, { force: false })
      officialMonthDistanceKm = monthReport.data?.statistics.totalDistanceKm ?? null
      if (total !== null && officialMonthDistanceKm !== null && officialMonthDistanceKm > 0) {
        officialMonthlyLPer100Km = round((total / officialMonthDistanceKm) * 100, 2)
      }
      latestDaily = await this.latestDailyFuel(ref, official, month)
    }

    const monthConsumptionLPer100Km =
      source === 'official' ? officialMonthlyLPer100Km : manual.monthLPer100Km
    const view: FuelMonthView = {
      month,
      official,
      officialUsable,
      unsupportedByVehicle,
      hasRideRecords,
      manualTotalLiters: manual.totalLiters,
      manualMonthLiters: manual.monthLiters,
      manualRecordCount: records.length,
      source,
      displayLiters,
      tankCapacityLiters,
      remainingFuelLiters: manual.remainingFuelLiters,
      monthDistanceKm: source === 'official' ? officialMonthDistanceKm : manual.monthDistanceKm,
      monthConsumptionLPer100Km,
      historicalDistanceKm: manual.historicalDistanceKm,
      historicalFuelLiters: manual.historicalFuelLiters,
      historicalConsumptionLPer100Km: manual.historicalLPer100Km,
      latestDaily,
    }

    if (officialError && manual.monthLiters === null) {
      return errorResult(officialError, { issues })
    }
    if (issues.length > 0 || (unsupportedByVehicle && source !== 'manual')) {
      return partialResult(view, { issues })
    }
    return okResult(view, { issues })
  }

  listRecords(ref: VehicleRef): RefuelRecord[] {
    return [...this.deps.repository.loadRefuelRecords(ref.vehicleId)].sort(compareRefuels)
  }

  getTankCapacity(ref: VehicleRef, vehicleTypeName?: string | null): number {
    return (
      this.deps.repository.loadFuelSettings(ref.vehicleId)?.tankCapacityLiters ??
      tankCapacityForVehicle(vehicleTypeName)
    )
  }

  setTankCapacity(ref: VehicleRef, liters: number): number {
    if (!Number.isFinite(liters) || liters <= 0 || liters > 100) {
      throw new AppError('油箱容量应大于 0 且不超过 100 L', { code: 'INVALID_INPUT' })
    }
    const value = round(liters, 2)
    this.deps.repository.saveFuelSettings(ref.vehicleId, { tankCapacityLiters: value })
    return value
  }

  addRecord(ref: VehicleRef, input: { refueledAt: string; liters: number }): RefuelRecord {
    const time = normalizeRefueledAt(input.refueledAt)
    const liters = normalizeLiters(input.liters)
    const existing = this.listRecords(ref)
    const record: RefuelRecord = {
      time,
      liters,
      price: null,
      grade: null,
    }
    const merged = new Map(existing.map((item) => [item.time, item]))
    merged.set(time, record)
    this.deps.repository.saveRefuelRecords(ref.vehicleId, [...merged.values()].sort(compareRefuels))
    return record
  }

  addRecordWithPrice(
    ref: VehicleRef,
    input: {
      refueledAt: string
      liters: number
      price?: number | null
      grade?: string | null
    },
  ): RefuelRecord {
    const time = normalizeRefueledAt(input.refueledAt)
    const liters = normalizeLiters(input.liters)
    const record: RefuelRecord = {
      time,
      liters,
      price: optionalPrice(input.price),
      grade: input.grade ?? null,
    }
    const merged = new Map(this.listRecords(ref).map((item) => [item.time, item]))
    merged.set(time, record)
    this.deps.repository.saveRefuelRecords(ref.vehicleId, [...merged.values()].sort(compareRefuels))
    return record
  }

  async lookupPrice(province: string, date: DateKey): Promise<FuelPriceQuote | null> {
    return this.deps.priceDataSource.getNearestPrice(province, date)
  }

  removeRecord(ref: VehicleRef, time: string): void {
    this.deps.repository.saveRefuelRecords(
      ref.vehicleId,
      this.listRecords(ref).filter((record) => record.time !== time),
    )
  }

  importRecords(ref: VehicleRef, payload: unknown): { imported: number; total: number } {
    const objectPayload =
      payload && typeof payload === 'object' && !Array.isArray(payload)
        ? (payload as { vehicleId?: unknown; records?: unknown })
        : null
    const items = Array.isArray(payload)
      ? payload
      : Array.isArray(objectPayload?.records)
        ? objectPayload.records
        : null
    if (!items) {
      throw new AppError('JSON 格式不正确，应为记录数组或包含 records 数组的对象', {
        code: 'INVALID_INPUT',
      })
    }
    const sourceVehicleId =
      typeof objectPayload?.vehicleId === 'string' ? objectPayload.vehicleId : null
    if (sourceVehicleId !== null && sourceVehicleId !== ref.vehicleId) {
      throw new AppError('导入文件属于其他车辆，无法导入当前车辆', {
        code: 'INVALID_INPUT',
        details: { sourceVehicleId, currentVehicleId: ref.vehicleId },
      })
    }

    const merged = new Map(this.listRecords(ref).map((record) => [record.time, record]))
    let imported = 0
    for (const item of items) {
      if (!item || typeof item !== 'object') continue
      const value = item as Record<string, unknown>
      const rawDate = value['time'] ?? value['refueledAt'] ?? value['date'] ?? value['dateTime']
      const rawLiters = value['liters'] ?? value['oil'] ?? value['amount']
      if (typeof rawDate !== 'string' || rawLiters === undefined || rawLiters === null) continue
      const time = normalizeRefueledAt(rawDate)
      const liters = normalizeLiters(Number(rawLiters))
      merged.set(time, {
        time,
        liters,
        price: optionalPrice(value['price'] ?? value['pricePaidYuan']),
        grade:
          typeof value['grade'] === 'string'
            ? value['grade']
            : typeof value['priceGrade'] === 'string'
              ? value['priceGrade']
              : null,
      })
      imported += 1
    }
    if (imported === 0) {
      throw new AppError('JSON 中没有可导入的加油记录', { code: 'INVALID_INPUT' })
    }
    const records = [...merged.values()].sort(compareRefuels)
    this.deps.repository.saveRefuelRecords(ref.vehicleId, records)
    return { imported, total: records.length }
  }

  exportPayload(ref: VehicleRef): { vehicleId: string; records: RefuelRecord[] } {
    return {
      vehicleId: ref.vehicleId,
      records: this.listRecords(ref),
    }
  }

  private async rideRecordsExist(ref: VehicleRef, month: MonthKey): Promise<boolean> {
    const result = await this.deps.reportService.getMonthReport(ref, month, { force: false })
    return (result.data?.report?.days.length ?? 0) > 0
  }

  private async computeManual(
    ref: VehicleRef,
    records: readonly RefuelRecord[],
    month: MonthKey,
    tankCapacityLiters: number,
    context: FuelVehicleContext,
  ): Promise<{
    totalLiters: number | null
    monthLiters: number | null
    remainingFuelLiters: number | null
    monthDistanceKm: number | null
    monthLPer100Km: number | null
    historicalDistanceKm: number | null
    historicalFuelLiters: number | null
    historicalLPer100Km: number | null
  }> {
    const sorted = [...records].sort(compareRefuels)
    const totalMileageKm = context.totalMileageKm ?? null
    const remainingFuelLiters = remainingFuel(
      tankCapacityLiters,
      context.remainingOil ?? null,
      context.totalOilSegments ?? null,
    )
    if (sorted.length === 0) {
      return {
        totalLiters: null,
        monthLiters: null,
        remainingFuelLiters,
        monthDistanceKm: null,
        monthLPer100Km: null,
        historicalDistanceKm: null,
        historicalFuelLiters: null,
        historicalLPer100Km: null,
      }
    }

    const firstOfMonth = sorted.find((record) => record.time.slice(0, 7) === month)
    const baseline =
      firstOfMonth ??
      [...sorted].reverse().find((record) => record.time.slice(0, 7) < month) ??
      null
    const monthRecordsAfter = baseline
      ? sorted.filter((record) => record.time > baseline.time)
      : []
    const monthLiters =
      remainingFuelLiters === null
        ? null
        : round(monthRecordsAfter.reduce((sum, item) => sum + item.liters, 0) + remainingFuelLiters, 2)
    const monthDistanceKm =
      baseline && totalMileageKm !== null
        ? await this.distanceSince(ref, baseline.time.slice(0, 10) as DateKey)
        : null
    const monthLPer100Km =
      monthLiters !== null && monthDistanceKm !== null && monthDistanceKm > 0
        ? round((monthLiters / monthDistanceKm) * 100, 2)
        : null

    const earliest = sorted[0]
    const historicalFuelLiters =
      earliest && remainingFuelLiters !== null
        ? Math.max(0, round(sorted.reduce((sum, item) => sum + item.liters, 0) - remainingFuelLiters, 2))
        : null
    const historicalDistanceKm =
      earliest && totalMileageKm !== null
        ? await this.distanceSince(ref, earliest.time.slice(0, 10) as DateKey)
        : null
    const historicalLPer100Km =
      historicalFuelLiters !== null && historicalDistanceKm !== null && historicalDistanceKm > 0
        ? round((historicalFuelLiters / historicalDistanceKm) * 100, 2)
        : null

    return {
      totalLiters: historicalFuelLiters,
      monthLiters,
      remainingFuelLiters,
      monthDistanceKm,
      monthLPer100Km,
      historicalDistanceKm,
      historicalFuelLiters,
      historicalLPer100Km,
    }
  }

  private async distanceSince(
    ref: VehicleRef,
    startDate: DateKey,
  ): Promise<number | null> {
    const today = this.today()
    let distance = 0
    let hasData = false
    for (const month of enumerateMonths(monthOf(startDate), monthOf(today))) {
      const result = await this.deps.reportService.getMonthReport(ref, month, { force: false })
      const report = result.data?.report
      if (!report) continue
      hasData = true
      for (const day of report.days) {
        if (day.date >= startDate && day.date <= today && day.distanceKm !== null) {
          distance += day.distanceKm
        }
      }
    }
    if (!hasData) return null
    return Math.max(0, round(distance, 2))
  }

  private async latestDailyFuel(
    ref: VehicleRef,
    official: MonthlyFuelConsumption | null,
    month: MonthKey,
  ): Promise<DailyFuelConsumption | null> {
    const latest = [...(official?.days ?? [])]
      .filter((day) => day.liters !== null && day.liters > 0)
      .sort((a, b) => (a.date < b.date ? 1 : -1))[0]
    if (!latest || latest.liters === null) return null
    const report = await this.deps.reportService.getMonthReport(ref, month, { force: false })
    const day = report.data?.report?.days.find((item) => item.date === latest.date)
    const distanceKm = day?.distanceKm ?? null
    return {
      date: latest.date,
      liters: latest.liters,
      distanceKm,
      lPer100Km:
        distanceKm !== null && distanceKm > 0 ? round((latest.liters / distanceKm) * 100, 2) : null,
    }
  }

  private today(): DateKey {
    return formatDate(this.deps.clock.now())
  }
}

function normalizeRefueledAt(value: string): DateTimeText {
  const text = value.trim().replace('T', ' ')
  const match = /^(\d{4}-\d{2}-\d{2})(?:\s+(\d{2}:\d{2})(?::(\d{2}))?)?$/.exec(text)
  if (!match) {
    throw new AppError('加油时间格式应为 yyyy-MM-dd HH:mm', { code: 'INVALID_INPUT' })
  }
  const date = match[1]
  const time = match[2] ?? '00:00'
  const seconds = match[3] ?? '00'
  return `${date} ${time}:${seconds}` as DateTimeText
}

function normalizeLiters(value: number): number {
  if (!Number.isFinite(value) || value <= 0 || value > 100) {
    throw new AppError('加油量应大于 0 且不超过 100 L', { code: 'INVALID_INPUT' })
  }
  return round(value, 2)
}

function optionalPrice(value: unknown): number | null {
  const numberValue = typeof value === 'number' ? value : typeof value === 'string' ? Number(value) : NaN
  if (!Number.isFinite(numberValue) || numberValue <= 0) return null
  return round(numberValue, 2)
}

function remainingFuel(
  tankCapacityLiters: number,
  remainingOil: number | null,
  totalOilSegments: number | null,
): number | null {
  if (remainingOil === null || totalOilSegments === null || totalOilSegments <= 0) return null
  return round((tankCapacityLiters * remainingOil) / totalOilSegments, 2)
}

function compareRefuels(a: RefuelRecord, b: RefuelRecord): number {
  return a.time < b.time ? -1 : a.time > b.time ? 1 : 0
}

export function createFuelService(deps: FuelServiceDeps): FuelService {
  return new FuelService({ ...deps, logger: deps.logger ?? createLogger({ scope: 'fuel' }) })
}

/** 仅用于测试或后续扩展：下个月份。 */
export function nextFuelMonth(month: MonthKey): MonthKey {
  return addMonths(month, 1)
}
