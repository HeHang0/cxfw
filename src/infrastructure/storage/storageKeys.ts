/** 本地存储键。统一前缀便于版本迁移与整体清理。 */

const PREFIX = 'cfmoto:v1'

export const storageKeys = {
  vehicles: `${PREFIX}:vehicles`,
  activeVehicleId: `${PREFIX}:active-vehicle`,
  profile: `${PREFIX}:profile`,
  session: `${PREFIX}:session`,
  monthPrefix: (vehicleId: string): string => `${PREFIX}:month:${vehicleId}:`,
  month: (vehicleId: string, month: string): string => `${PREFIX}:month:${vehicleId}:${month}`,
  sync: (vehicleId: string): string => `${PREFIX}:sync:${vehicleId}`,
  refuels: (vehicleId: string): string => `${PREFIX}:refuels:${vehicleId}`,
  fuelSettings: (vehicleId: string): string => `${PREFIX}:fuel-settings:${vehicleId}`,
} as const

export function parseMonthStorageKey(key: string): { vehicleId: string; month: string } | null {
  if (!key.startsWith(`${PREFIX}:month:`)) return null
  const rest = key.slice(`${PREFIX}:month:`.length)
  const separator = rest.lastIndexOf(':')
  if (separator <= 0) return null
  return { vehicleId: rest.slice(0, separator), month: rest.slice(separator + 1) }
}
