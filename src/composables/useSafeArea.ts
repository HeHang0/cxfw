import { ref } from 'vue'
import { platform } from '@/utils/platform'

/**
 * 自定义导航栏下的安全区计算。
 *
 * 设计稿是沉浸式布局（顶部只有系统状态栏，没有导航栏），所以 pages.json 里关掉了原生导航栏，
 * 由页面自己补两件事：
 * - 状态栏高度：内容不能顶到刘海/状态栏下面，页面顶部留出 `statusBarHeight`；
 * - 微信胶囊：小程序右上角有固定的胶囊按钮，设计稿右上角的按钮组需要让到胶囊左侧，
 *   这里算出内容区还需要额外留出的右侧宽度。H5/App 没有胶囊，结果为 0。
 */

interface SystemInfoLike {
  readonly statusBarHeight?: number
  readonly windowWidth?: number
}

interface MenuButtonRectLike {
  readonly left?: number
  readonly right?: number
  readonly top?: number
  readonly bottom?: number
}

/** 胶囊与页面右侧按钮之间的间隙（设计上留 8px 呼吸感）。 */
const CAPSULE_GAP_PX = 8
/** `--cf-space-page` 的设计值：40rpx。 */
const PAGE_PADDING_RPX = 40
/** 没有胶囊时（H5/App）的自定义导航栏高度。 */
const DEFAULT_NAV_BAR_HEIGHT = 44

export interface SafeArea {
  /** 状态栏高度（px），用于页面顶部占位。 */
  readonly statusBarHeight: number
  /** 内容区右上角需要额外让出的右侧留白（px），保证按钮位于胶囊左侧。 */
  readonly capsuleGap: number
  /** 胶囊高度（px），无胶囊时为 0。 */
  readonly capsuleHeight: number
  /** 自定义导航栏高度（px），标题行按这个高度垂直居中即可与胶囊平齐。 */
  readonly navBarHeight: number
}

function readSafeArea(): SafeArea {
  const api = platform() as {
    getWindowInfo?: () => SystemInfoLike
    getSystemInfoSync?: () => SystemInfoLike
    getMenuButtonBoundingClientRect?: () => MenuButtonRectLike | undefined
  }
  let statusBarHeight = 0
  let capsuleGap = 0
  let capsuleHeight = 0
  let navBarHeight = DEFAULT_NAV_BAR_HEIGHT

  try {
    // 微信已将 getSystemInfoSync 标记为废弃，优先使用 getWindowInfo。
    // 仅老版本基础库缺少 getWindowInfo 时才回退，避免新环境反复触发废弃警告。
    let info = api.getWindowInfo?.() ?? {}
    if (info.statusBarHeight === undefined || info.windowWidth === undefined) {
      info = { ...info, ...(api.getSystemInfoSync?.() ?? {}) }
    }
    statusBarHeight = Number(info.statusBarHeight ?? 0)

    const rect = api.getMenuButtonBoundingClientRect?.()
    const windowWidth = Number(info.windowWidth ?? 0)
    if (
      rect &&
      typeof rect.left === 'number' &&
      typeof rect.right === 'number' &&
      typeof rect.top === 'number' &&
      typeof rect.bottom === 'number' &&
      windowWidth > 0
    ) {
      capsuleHeight = Math.max(0, rect.bottom - rect.top)
      const capsuleTopOffset = Math.max(0, rect.top - statusBarHeight)
      navBarHeight = capsuleHeight + capsuleTopOffset * 2

      /**
       * 页头位于左右各 40rpx 的内容区内。要让它真正停到胶囊左侧，
       * 需要从「屏幕右边缘到胶囊左边缘」的距离里扣掉这层页面内边距。
       */
      const pagePadding = (windowWidth * PAGE_PADDING_RPX) / 750
      capsuleGap = Math.max(0, windowWidth - rect.left + CAPSULE_GAP_PX - pagePadding)
    }
  } catch {
    // 取不到系统信息时按无状态栏/无胶囊处理，不影响页面可用性
  }

  return { statusBarHeight, capsuleGap, capsuleHeight, navBarHeight }
}

const safeArea = ref<SafeArea>({
  statusBarHeight: 0,
  capsuleGap: 0,
  capsuleHeight: 0,
  navBarHeight: DEFAULT_NAV_BAR_HEIGHT,
})

/** 首次调用时读取一次系统信息，之后复用（同一台设备上不会变）。 */
export function useSafeArea(): SafeArea {
  if (safeArea.value.statusBarHeight === 0 && safeArea.value.capsuleGap === 0) {
    safeArea.value = readSafeArea()
  }
  return safeArea.value
}
