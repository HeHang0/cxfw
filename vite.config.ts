import { defineConfig, loadEnv, type Plugin } from 'vite'
import uni from '@dcloudio/vite-plugin-uni'

/**
 * H5 地图配置由 uni-app 在编译期从 manifest.json 读取。
 * 这里把 .env / .env.local 中的高德配置替换进 manifest 的虚拟模块，
 * 避免把 Key 直接提交到仓库。
 */
function amapManifestPlugin(amapKey: string, serviceHost: string): Plugin {
  return {
    name: 'chunxu:amap-manifest',
    enforce: 'pre',
    transform(code, id) {
      const file = id.split('?')[0].replace(/\\/g, '/')
      if (!file.endsWith('manifest-json-js')) return null
      if (!amapKey && !serviceHost) return null

      let manifest: Record<string, unknown>
      try {
        manifest = JSON.parse(code) as Record<string, unknown>
      } catch {
        return null
      }

      const h5 = asRecord(manifest.h5)
      const sdkConfigs = asRecord(h5.sdkConfigs)
      const maps = asRecord(sdkConfigs.maps)
      const amap = asRecord(maps.amap)

      if (amapKey) amap.key = amapKey
      if (serviceHost) amap.serviceHost = serviceHost

      h5.sdkConfigs = sdkConfigs
      sdkConfigs.maps = maps
      maps.amap = amap
      manifest.h5 = h5

      return { code: JSON.stringify(manifest), map: null }
    }
  }
}

function asRecord(value: unknown): Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
    ? { ...(value as Record<string, unknown>) }
    : {}
}

export default defineConfig(({ mode }) => {
  // 传入空前缀，才能读取 .env.local 中未以 VITE_ 开头的值；
  // 同时也会合并 workflow 注入的 process.env。
  const env = loadEnv(mode, process.cwd(), '')
  const configuredBase = env.VITE_PUBLIC_BASE?.trim()
  const base = configuredBase && configuredBase !== '/'
    ? `${configuredBase.replace(/\/+$/, '')}/`
    : '/'
  const amapKey = env.VITE_AMAP_KEY?.trim() ?? ''
  const amapServiceHost = env.VITE_AMAP_SERVICE_URL?.trim() ?? ''

  return {
    base,
    plugins: [amapManifestPlugin(amapKey, amapServiceHost), uni()],
  }
})

