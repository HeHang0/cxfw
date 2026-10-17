import type { MonthKey, VehicleRef } from '@/core/domain/identifiers'
import type { MonthRideReport } from '@/core/domain/models'
import { createMonthRideReport } from '@/core/domain/validation'

export const TEST_REF: VehicleRef = {
  vehicleId: '1000000001',
  deviceId: '90000000000001',
  vin: 'LTEST000000000001',
  equipmentNum: '860000000000001',
}

export const TEST_USER_ID = '90000001'
export const TEST_RIDE_ID = 'TEST-RIDE-0001'

export interface RawDay {
  readonly date: string
  readonly distanceMeters: number | string | null
  readonly durationSeconds: number | string | null
  readonly maxSpeedKph: number | string | null
  readonly rapidAcceleration?: number | null
  readonly rapidDeceleration?: number | null
  readonly rapidTurn?: number | null
}

export function makeMonthReport(
  month: MonthKey,
  days: readonly RawDay[],
  options: { firstBindMonth?: string; reportedTotalRaw?: string; fetchedAt?: string } = {},
): MonthRideReport {
  const input: Parameters<typeof createMonthRideReport>[0] = {
    month,
    vehicleId: TEST_REF.vehicleId,
    deviceId: TEST_REF.deviceId,
    days,
    fetchedAt: options.fetchedAt ?? '2026-10-17T00:00:00.000Z',
    source: 'test',
    ...(options.firstBindMonth === undefined ? {} : { firstBindMonth: options.firstBindMonth }),
    ...(options.reportedTotalRaw === undefined ? {} : { reportedTotalRaw: options.reportedTotalRaw }),
  }
  return createMonthRideReport(input)
}

/** 生成一个月的"每天都有骑行"的报表，便于验证汇总逻辑。 */
export function makeDailyReport(
  month: MonthKey,
  perDay: { distanceMeters: number; durationSeconds: number; maxSpeedKph: number },
  daysInMonth: number,
): MonthRideReport {
  const days: RawDay[] = []
  for (let day = 1; day <= daysInMonth; day += 1) {
    days.push({
      date: `${month}-${String(day).padStart(2, '0')}`,
      distanceMeters: perDay.distanceMeters,
      durationSeconds: perDay.durationSeconds,
      maxSpeedKph: perDay.maxSpeedKph,
    })
  }
  return makeMonthReport(month, days)
}
