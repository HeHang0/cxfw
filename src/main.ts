import { createSSRApp } from 'vue'
import App from './App.vue'

// #ifdef H5
import { uni as h5Uni } from '@dcloudio/uni-h5'

// uni-app H5 运行时会在全局放一个空的 uni 占位对象；补入官方 H5 API，
// 让容器、存储和导航层继续通过统一的 uni 接口工作。
if (typeof window !== 'undefined') {
  const globalApi = window as Window & {
    uni?: Record<string, unknown>
    wx?: Record<string, unknown>
  }
  globalApi.uni = h5Uni as unknown as Record<string, unknown>
  globalApi.wx = globalApi.uni
}
// #endif

export function createApp() {
  const app = createSSRApp(App)
  return { app }
}
