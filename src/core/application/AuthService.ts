import type { AuthDataSource, SendVerifyCodeOptions } from '../contracts/AuthDataSource'
import type { Clock } from '../contracts/Clock'
import type { RideRepository } from '../contracts/RideRepository'
import type { SessionStore } from '../contracts/SessionStore'
import type { AuthSession, UserProfile } from '../domain/models'
import { createLogger, silentLogger, type Logger } from '../shared/logger'
import { createIssue } from '../domain/issues'
import { isPreviewCredentials, PREVIEW_LOGIN_NAME } from '../domain/preview'
import { AppError, toAppError } from './errors'
import { okResult, errorResult, type DataResult } from './results'

/**
 * 登录与会话用例。
 *
 * 页面只调用这里，不直接碰数据源，也不直接读写本地存储。
 * 所有日志都经过 logger 的脱敏，手机号打码、验证码与 ticket 不落日志。
 */

export interface AuthServiceDeps {
  readonly authDataSource: AuthDataSource
  readonly sessionStore: SessionStore
  readonly repository: RideRepository
  readonly clock: Clock
  readonly logger?: Logger
}

const PHONE_PATTERN = /^1[3-9]\d{9}$/
const VERIFY_CODE_PATTERN = /^\d{4,8}$/

export interface LoginResult {
  readonly session: AuthSession
  readonly profile: UserProfile | null
  /** 资料接口失败不影响登录结果。 */
  readonly profileError: AppError | null
}

export class AuthService {
  private readonly deps: AuthServiceDeps
  private readonly logger: Logger

  constructor(deps: AuthServiceDeps) {
    this.deps = deps
    this.logger = deps.logger ?? silentLogger
  }

  /** 当前会话（来自本地存储，不做网络校验）。 */
  getSession(): AuthSession | null {
    return this.deps.sessionStore.loadSession()
  }

  isLoggedIn(): boolean {
    const session = this.getSession()
    return session !== null && session.ticket !== ''
  }

  assertPhone(phone: string): string {
    const value = phone.trim()
    if (!PHONE_PATTERN.test(value)) {
      throw new AppError('手机号格式不正确', { code: 'INVALID_INPUT' })
    }
    return value
  }

  async sendVerifyCode(
    phone: string,
    options: SendVerifyCodeOptions = {},
  ): Promise<DataResult<{ sent: true }>> {
    try {
      const normalized = this.assertPhone(phone)
      await this.deps.authDataSource.sendVerifyCode(normalized, options)
      this.logger.info('验证码已发送', { phone: normalized, voice: options.voice ?? false })
      return okResult({ sent: true as const })
    } catch (error) {
      const appError = toAppError(error)
      this.logger.error('验证码发送失败', { code: appError.code, message: appError.message })
      return errorResult(appError)
    }
  }

  async loginByVerifyCode(phone: string, verifyCode: string): Promise<DataResult<LoginResult>> {
    try {
      const normalized = this.assertPhone(phone)
      const code = verifyCode.trim()
      if (!VERIFY_CODE_PATTERN.test(code)) {
        throw new AppError('验证码格式不正确', { code: 'INVALID_INPUT' })
      }
      const session = await this.deps.authDataSource.loginByVerifyCode({ phone: normalized, verifyCode: code })
      return okResult(await this.persistLogin(session))
    } catch (error) {
      const appError = toAppError(error)
      // 注意：不记录验证码本身。
      this.logger.error('验证码登录失败', { code: appError.code, message: appError.message })
      return errorResult(appError)
    }
  }

  async loginByPassword(phone: string, password: string): Promise<DataResult<LoginResult>> {
    try {
      // 本地预览账号不是手机号，只放行 test/test；真实账号仍严格校验手机号格式。
      const normalized = isPreviewCredentials(phone, password)
        ? PREVIEW_LOGIN_NAME
        : this.assertPhone(phone)
      if (password.length === 0) {
        throw new AppError('密码不能为空', { code: 'INVALID_INPUT' })
      }
      const session = await this.deps.authDataSource.loginByPassword(normalized, password)
      return okResult(await this.persistLogin(session))
    } catch (error) {
      const appError = toAppError(error)
      this.logger.error('密码登录失败', { code: appError.code, message: appError.message })
      return errorResult(appError)
    }
  }

  /**
   * 恢复本地会话。
   *
   * `/auth/ticket/ticket_expire/` 在 api.yaml 中标注"未实测"，因此默认不主动校验：
   * 只有调用方显式要求 `verify` 时才请求，且接口返回不确定（null）时保留会话。
   */
  async restoreSession(options: { verify?: boolean } = {}): Promise<DataResult<AuthSession>> {
    const session = this.getSession()
    if (!session) {
      return errorResult(
        new AppError('本地没有登录会话', { code: 'UNAUTHORIZED', hint: '请先登录' }),
      )
    }
    if (!options.verify) {
      return okResult(session, { fromCache: true })
    }
    try {
      const valid = await this.deps.authDataSource.checkTicket(session)
      if (valid === false) {
        this.clearLocalSession()
        return errorResult(new AppError('登录状态已失效', { code: 'UNAUTHORIZED', hint: '请重新登录' }))
      }
      return okResult(session, { fromCache: true })
    } catch (error) {
      const appError = toAppError(error)
      // 校验失败不代表会话无效（可能只是网络问题），保留本地会话并提示。
      this.logger.warn('ticket 校验失败，保留本地会话', { code: appError.code })
      return okResult(session, { fromCache: true })
    }
  }

  async loadProfile(options: { refresh?: boolean } = {}): Promise<DataResult<UserProfile>> {
    const session = this.getSession()
    if (!session) {
      return errorResult(new AppError('尚未登录', { code: 'UNAUTHORIZED' }))
    }
    if (!options.refresh) {
      const cached = this.deps.repository.loadProfile()
      if (cached) return okResult(cached, { fromCache: true })
    }
    try {
      const profile = await this.deps.authDataSource.getUserProfile(session)
      this.deps.repository.saveProfile(profile)
      return okResult(profile)
    } catch (error) {
      const appError = toAppError(error)
      this.logger.warn('获取用户资料失败', { code: appError.code, message: appError.message })
      const cached = this.deps.repository.loadProfile()
      if (cached) {
        return okResult(cached, {
          fromCache: true,
          issues: [createIssue('PARTIAL_DATA', `用户资料刷新失败，显示本地缓存：${appError.message}`, { path: 'profile' })],
        })
      }
      return errorResult(appError)
    }
  }

  async logout(): Promise<void> {
    const session = this.getSession()
    if (session) {
      try {
        await this.deps.authDataSource.logout(session)
      } catch (error) {
        // 登出接口未实测，失败也要清掉本地会话，否则用户无法退出。
        this.logger.warn('登出接口调用失败，仍清除本地会话', { code: toAppError(error).code })
      }
    }
    this.clearLocalSession()
  }

  clearLocalSession(): void {
    this.deps.sessionStore.clearSession()
    this.deps.sessionStore.clearProfile()
  }

  private async persistLogin(session: AuthSession): Promise<LoginResult> {
    this.deps.sessionStore.saveSession(session)
    let profile: UserProfile | null = null
    let profileError: AppError | null = null
    try {
      profile = await this.deps.authDataSource.getUserProfile(session)
      this.deps.repository.saveProfile(profile)
    } catch (error) {
      profileError = toAppError(error)
      const cached = this.deps.repository.loadProfile()
      profile = cached
      this.logger.warn('登录成功但获取用户资料失败', { code: profileError.code })
    }
    this.logger.info('登录成功', { userId: session.userId, nickname: session.nickname })
    return { session, profile, profileError }
  }
}

export function createAuthService(deps: AuthServiceDeps): AuthService {
  return new AuthService({ ...deps, logger: deps.logger ?? createLogger({ scope: 'auth' }) })
}
