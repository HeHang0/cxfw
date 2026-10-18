/**
 * 平台 API 访问层。
 *
 * 优先使用跨端的 `uni`，只有在 `uni` 不可用时才退回微信原生 `wx`。
 * 两者的 request / storage / 导航方法签名一致，因此 wx 可以作为最后兜底，
 * 但业务代码默认走 `uni`，保证 H5、App、各家小程序都能复用。
 */

export interface PlatformApi {
  reLaunch(options: { url: string }): void
  switchTab(options: { url: string }): void
  showToast(options: { title: string; icon?: 'success' | 'none' | 'error'; duration?: number }): void
  showModal(options: {
    title?: string
    content: string
    success?: (result: { confirm?: boolean }) => void
    fail?: () => void
  }): void
  getWindowInfo?(): { statusBarHeight?: number; windowWidth?: number }
  getSystemInfoSync?(): { statusBarHeight?: number; windowWidth?: number }
  getMenuButtonBoundingClientRect?(): { right?: number; top?: number; bottom?: number } | undefined
}

function isUsable(candidate: unknown): candidate is PlatformApi {
  if (!candidate) return false
  const api = candidate as Partial<PlatformApi>
  return typeof api.reLaunch === 'function' || typeof api.showToast === 'function'
}

let cached: PlatformApi | null = null

export function platform(): PlatformApi {
  if (cached) return cached
  /**
   * 顺序很重要：
   * - `wx` 是微信原生全局，直接引用不会被 uni-app 的编译期替换改坏；
   * - `uni` 在本项目的 mp 产物里被替换成 vendor 的工厂函数，因此必须校验能否真正调用；
   * - `globalThis` 在小程序沙箱里不一定挂着 wx/uni，只作为最后的兜底。
   */
  const candidates: unknown[] = [
    typeof uni === 'undefined' ? undefined : uni,
    (globalThis as { uni?: unknown }).uni,
    typeof wx === 'undefined' ? undefined : wx,
    (globalThis as { wx?: unknown }).wx,
  ]
  for (const candidate of candidates) {
    if (isUsable(candidate)) {
      cached = candidate
      return cached
    }
  }
  throw new Error('当前运行环境没有可用的 uni/wx API')
}

/** 便于测试与调试时重置缓存。 */
export function resetPlatformCache(): void {
  cached = null
}
