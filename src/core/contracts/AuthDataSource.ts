import type { AuthSession, UserProfile } from '../domain/models'

/**
 * 认证数据源契约。
 *
 * `capabilities` 描述各接口的实测状态：`verified` 表示 api.yaml 标注"已实测"，
 * 页面据此对未实测能力显示"待验证"，而不是假装可用。
 */

export interface AuthCapabilities {
  readonly sendVerifyCode: 'verified' | 'unverified'
  readonly loginByVerifyCode: 'verified' | 'unverified'
  readonly loginByPassword: 'verified' | 'unverified'
  readonly checkRegistered: 'verified' | 'unverified'
  readonly checkTicket: 'verified' | 'unverified'
  readonly logout: 'verified' | 'unverified'
}

export interface SendVerifyCodeOptions {
  /** `msg_type`，登录一般为 0。 */
  readonly msgType?: number
  /** `voice=true` 为语音验证码。 */
  readonly voice?: boolean
}

export interface LoginByVerifyCodeInput {
  readonly phone: string
  readonly verifyCode: string
}

export interface AuthDataSource {
  readonly sourceId: string
  readonly capabilities: AuthCapabilities
  sendVerifyCode(phone: string, options?: SendVerifyCodeOptions): Promise<void>
  loginByVerifyCode(input: LoginByVerifyCodeInput): Promise<AuthSession>
  loginByPassword(phone: string, password: string): Promise<AuthSession>
  getUserProfile(session: AuthSession): Promise<UserProfile>
  /** 返回 null 表示接口未实测、结果无法判定。 */
  checkRegistered(phone: string): Promise<boolean | null>
  /** 返回 null 表示接口未实测、结果无法判定。 */
  checkTicket(session: AuthSession): Promise<boolean | null>
  logout(session: AuthSession): Promise<void>
}
