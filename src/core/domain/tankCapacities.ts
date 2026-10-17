export interface TankCapacityItem {
  readonly name: string
  readonly value: number
}

/** 车型油箱容量（L）。后续可直接在这里增删车型。 */
export const TANK_CAPACITIES: readonly TankCapacityItem[] = [
  { name: '250SR', value: 12.0 },
  { name: '250SRFUN', value: 12.0 },
  { name: '450SR', value: 14.0 },
  { name: '450SRS', value: 14.0 },
  { name: '500SRVOOM', value: 15.0 },
  { name: '675SRR', value: 15.0 },
  { name: '450MT', value: 17.5 },
  { name: '700MT', value: 20.0 },
  { name: '800MT', value: 19.0 },
  { name: '800MTX', value: 22.5 },
  { name: '1250TRG', value: 23.0 },
  { name: '150NK', value: 10.0 },
  { name: '250NK', value: 12.5 },
  { name: '400NK', value: 17.0 },
  { name: '450NK', value: 14.0 },
  { name: '650NK', value: 17.0 },
  { name: '675NK', value: 15.0 },
  { name: '800NK', value: 15.0 },
  { name: '250CLX', value: 13.0 },
  { name: '700CLX', value: 13.0 },
  { name: '250CLC', value: 13.5 },
  { name: '450CLC', value: 12.0 },
  { name: '450CLCBobber', value: 12.0 },
  { name: '550CLC', value: 14.0 },
  { name: 'XOPAPIO', value: 7.0 },
  { name: '125AURA', value: 6.5 },
  { name: '150SC', value: 8.5 },
]

export const DEFAULT_TANK_CAPACITY = 12

export function normalizeVehicleTypeName(value: string | null | undefined): string {
  return (value ?? '').replace(/[^0-9a-z]/gi, '').toUpperCase()
}

export function tankCapacityForVehicle(value: string | null | undefined): number {
  const normalized = normalizeVehicleTypeName(value)
  if (normalized === '') return DEFAULT_TANK_CAPACITY
  return (
    TANK_CAPACITIES.find((item) => normalizeVehicleTypeName(item.name) === normalized)?.value ??
    DEFAULT_TANK_CAPACITY
  )
}
