<script setup lang="ts">
import { onError, onLaunch, onUnhandledRejection } from '@dcloudio/uni-app'
import { useAuthStore } from '@/stores/auth'
import { useVehicleStore } from '@/stores/vehicle'
import { writeTrace } from '@/utils/trace'
import { setUnauthorizedHandler } from '@/services/container'
import { goToLogin, showToast } from '@/utils/navigation'

/**
 * 应用入口。
 *
 * 只做状态恢复：读取本地会话、车辆缓存与同步状态。
 * 未登录时的跳转由各页面在 onShow 中处理（App 的 onLaunch 里 reLaunch 在小程序端不可靠）。
 */

onLaunch(() => {
  // 触发 store 创建：会话与车辆缓存都在 store 初始化时从本地存储读取
  useAuthStore()
  const vehicle = useVehicleStore()

  // 实时车况每次启动小程序都刷新一次；车辆列表继续优先使用本地缓存。
  void (async () => {
    try {
      if (vehicle.vehicles.length === 0) await vehicle.load(false)
      if (vehicle.activeRef) await vehicle.loadTelemetry()
    } catch {
      // 实时车况失败时由车辆页展示错误，不阻塞应用启动。
    }
  })()

  // ticket 失效时的统一出口：会话已在数据层清掉，这里同步状态并回登录页
  // 兼容半新半旧的构建产物：导出缺失时不要让 App 启动直接失败
  if (typeof setUnauthorizedHandler === 'function') {
    setUnauthorizedHandler(() => {
      useAuthStore().reloadFromStorage()
      showToast('登录已过期，请重新登录')
      goToLogin()
    })
  }
})

// TEMP: 把运行时错误落到本地存储，便于在开发者工具之外读取
onError((error) => {
  writeTrace('app.onError:' + String((error as { message?: string })?.message ?? error))
})
onUnhandledRejection((result) => {
  const reason = (result as { reason?: unknown })?.reason
  writeTrace('app.unhandled:' + String((reason as { message?: string })?.message ?? reason))
})
</script>

<style>
@import './styles/tokens.css';
@import './styles/layout.css';

page {
  background-color: var(--cf-bg-page);
}
</style>
