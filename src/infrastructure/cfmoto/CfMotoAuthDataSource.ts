import type { AuthCapabilities, AuthDataSource, LoginByVerifyCodeInput } from '@/core/contracts/AuthDataSource'
import type { AuthSession, UserProfile } from '@/core/domain/models'
import { AppError } from '@/core/application/errors'
import { createLogger, silentLogger, type Logger } from '@/core/shared/logger'
import type { CfMotoApiClient } from './CfMotoApiClient'
import { CFMOTO_PATHS } from './endpoints'
import type { LoginByPasswordDto, LoginByVerifyCodeDto, UserInfoDto } from './dto'
import { toAuthSession, toUserProfile } from './mappers'

/**
 * 官方认证接口数据源。

 * api.yaml 的实测状态：
 * - `sendVerifyCode` / `loginByVerifyCode` / `loginByPassword` / `checkRegistered` /
 *   `checkTicketExpire` / `logout` 都标注"未实测"或未标注已验证；
 * - 只有 `getUserInfo` 标注【已实测】。
 * 因此这里对未实测接口采取"如实返回不确定"的策略（返回 null），不臆造解析规则。
 */

export interface CfMotoAuthDataSourceDeps {
  readonly client: CfMotoApiClient
  readonly logger?: Logger
}

export const CFMOTO_AUTH_SOURCE_ID = 'cfmoto-auth'

export class CfMotoAuthDataSource implements AuthDataSource {
  readonly sourceId = CFMOTO_AUTH_SOURCE_ID
  readonly capabilities: AuthCapabilities = {
    sendVerifyCode: 'unverified',
    loginByVerifyCode: 'unverified',
    loginByPassword: 'unverified',
    checkRegistered: 'unverified',
    checkTicket: 'unverified',
    logout: 'unverified',
  }

  private readonly client: CfMotoApiClient
  private readonly logger: Logger

  constructor(deps: CfMotoAuthDataSourceDeps) {
    this.client = deps.client
    this.logger = deps.logger ?? silentLogger
  }

  async sendVerifyCode(
    phone: string,
    options: { msgType?: number; voice?: boolean } = {},
  ): Promise<void> {
    await this.client.call<unknown>({
      path: CFMOTO_PATHS.sendVerifyCode,
      method: 'POST',
      body: {
        phone,
        msg_type: options.msgType ?? 0,
        voice: options.voice ?? false,
      },
      requiresAuth: false,
    })
  }

  async loginByVerifyCode(input: LoginByVerifyCodeInput): Promise<AuthSession> {
    const data = await this.client.call<LoginByVerifyCodeDto>({
      path: CFMOTO_PATHS.loginByVerifyCode,
      method: 'POST',
      body: {
        phone: input.phone,
        verify_code: input.verifyCode,
        version: this.client.getConfig().appVersion,
      },
      requiresAuth: false,
    })
    const session = toAuthSession(data, null)
    if (!session) {
      throw new AppError('登录响应中没有 ticket 字段', {
        code: 'PARSE',
        hint: '登录接口未实测，响应结构可能与 api.yaml 描述不同',
        details: { keys: data && typeof data === 'object' ? Object.keys(data) : [] },
      })
    }
    return session
  }

  async loginByPassword(phone: string, password: string): Promise<AuthSession> {
    const data = await this.client.call<LoginByPasswordDto>({
      path: CFMOTO_PATHS.loginByPassword,
      method: 'POST',
      body: { phone, password },
      requiresAuth: false,
    })
    const session = toAuthSession(data, null)
    if (!session) {
      throw new AppError('密码登录响应与 api.yaml 描述不符，未取得 ticket', {
        code: 'PARSE',
        hint: '该接口 api.yaml 标注未实测，响应结构未确认',
      })
    }
    return session
  }

  async getUserProfile(_session: AuthSession): Promise<UserProfile> {
    const data = await this.client.call<UserInfoDto>({
      path: CFMOTO_PATHS.userInfo,
      method: 'GET',
      requiresAuth: true,
    })
    const profile = toUserProfile(data)
    if (!profile) {
      throw new AppError('用户信息响应中缺少 userId', { code: 'PARSE' })
    }
    return profile
  }

  /**
   * api.yaml 未给出该接口的响应结构（只标注"未实测"），
   * 因此只在明确返回布尔值时给出结论，其余情况返回 null 表示"无法判定"。
   */
  async checkRegistered(phone: string): Promise<boolean | null> {
    const data = await this.client.call<unknown>({
      path: CFMOTO_PATHS.checkRegistered,
      method: 'GET',
      query: { phone },
      requiresAuth: false,
    })
    return interpretNullableBoolean(data, 'check_if_registered', this.logger)
  }

  /** 同上：结构未实测，无法判定时返回 null。 */
  async checkTicket(session: AuthSession): Promise<boolean | null> {
    const data = await this.client.call<unknown>({
      path: CFMOTO_PATHS.checkTicketExpire,
      method: 'GET',
      query: { ticket: session.ticket },
      requiresAuth: true,
    })
    return interpretNullableBoolean(data, 'ticket_expire', this.logger)
  }

  async logout(_session: AuthSession): Promise<void> {
    await this.client.call<unknown>({
      path: CFMOTO_PATHS.logout,
      method: 'POST',
      requiresAuth: true,
    })
  }
}

function interpretNullableBoolean(data: unknown, path: string, logger: Logger): boolean | null {
  if (typeof data === 'boolean') return data
  logger.warn('接口返回结构未确认，无法判定结果', { path, valueType: typeof data })
  return null
}

export function createCfMotoAuthDataSource(deps: CfMotoAuthDataSourceDeps): CfMotoAuthDataSource {
  return new CfMotoAuthDataSource({ ...deps, logger: deps.logger ?? createLogger({ scope: 'cfmoto.auth' }) })
}
