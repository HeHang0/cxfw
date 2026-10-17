/**
 * uni-app 事件读取工具。
 *
 * uni-app 的输入事件是 `{ detail: { value } }`，而 Vue 的 DOM 类型要求处理 `Event`，
 * 两者签名不兼容，因此这里用宽松入参做一次安全读取，避免在页面里写 `any`。
 */

export function readInputValue(event: unknown): string {
  const detail = (event as { detail?: { value?: unknown } } | null)?.detail
  if (!detail) return ''
  return typeof detail.value === 'string' ? detail.value : String(detail.value ?? '')
}
