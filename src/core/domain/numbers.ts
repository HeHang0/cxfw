/** 数值解析与舍入工具。所有"可能缺失"的数值统一用 `number | null` 表达，绝不用 0 替代未知。 */

/**
 * 解析接口返回的数值字段。
 * 接口里里程、时长等都以字符串形式返回（例如 `'57400.00'`），空字符串与非法值返回 null。
 */
export function parseNullableNumber(input: unknown): number | null {
  if (input === null || input === undefined) return null
  if (typeof input === 'number') return Number.isFinite(input) ? input : null
  if (typeof input === 'string') {
    const trimmed = input.trim()
    if (trimmed === '') return null
    const value = Number(trimmed)
    return Number.isFinite(value) ? value : null
  }
  if (typeof input === 'boolean') return null
  return null
}

export function parseNullableInt(input: unknown): number | null {
  const value = parseNullableNumber(input)
  return value === null ? null : Math.round(value)
}

export function round(value: number, digits = 1): number {
  const factor = 10 ** digits
  return Math.round(value * factor) / factor
}

export interface SumResult {
  /** 所有已知值之和；完全没有已知值时是 null，而不是 0。 */
  readonly total: number | null
  readonly known: number
  readonly missing: number
}

export function sumKnown(values: readonly (number | null)[]): SumResult {
  let total = 0
  let known = 0
  let missing = 0
  for (const value of values) {
    if (value === null) {
      missing += 1
      continue
    }
    total += value
    known += 1
  }
  return { total: known === 0 ? null : total, known, missing }
}

