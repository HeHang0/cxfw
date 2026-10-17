/**
 * 数据质量问题记录。
 *
 * 统计模块要求"不能把未知数据直接当成零"，因此凡是无法解析、越界、缺失的字段
 * 都会生成一条 `DataIssue`，而不是被静默替换为 0。上层页面据此提示用户数据不完整。
 */

export type DataIssueCode =
  /** 接口未返回该字段（undefined 或空字符串）。 */
  | 'MISSING_FIELD'
  /** 字段存在但不是合法数字。 */
  | 'INVALID_NUMBER'
  /** 数值为负数等不可能取值。 */
  | 'NEGATIVE_VALUE'
  /** 数值超出物理合理范围。 */
  | 'OUT_OF_RANGE'
  /** 同一天出现重复记录。 */
  | 'DUPLICATE_DAY'
  /** 日期不属于该月份。 */
  | 'DAY_OUTSIDE_MONTH'
  /** 单位无法确定。 */
  | 'UNKNOWN_UNIT'
  /** 数据不完整（缺少月份/天数）。 */
  | 'PARTIAL_DATA'
  /** 接口返回的汇总值与按天累加值不一致。 */
  | 'INCONSISTENT_TOTAL'

export type DataIssueSeverity = 'warning' | 'error'

export interface DataIssue {
  readonly code: DataIssueCode
  readonly message: string
  /** 出问题的字段路径，例如 `vehicle_report[3].intraday_mileage`。 */
  readonly path?: string
  /** 原始取值，用于排查（不含任何凭证）。 */
  readonly value?: unknown
  readonly severity: DataIssueSeverity
}

export function createIssue(
  code: DataIssueCode,
  message: string,
  options: { path?: string; value?: unknown; severity?: DataIssueSeverity } = {},
): DataIssue {
  const issue: DataIssue = {
    code,
    message,
    severity: options.severity ?? 'warning',
  }
  return {
    ...issue,
    ...(options.path === undefined ? {} : { path: options.path }),
    ...(options.value === undefined ? {} : { value: options.value }),
  }
}

export function dedupeIssues(issues: readonly DataIssue[]): DataIssue[] {
  const seen = new Set<string>()
  const result: DataIssue[] = []
  for (const issue of issues) {
    const key = `${issue.code}|${issue.path ?? ''}|${issue.message}`
    if (seen.has(key)) continue
    seen.add(key)
    result.push(issue)
  }
  return result
}
