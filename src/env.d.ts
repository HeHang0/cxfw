/// <reference types="vite/client" />

declare module '*.vue' {
  import type { DefineComponent } from 'vue'
  const component: DefineComponent<Record<string, unknown>, Record<string, unknown>, unknown>
  export default component
}

interface ImportMetaEnv {
  readonly VITE_DATA_SOURCE?: string
  readonly VITE_CFMOTO_APP_SECRET?: string
  readonly VITE_CFMOTO_BASE_URL?: string
  readonly VITE_CFMOTO_APP_ID?: string
  readonly VITE_CFMOTO_APP_VERSION?: string
  readonly VITE_CFMOTO_TIMEOUT_MS?: string
  /** 仅调试用：直接注入登录 ticket，跳过短信验证码登录。 */
  readonly VITE_DEV_TICKET?: string
  readonly VITE_DEV_USER_ID?: string
  readonly VITE_DEV_NICKNAME?: string
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}

/**
 * 微信小程序原生 API。
 * 仅在小程序运行时存在；H5 下为 undefined，因此这里声明成可空。
 */
declare const wx: Record<string, unknown> | undefined

declare module '@dcloudio/uni-h5' {
  export const uni: Record<string, unknown>
}

