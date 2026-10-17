import type { Clock } from '@/core/contracts/Clock'
import type { HttpClient, HttpMethod, HttpRequest, QueryValue } from '@/core/contracts/HttpClient'
import type { AuthSession } from '@/core/domain/models'
import { AppError, toAppError } from '@/core/application/errors'
import { createLogger, silentLogger, type Logger } from '@/core/shared/logger'
import { MISSING_APP_SECRET_HINT, MISSING_APP_SECRET_MESSAGE, type CfMotoConfig } from './config'
import type { CfMotoEnvelope } from './dto'
import { buildSignedHeaders, hasAppSecret } from './signing'

/**
 * 官方接口的统一请求层：签名、Cookie、响应包络解析、错误归一化都在这里。
 *
 * 上层（CfMotoRideDataSource / CfMotoAuthDataSource）只描述"请求什么"，
 * 不关心签名和错误处理细节。
 */

export interface CfMotoApiClientDeps {
  readonly http: HttpClient
  readonly config: CfMotoConfig
  readonly sessionProvider: () => AuthSession | null
  readonly logger?: Logger
  readonly clock?: Clock
  /** ticket 失效时的回调（清会话 + 跳登录页），由装配层注入，避免把 UI 依赖带进数据层。 */
  readonly onUnauthorized?: () => void
}

export interface CfMotoCall {
  readonly path: string
  readonly method: HttpMethod
  readonly query?: Readonly<Record<string, QueryValue>>
  readonly body?: unknown
  /** 是否需要 ticket。登录/验证码接口传 false。 */
  readonly requiresAuth?: boolean
  /** Cookie 中 vehicle_id 的取值（车辆简表的 T-Box deviceId）。 */
  readonly deviceId?: string | null
}

export interface ParsedEnvelope<T> {
  readonly code: number
  readonly msg: string
  readonly data: T
}

export class CfMotoApiClient {
  private readonly http: HttpClient
  private readonly config: CfMotoConfig
  private readonly sessionProvider: () => AuthSession | null
  private readonly logger: Logger
  private readonly onUnauthorized: (() => void) | null
  private lastUnauthorizedAt = 0

  constructor(deps: CfMotoApiClientDeps) {
    this.http = deps.http
    this.config = deps.config
    this.sessionProvider = deps.sessionProvider
    this.logger = deps.logger ?? silentLogger
    this.onUnauthorized = deps.onUnauthorized ?? null
  }

  getConfig(): CfMotoConfig {
    return this.config
  }

  getSession(): AuthSession | null {
    return this.sessionProvider()
  }

  /**
   * Cookie 格式来自 api.yaml：`ticket=<ticket>;vehicle_id=<deviceId>;user_id=<userId>`。
   * 缺少 deviceId 时省略 `vehicle_id` 段（多车用户必须先选车才能调骑行接口）。
   */
  buildCookie(options: { requiresAuth: boolean; deviceId?: string | null }): string | null {
    const session = this.sessionProvider()
    if (!session) {
      if (options.requiresAuth) {
        throw new AppError('登录状态已失效，请重新登录', { code: 'UNAUTHORIZED', hint: '需要重新登录' })
      }
      return null
    }
    const parts = [`ticket=${session.ticket}`]
    if (options.deviceId) parts.push(`vehicle_id=${options.deviceId}`)
    if (session.userId) parts.push(`user_id=${session.userId}`)
    return parts.join(';')
  }

  async call<T>(call: CfMotoCall): Promise<T> {
    const requiresAuth = call.requiresAuth ?? true
    if (!hasAppSecret(this.config)) {
      throw new AppError(MISSING_APP_SECRET_MESSAGE, {
        code: 'CONFIG',
        hint: MISSING_APP_SECRET_HINT,
      })
    }

    const cookie = this.buildCookie({ requiresAuth, deviceId: call.deviceId ?? null })

    /**
     * 签名规则（依据 apifox-prerequest.js 与真实请求验证）：
     * - GET/DELETE：payload 是**按 URL 中出现顺序**的查询串原文，并且服务端对收到的查询串做哈希，
     *   所以这里自己拼查询串、签它、再用同一个串发出去，不能交给底层再序列化一次。
     * - POST/PUT：payload 是原样发送的 JSON 文本，因此正文也用同一个字符串发送。
     */
    const signedQuery = call.method === 'GET' || call.method === 'DELETE' ? buildQueryString(call.query) : ''
    const bodyText = call.method === 'GET' || call.method === 'DELETE' ? '' : call.body === undefined ? '' : JSON.stringify(call.body)
    const payload = signedQuery === '' ? bodyText : signedQuery
    const signed = buildSignedHeaders({ config: this.config, payload, cookie })

    const request: HttpRequest = {
      url: `${this.config.baseUrl}${call.path}${signedQuery === '' ? '' : `?${signedQuery}`}`,
      method: call.method,
      headers: bodyText === '' ? signed.headers : { ...signed.headers, 'Content-Type': 'application/json' },
      timeoutMs: this.config.timeoutMs,
      ...(bodyText === '' ? {} : { body: bodyText }),
    }

    try {
      const response = await this.sendWithRetry(request, call.method === 'GET')
      const parsed = this.parseEnvelope<T>(response.data, call)
      if (parsed.code !== 0) {
        throw this.businessError(parsed.code, parsed.msg)
      }
      return parsed.data
    } catch (error) {
      const appError = toAppError(error)
      if (appError.code === 'UNAUTHORIZED') this.notifyUnauthorized()
      throw appError
    }
  }

  /**
   * ticket 失效时通知装配层一次。
   *
   * 同一个页面可能并发多个请求，全部 401 时不应该跳转多次，因此做 3 秒去抖。
   */
  private notifyUnauthorized(): void {
    if (!this.onUnauthorized) return
    const now = Date.now()
    if (now - this.lastUnauthorizedAt < 3000) return
    this.lastUnauthorizedAt = now
    this.logger.warn('登录凭证失效，触发重新登录')
    this.onUnauthorized()
  }

  private async sendWithRetry(request: HttpRequest, retriable: boolean) {
    const attempts = retriable ? this.config.maxRetries + 1 : 1
    let lastError: AppError | null = null
    for (let attempt = 0; attempt < attempts; attempt += 1) {
      try {
        const response = await this.http.request(request)
        if (response.statusCode === 401 || response.statusCode === 403) {
          throw new AppError('登录凭证无效或已过期', {
            code: 'UNAUTHORIZED',
            hint: '请重新登录',
            details: { statusCode: response.statusCode },
          })
        }
        if (response.statusCode < 200 || response.statusCode >= 300) {
          throw new AppError(`接口返回 HTTP ${response.statusCode}`, {
            code: 'HTTP',
            retriable: response.statusCode >= 500,
            details: { statusCode: response.statusCode },
          })
        }
        return response
      } catch (error) {
        const appError = toAppError(error)
        lastError = appError
        const canRetry = retriable && appError.retriable && attempt < attempts - 1
        if (!canRetry) break
        this.logger.debug('请求失败，准备重试', { path: request.url, code: appError.code })
        await delay(this.config.retryDelayMs * (attempt + 1))
      }
    }
    throw lastError ?? new AppError('请求失败', { code: 'UNKNOWN' })
  }

  private parseEnvelope<T>(data: unknown, call: CfMotoCall): ParsedEnvelope<T> {
    let payload = data
    if (typeof payload === 'string') {
      try {
        payload = JSON.parse(payload) as unknown
      } catch (error) {
        throw new AppError('响应不是合法的 JSON', {
          code: 'PARSE',
          details: { path: call.path },
          cause: error,
        })
      }
    }
    if (payload === null || typeof payload !== 'object') {
      throw new AppError('响应结构与 BaseResponse 不符', {
        code: 'PARSE',
        details: { path: call.path, type: typeof payload },
      })
    }
    const envelope = payload as CfMotoEnvelope<T>
    if (typeof envelope.code !== 'number') {
      throw new AppError('响应缺少 code 字段，无法判断业务结果', {
        code: 'PARSE',
        details: { path: call.path, keys: Object.keys(payload as Record<string, unknown>) },
      })
    }
    return {
      code: envelope.code,
      msg: typeof envelope.msg === 'string' ? envelope.msg : '',
      data: envelope.data as T,
    }
  }

  /**
   * 业务错误码到错误类型的映射。
   *
   * api.yaml 只说明"0 成功；非 0 为业务错误"，没有给出完整错误码表，
   * 因此这里只处理可以确证的两种信号：HTTP 风格的 401/403，以及 msg 里明确提到 ticket 的情况。
   * 其余一律作为 BUSINESS 错误并保留原始 code/msg，不做猜测（见 docs/api-notes.md）。
   */
  private businessError(code: number, msg: string): AppError {
    const authLike = code === 401 || code === 403 || /ticket|登录|未登录|失效/i.test(msg)
    return new AppError(msg === '' ? `接口返回业务错误 ${code}` : msg, {
      code: authLike ? 'UNAUTHORIZED' : 'BUSINESS',
      retriable: false,
      details: { businessCode: code, msg },
    })
  }
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, ms)
  })
}

/**
 * 按对象中键的书写顺序拼查询串（不排序、不改写顺序），并做百分号编码。
 * 与签名 payload 用的是同一个字符串，保证"签什么就发什么"。
 */
export function buildQueryString(query: Readonly<Record<string, QueryValue>> | undefined): string {
  if (!query) return ''
  const parts: string[] = []
  for (const [key, value] of Object.entries(query)) {
    if (value === undefined || value === null) continue
    parts.push(`${encodeURIComponent(key)}=${encodeURIComponent(String(value))}`)
  }
  return parts.join('&')
}

export function createCfMotoApiClient(deps: CfMotoApiClientDeps): CfMotoApiClient {
  return new CfMotoApiClient({ ...deps, logger: deps.logger ?? createLogger({ scope: 'cfmoto' }) })
}
