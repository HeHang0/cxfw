import type {
  AuthCapabilities,
  AuthDataSource,
  LoginByVerifyCodeInput,
  SendVerifyCodeOptions,
} from '@/core/contracts/AuthDataSource'
import type { RideDataSource, RideDataSourceCapabilities } from '@/core/contracts/RideDataSource'
import type { DateKey, MonthKey, VehicleRef } from '@/core/domain/identifiers'
import type {
  AuthSession,
  DayRideStats,
  MonthRideReport,
  MonthlyFuelConsumption,
  Paged,
  RideHistoryDetail,
  RideHistoryItem,
  RideHistoryQuery,
  UserProfile,
  Vehicle,
  VehicleState,
  VehicleTelemetry,
} from '@/core/domain/models'
import { isPreviewCredentials, isPreviewTicket } from '@/core/domain/preview'

/**
 * 官方接口外层的数据源路由。
 *
 * 正常 ticket 继续访问春天官方接口；`ticket=test` 时所有取数调用都转到
 * `FixtureRideDataSource`，页面与业务层不需要感知演示模式。
 */
export class TicketRoutedRideDataSource implements RideDataSource {
  private readonly remote: RideDataSource
  private readonly preview: RideDataSource
  private readonly sessionProvider: () => AuthSession | null

  constructor(options: {
    readonly remote: RideDataSource
    readonly preview: RideDataSource
    readonly sessionProvider: () => AuthSession | null
  }) {
    this.remote = options.remote
    this.preview = options.preview
    this.sessionProvider = options.sessionProvider
  }

  private active(): RideDataSource {
    return isPreviewTicket(this.sessionProvider()?.ticket) ? this.preview : this.remote
  }

  get sourceId(): string {
    return this.active().sourceId
  }

  get capabilities(): RideDataSourceCapabilities {
    return this.active().capabilities
  }

  listVehicles(): Promise<Vehicle[]> {
    return this.active().listVehicles()
  }

  getVehicleState(ref: VehicleRef): Promise<VehicleState> {
    return this.active().getVehicleState(ref)
  }

  getVehicleTelemetry(ref: VehicleRef): Promise<VehicleTelemetry> {
    return this.active().getVehicleTelemetry(ref)
  }

  getMonthReport(ref: VehicleRef, month: MonthKey): Promise<MonthRideReport> {
    return this.active().getMonthReport(ref, month)
  }

  getMonthlyFuel(ref: VehicleRef, month: MonthKey): Promise<MonthlyFuelConsumption> {
    return this.active().getMonthlyFuel(ref, month)
  }

  getDayStats(ref: VehicleRef, date: DateKey): Promise<DayRideStats> {
    return this.active().getDayStats(ref, date)
  }

  listRideHistory(ref: VehicleRef, query: RideHistoryQuery): Promise<Paged<RideHistoryItem>> {
    return this.active().listRideHistory(ref, query)
  }

  getRideHistoryDetail(ref: VehicleRef, id: string): Promise<RideHistoryDetail> {
    return this.active().getRideHistoryDetail(ref, id)
  }
}

/**
 * 认证接口路由：只对 `test/test` 这个本地预览账号生效。
 * 用户的 `/user/info` 等资料请求同样按 ticket 转入 fixture，绝不读取真实账号缓存。
 */
export class TicketRoutedAuthDataSource implements AuthDataSource {
  private readonly remote: AuthDataSource
  private readonly preview: AuthDataSource

  constructor(options: { readonly remote: AuthDataSource; readonly preview: AuthDataSource }) {
    this.remote = options.remote
    this.preview = options.preview
  }

  get sourceId(): string {
    return this.remote.sourceId
  }

  get capabilities(): AuthCapabilities {
    return this.remote.capabilities
  }

  sendVerifyCode(phone: string, options?: SendVerifyCodeOptions): Promise<void> {
    return this.remote.sendVerifyCode(phone, options)
  }

  loginByVerifyCode(input: LoginByVerifyCodeInput): Promise<AuthSession> {
    return this.remote.loginByVerifyCode(input)
  }

  loginByPassword(phone: string, password: string): Promise<AuthSession> {
    return isPreviewCredentials(phone, password)
      ? this.preview.loginByPassword(phone, password)
      : this.remote.loginByPassword(phone, password)
  }

  getUserProfile(session: AuthSession): Promise<UserProfile> {
    return isPreviewTicket(session.ticket)
      ? this.preview.getUserProfile(session)
      : this.remote.getUserProfile(session)
  }

  checkRegistered(phone: string): Promise<boolean | null> {
    return this.remote.checkRegistered(phone)
  }

  checkTicket(session: AuthSession): Promise<boolean | null> {
    return isPreviewTicket(session.ticket) ? this.preview.checkTicket(session) : this.remote.checkTicket(session)
  }

  logout(session: AuthSession): Promise<void> {
    return isPreviewTicket(session.ticket) ? this.preview.logout(session) : this.remote.logout(session)
  }
}
