import type { TabItem } from '@/components/types'
import { platform } from './platform'

/** 页面路由与底部导航配置。 */

export const ROUTES = {
  login: '/pages/login/index',
  overview: '/pages/overview/index',
  report: '/pages/report/index',
  archive: '/pages/archive/index',
  vehicle: '/pages/vehicle/index',
  fuel: '/pages/fuel/index',
  rideDetail: '/pages/ride-detail/index',
} as const

/**
 * 底部导航项。
 *
 * 标签与图标顺序完全按设计稿（总览 / 报告 / 档案 / 车辆）；
 * 设计稿里「档案」用的是人形图标，这里保持与设计稿一致。
 */
export const NAV_TABS: TabItem[] = [
  { key: 'overview', label: '总览', path: ROUTES.overview, activeIcon: 'home-primary', icon: 'home-tertiary' },
  { key: 'report', label: '报告', path: ROUTES.report, activeIcon: 'chart-primary', icon: 'chart-tertiary' },
  { key: 'archive', label: '档案', path: ROUTES.archive, activeIcon: 'user-primary', icon: 'user-tertiary' },
  { key: 'vehicle', label: '车辆', path: ROUTES.vehicle, activeIcon: 'bike-primary', icon: 'bike-tertiary' },
]

/**
 * 切换到底部导航页面。
 *
 * 自定义底部导航（设计稿是白底 + 选中胶囊，原生 tabBar 做不出）意味着
 * pages.json 里不能声明 tabBar，因此这里用 reLaunch 而不是 switchTab。
 */
export function goToTab(path: string): void {
  platform().reLaunch({ url: path })
}

export function goToLogin(): void {
  platform().reLaunch({ url: ROUTES.login })
}

export function navigateTo(path: string): void {
  const api = platform() as { navigateTo?: (options: { url: string }) => void }
  if (api.navigateTo) api.navigateTo({ url: path })
  else platform().reLaunch({ url: path })
}

export function navigateBack(): void {
  const api = platform() as { navigateBack?: (options?: { delta?: number }) => void }
  if (api.navigateBack) api.navigateBack({ delta: 1 })
  else platform().reLaunch({ url: ROUTES.report })
}

export function showToast(title: string, icon: 'success' | 'none' | 'error' = 'none'): void {
  platform().showToast({ title, icon, duration: 2000 })
}

export function showConfirm(content: string, title = '请确认'): Promise<boolean> {
  return new Promise((resolve) => {
    platform().showModal({
      title,
      content,
      success: (result) => resolve(Boolean(result.confirm)),
      fail: () => resolve(false),
    })
  })
}
