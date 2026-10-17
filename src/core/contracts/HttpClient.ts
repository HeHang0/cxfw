/** 统一网络请求抽象。实现层可以是 uni.request（小程序/App），也可以是 fetch（Web）。 */

export type HttpMethod = 'GET' | 'POST' | 'PUT' | 'DELETE'

export type QueryValue = string | number | boolean | null | undefined

export interface HttpRequest {
  readonly url: string
  readonly method: HttpMethod
  readonly query?: Readonly<Record<string, QueryValue>>
  readonly headers?: Readonly<Record<string, string>>
  readonly body?: unknown
  readonly timeoutMs?: number
}

export interface HttpResponse {
  readonly statusCode: number
  readonly headers: Readonly<Record<string, string>>
  readonly data: unknown
}

export interface HttpClient {
  request(request: HttpRequest): Promise<HttpResponse>
}
