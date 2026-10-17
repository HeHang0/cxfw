import { computed, ref } from 'vue'
import { defineLiteStore } from './lite'
import { toAppError, userFacingMessage, type AppError } from '@/core/application/errors'
import type { AuthSession, UserProfile } from '@/core/domain/models'
import { getContainer } from '@/services/container'

/**
 * 登录状态。
 *
 * 状态在 store 创建时直接从本地存储初始化，页面不需要再调用一次 restore()——
 * 这样少一次命令式调用，也不依赖 Pinia 在 mp-weixin 运行时对 action 的包装。
 */

export const useAuthStore = defineLiteStore(() => {
  const container = getContainer()
  const session = ref<AuthSession | null>(container.authService.getSession())
  const profile = ref<UserProfile | null>(container.repository.loadProfile())
  const loading = ref(false)
  const sendingCode = ref(false)
  const loggingIn = ref(false)
  const error = ref<AppError | null>(null)
  const warning = ref<string | null>(null)
  const countdown = ref(0)
  const mode = ref(container.mode)

  const isLoggedIn = computed(() => session.value !== null)
  const errorMessage = computed(() => (error.value ? userFacingMessage(error.value) : null))
  const canSendCode = computed(() => countdown.value === 0 && !sendingCode.value)
  const dataSourceMode = computed(() => mode.value)

  let timer: ReturnType<typeof setInterval> | null = null

  function stopCountdown(): void {
    if (timer !== null) {
      clearInterval(timer)
      timer = null
    }
  }

  function startCountdown(seconds = 60): void {
    stopCountdown()
    countdown.value = seconds
    timer = setInterval(() => {
      countdown.value -= 1
      if (countdown.value <= 0) {
        countdown.value = 0
        stopCountdown()
      }
    }, 1000)
  }

  /** 从本地存储重新读取（例如切换账号后）。 */
  function reloadFromStorage(): void {
    session.value = container.authService.getSession()
    profile.value = container.repository.loadProfile()
  }

  /**
   * 确保用户资料已加载（昵称/手机号/头像都来自 `/cfmotoservermall/user/info`）。
   *
   * 用 dev ticket 直接注入会话时不会走登录流程，也就没人拉过资料；
   * 各页面进入时调用一次，资料已存在则不重复请求。
   */
  async function ensureProfile(): Promise<UserProfile | null> {
    if (!session.value) return null
    // 旧版本缓存没有 joinedAt；补拉一次，避免档案页只显示到月份。
    if (profile.value && 'joinedAt' in profile.value) return profile.value
    await loadProfile(!(profile.value && 'joinedAt' in profile.value))
    return profile.value
  }

  async function loadProfile(refresh = false): Promise<void> {
    loading.value = true
    error.value = null
    try {
      const result = await container.authService.loadProfile({ refresh })
      profile.value = result.data ?? profile.value
      if (result.status === 'error') error.value = result.error
    } catch (caught) {
      error.value = toAppError(caught)
    } finally {
      loading.value = false
    }
  }

  async function sendCode(phone: string, options: { voice?: boolean } = {}): Promise<boolean> {
    sendingCode.value = true
    error.value = null
    warning.value = null
    try {
      const result = await container.authService.sendVerifyCode(phone, options)
      if (result.status === 'error') {
        error.value = result.error
        return false
      }
      startCountdown()
      return true
    } catch (caught) {
      error.value = toAppError(caught)
      return false
    } finally {
      sendingCode.value = false
    }
  }

  async function loginByVerifyCode(phone: string, code: string): Promise<boolean> {
    loggingIn.value = true
    error.value = null
    warning.value = null
    try {
      const result = await container.authService.loginByVerifyCode(phone, code)
      if (!result.data) {
        error.value = result.error
        return false
      }
      session.value = result.data.session
      profile.value = result.data.profile
      if (result.data.profileError) warning.value = `用户资料获取失败：${result.data.profileError.message}`
      return true
    } catch (caught) {
      error.value = toAppError(caught)
      return false
    } finally {
      loggingIn.value = false
    }
  }

  async function loginByPassword(phone: string, password: string): Promise<boolean> {
    loggingIn.value = true
    error.value = null
    warning.value = null
    try {
      const result = await container.authService.loginByPassword(phone, password)
      if (!result.data) {
        error.value = result.error
        return false
      }
      session.value = result.data.session
      profile.value = result.data.profile
      if (result.data.profileError) warning.value = `用户资料获取失败：${result.data.profileError.message}`
      return true
    } catch (caught) {
      error.value = toAppError(caught)
      return false
    } finally {
      loggingIn.value = false
    }
  }

  async function logout(): Promise<void> {
    await container.authService.logout()
    session.value = null
    profile.value = null
    stopCountdown()
  }

  function clearError(): void {
    error.value = null
    warning.value = null
  }

  return {
    session,
    profile,
    loading,
    sendingCode,
    loggingIn,
    error,
    warning,
    countdown,
    isLoggedIn,
    errorMessage,
    canSendCode,
    dataSourceMode,
    reloadFromStorage,
    ensureProfile,
    loadProfile,
    sendCode,
    loginByVerifyCode,
    loginByPassword,
    logout,
    clearError,
  }
})
