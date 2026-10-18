import { AuthService } from '@/core/application/AuthService'
import { HistorySyncService } from '@/core/application/HistorySyncService'
import { FuelService } from '@/core/application/FuelService'
import { RideHistoryService } from '@/core/application/RideHistoryService'
import { ReportService } from '@/core/application/ReportService'
import { VehicleService } from '@/core/application/VehicleService'
import { WeatherService } from '@/core/application/WeatherService'
import { AppError } from '@/core/application/errors'
import { systemClock, type Clock } from '@/core/contracts/Clock'
import type { KeyValueStore } from '@/core/contracts/KeyValueStore'
import type { AuthDataSource } from '@/core/contracts/AuthDataSource'
import type { RideDataSource } from '@/core/contracts/RideDataSource'
import type { RideRepository } from '@/core/contracts/RideRepository'
import type { SessionStore } from '@/core/contracts/SessionStore'
import { createLogger, type Logger } from '@/core/shared/logger'
import { CfMotoApiClient } from '@/infrastructure/cfmoto/CfMotoApiClient'
import { CfMotoAuthDataSource } from '@/infrastructure/cfmoto/CfMotoAuthDataSource'
import { CfMotoRideDataSource } from '@/infrastructure/cfmoto/CfMotoRideDataSource'
import { resolveCfMotoConfig, type CfMotoConfig, type CfMotoConfigOverrides } from '@/infrastructure/cfmoto/config'
import { FixtureAuthDataSource, FixtureRideDataSource } from '@/infrastructure/fixture/FixtureRideDataSource'
import {
  TicketRoutedAuthDataSource,
  TicketRoutedRideDataSource,
} from '@/infrastructure/fixture/TicketRoutedDataSources'
import { UniHttpClient, type UniLike } from '@/infrastructure/http/UniHttpClient'
import { UniKeyValueStore, type UniStorageLike } from '@/infrastructure/storage/UniKeyValueStore'
import { UniRideRepository } from '@/infrastructure/storage/UniRideRepository'
import { UniSessionStore } from '@/infrastructure/storage/UniSessionStore'
import { TicketRoutedKeyValueStore } from '@/infrastructure/storage/TicketRoutedKeyValueStore'
import { MemoryKeyValueStore } from '@/infrastructure/storage/MemoryKeyValueStore'
import { EastmoneyFuelPriceDataSource } from '@/infrastructure/oil/EastmoneyFuelPriceDataSource'
import { isPreviewTicket } from '@/core/domain/preview'
import { TencentWeatherDataSource } from '@/infrastructure/tencent/TencentWeatherDataSource'
import { UniWeatherRepository } from '@/infrastructure/storage/UniWeatherRepository'

/**
 * 依赖装配（唯一的组装点）。
 *
 * 页面与 store 通过这里拿到用例，不直接 new 数据源、不直接碰 uni.request / uni.setStorageSync。
 * 切换数据源或存储时只改这个文件。
 */

export type DataSourceMode = 'cfmoto' | 'fixture'

export interface AppContainer {
  readonly mode: DataSourceMode
  readonly config: CfMotoConfig
  readonly clock: Clock
  readonly logger: Logger
  readonly keyValueStore: KeyValueStore
  readonly repository: RideRepository
  readonly sessionStore: SessionStore
  readonly rideDataSource: RideDataSource
  readonly authDataSource: AuthDataSource
  readonly authService: AuthService
  readonly vehicleService: VehicleService
  readonly reportService: ReportService
  readonly historySyncService: HistorySyncService
  readonly fuelService: FuelService
  readonly rideHistoryService: RideHistoryService
  readonly weatherService: WeatherService
}

/** UI 层注册的会话失效处理（清会话 + 跳登录页）。 */
let unauthorizedHandler: (() => void) | null = null

export function setUnauthorizedHandler(handler: (() => void) | null): void {
  unauthorizedHandler = handler
}

/** 数据层拿到 401 时的统一处理：先清本地会话，再交给 UI 决定跳转。 */
function handleUnauthorized(sessionStore: SessionStore, logger: Logger): void {
  if (sessionStore.loadSession() !== null) {
    sessionStore.clearSession()
    sessionStore.clearProfile()
    logger.warn('已清除失效的本地会话')
  }
  unauthorizedHandler?.()
}

export interface CreateContainerOptions {
  readonly mode?: DataSourceMode
  readonly clock?: Clock
  readonly logger?: Logger
  readonly keyValueStore?: KeyValueStore
  readonly configOverrides?: CfMotoConfigOverrides
}

function readEnv(): Record<string, string | undefined> {
  return (import.meta.env ?? {}) as Record<string, string | undefined>
}

export function resolveDataSourceMode(): DataSourceMode {
  return readEnv()['VITE_DATA_SOURCE'] === 'fixture' ? 'fixture' : 'cfmoto'
}

export function resolveConfigOverrides(): CfMotoConfigOverrides {
  const env = readEnv()
  const timeout = env['VITE_CFMOTO_TIMEOUT_MS']

  return {
    appSecret: env['VITE_CFMOTO_APP_SECRET'] ?? '',
    ...(env['VITE_CFMOTO_BASE_URL'] ? { baseUrl: env['VITE_CFMOTO_BASE_URL'] } : {}),
    ...(env['VITE_CFMOTO_APP_ID'] ? { appId: env['VITE_CFMOTO_APP_ID'] } : {}),
    ...(env['VITE_CFMOTO_APP_VERSION'] ? { appVersion: env['VITE_CFMOTO_APP_VERSION'] } : {}),
    ...(timeout ? { timeoutMs: Number(timeout) } : {}),
  }
}

export function createContainer(options: CreateContainerOptions = {}): AppContainer {
  const mode = options.mode ?? resolveDataSourceMode()
  const logger = options.logger ?? createLogger({ scope: 'cfmoto', level: 'info' })
  const clock = options.clock ?? systemClock
  const config = resolveCfMotoConfig({ ...resolveConfigOverrides(), ...(options.configOverrides ?? {}) })
  const keyValueStore = options.keyValueStore ?? createUniKeyValueStore(logger)

  const sessionStore = new UniSessionStore({ store: keyValueStore })
  const repositoryStore = new TicketRoutedKeyValueStore({
    persistent: keyValueStore,
    preview: new MemoryKeyValueStore(),
    isPreview: () => isPreviewTicket(sessionStore.loadSession()?.ticket),
  })
  const repository = new UniRideRepository({ store: repositoryStore })

  // 调试便利：配置 VITE_DEV_TICKET 时自动写入一个会话，跳过短信登录。
  // 仅用于本地排查（ticket 属于凭证，只能放在 .env.local 这类未入库的文件里）。
  seedDevSession(sessionStore)

  const fixtureRideDataSource = new FixtureRideDataSource({ clock })
  const fixtureAuthDataSource = new FixtureAuthDataSource({ clock })

  const rideDataSource: RideDataSource =
    mode === 'fixture'
      ? fixtureRideDataSource
      : new TicketRoutedRideDataSource({
          sessionProvider: () => sessionStore.loadSession(),
          preview: fixtureRideDataSource,
          remote: new CfMotoRideDataSource({
            client: new CfMotoApiClient({
              http: createUniHttpClient(logger),
              config,
              sessionProvider: () => sessionStore.loadSession(),
              logger: logger.child('api'),
              onUnauthorized: () => handleUnauthorized(sessionStore, logger),
            }),
            now: () => clock.now(),
          }),
        })

  const authDataSource: AuthDataSource =
    mode === 'fixture'
      ? fixtureAuthDataSource
      : new TicketRoutedAuthDataSource({
          preview: fixtureAuthDataSource,
          remote: new CfMotoAuthDataSource({
            client: new CfMotoApiClient({
              http: createUniHttpClient(logger),
              config,
              sessionProvider: () => sessionStore.loadSession(),
              logger: logger.child('auth-api'),
              onUnauthorized: () => handleUnauthorized(sessionStore, logger),
            }),
          }),
        })

  const reportService = new ReportService({
    dataSource: rideDataSource,
    repository,
    clock,
    logger: logger.child('report'),
  })
  const weatherService = new WeatherService({
    dataSource: new TencentWeatherDataSource({
      http: createUniHttpClient(logger.child('weather')),
      apiKey: readEnv()['VITE_TENCENT_MAP_KEY'] ?? '',
      baseUrl: readEnv()['VITE_TENCENT_WEATHER_BASE_URL'] ?? '',
    }),
    repository: new UniWeatherRepository({ store: repositoryStore }),
    clock,
    logger: logger.child('weather'),
  })

  return {
    mode,
    config,
    clock,
    logger,
    keyValueStore: repositoryStore,
    repository,
    sessionStore,
    rideDataSource,
    authDataSource,
    authService: new AuthService({ authDataSource, sessionStore, repository, clock, logger: logger.child('auth') }),
    vehicleService: new VehicleService({ dataSource: rideDataSource, repository, clock, logger: logger.child('vehicle') }),
    reportService,
    fuelService: new FuelService({
      dataSource: rideDataSource,
      reportService,
      repository,
      priceDataSource: new EastmoneyFuelPriceDataSource(createUniHttpClient(logger.child('oil-price'))),
      clock,
      logger: logger.child('fuel'),
    }),
    rideHistoryService: new RideHistoryService({
      dataSource: rideDataSource,
      logger: logger.child('ride-history'),
    }),
    historySyncService: new HistorySyncService({
      dataSource: rideDataSource,
      repository,
      clock,
      logger: logger.child('sync'),
    }),
    weatherService,
  }
}

function requireUni(): UniLike & UniStorageLike {
  /**
   * 优先使用跨端的 `uni`；只有它不可用时才退回微信原生 `wx`
   * （两者的 request / storage 方法名一致）。这样业务层始终面向 `uni`。
   */
  const hasRequest = (value: unknown): boolean =>
    !!value && typeof (value as { request?: unknown }).request === 'function'
  const candidates: unknown[] = [
    typeof uni === 'undefined' ? undefined : uni,
    (globalThis as { uni?: unknown }).uni,
    typeof wx === 'undefined' ? undefined : wx,
    (globalThis as { wx?: unknown }).wx,
  ]
  const candidate = candidates.find(hasRequest)
  if (!candidate || (typeof candidate !== 'object' && typeof candidate !== 'function')) {
    throw new AppError('当前运行环境没有 uni 全局对象', { code: 'CONFIG' })
  }
  return candidate as UniLike & UniStorageLike
}

function createUniKeyValueStore(logger: Logger): KeyValueStore {
  return new UniKeyValueStore({ uni: requireUni(), logger })
}

function createUniHttpClient(logger: Logger): UniHttpClient {
  return new UniHttpClient({ uni: requireUni(), logger })
}

let container: AppContainer | null = null

/** 懒加载单例，供页面与 store 使用。 */
export function getContainer(): AppContainer {
  if (!container) container = createContainer()
  return container
}

/** 仅用于测试与调试：替换或清空单例。 */
export function setContainer(next: AppContainer | null): void {
  container = next
}

/** 见 createContainer 中的说明：优先使用已有会话，不覆盖真实登录结果。 */
function seedDevSession(sessionStore: SessionStore): void {
  const env = readEnv()
  const ticket = env['VITE_DEV_TICKET']
  if (!ticket || ticket.trim() === '') return
  if (sessionStore.loadSession()) return
  sessionStore.saveSession({
    ticket: ticket.trim(),
    userId: env['VITE_DEV_USER_ID'] ?? '',
    nickname: env['VITE_DEV_NICKNAME'] ?? null,
    isVip: null,
    loginAt: new Date().toISOString(),
  })
}
