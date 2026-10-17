import type { HttpClient, HttpRequest, HttpResponse } from '@/core/contracts/HttpClient'
import { AppError } from '@/core/application/errors'
import { createLogger, silentLogger, type Logger } from '@/core/shared/logger'

/**
 * 基于 uni.request 的 HttpClient 实现。
 *
 * 通过构造参数注入 uni 对象而不是直接使用全局变量，这样单元测试可以用假实现替换，
 * Web 端也可以换成 fetch 实现而无需改动上层。
 */

export interface UniRequestSuccess {
  readonly statusCode: number
  readonly data: unknown
  readonly header?: unknown
  readonly cookies?: readonly string[]
}

export interface UniRequestFailure {
  readonly errMsg?: string
}

export interface UniRequestOptions {
  readonly url: string
  readonly method?: string
  readonly data?: unknown
  readonly header?: Record<string, string>
  readonly timeout?: number
  readonly dataType?: string
  readonly success?: (result: UniRequestSuccess) => void
  readonly fail?: (error: UniRequestFailure) => void
}

export interface UniLike {
  request(options: UniRequestOptions): unknown
}

export interface UniHttpClientOptions {
  readonly uni: UniLike
  readonly logger?: Logger
  /** 小程序需要在后台配置 request 合法域名，失败时用于给出更明确的提示。 */
  readonly domainWhitelistHint?: string
}

export class UniHttpClient implements HttpClient {
  private readonly uni: UniLike
  private readonly logger: Logger
  private readonly domainWhitelistHint: string

  constructor(options: UniHttpClientOptions) {
    this.uni = options.uni
    this.logger = options.logger ?? silentLogger
    this.domainWhitelistHint =
      options.domainWhitelistHint ?? '若在微信小程序中运行，请把接口域名加入 request 合法域名白名单'
  }

  request(request: HttpRequest): Promise<HttpResponse> {
    const isGet = request.method === 'GET'
    const data = isGet ? request.query : request.body

    return new Promise<HttpResponse>((resolve, reject) => {
      this.uni.request({
        url: request.url,
        method: request.method,
        ...(data === undefined ? {} : { data }),
        ...(request.headers === undefined ? {} : { header: { ...request.headers } }),
        ...(request.timeoutMs === undefined ? {} : { timeout: request.timeoutMs }),
        dataType: 'json',
        success: (result) => {
          resolve({
            statusCode: result.statusCode,
            headers: normalizeHeaders(result.header),
            data: result.data,
          })
        },
        fail: (error) => {
          reject(this.toNetworkError(request, error.errMsg ?? ''))
        },
      })
    })
  }

  private toNetworkError(request: HttpRequest, errMsg: string): AppError {
    const lower = errMsg.toLowerCase()
    const isTimeout = lower.includes('timeout') || lower.includes('abort')
    const needsWhitelist = lower.includes('url not in domain list') || lower.includes('domain')
    this.logger.debug('请求失败', { path: request.url, errMsg })
    return new AppError(isTimeout ? '请求超时' : '网络请求失败', {
      code: isTimeout ? 'TIMEOUT' : 'NETWORK',
      retriable: true,
      details: { path: request.url, errMsg },
      hint: needsWhitelist ? this.domainWhitelistHint : undefined,
    })
  }
}

function normalizeHeaders(header: unknown): Record<string, string> {
  if (header === null || typeof header !== 'object') return {}
  const result: Record<string, string> = {}
  for (const [key, value] of Object.entries(header as Record<string, unknown>)) {
    result[key.toLowerCase()] = String(value)
  }
  return result
}

export function createUniHttpClient(options: UniHttpClientOptions): UniHttpClient {
  return new UniHttpClient({ ...options, logger: options.logger ?? createLogger({ scope: 'http' }) })
}
