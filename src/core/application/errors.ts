/** 统一错误模型。页面只依赖 AppError，不关心底层是网络异常还是签名缺失。 */

export type AppErrorCode =
  /** 网络失败（无法连接、DNS、小程序域名白名单等）。 */
  | 'NETWORK'
  | 'TIMEOUT'
  /** HTTP 状态码非 2xx。 */
  | 'HTTP'
  /** 业务返回 code != 0。 */
  | 'BUSINESS'
  /** 响应结构与预期不符。 */
  | 'PARSE'
  /** ticket 失效或缺失。 */
  | 'UNAUTHORIZED'
  /** 配置缺失（如 APP_SECRET 未提供）。 */
  | 'CONFIG'
  /** 调用方参数不合法。 */
  | 'INVALID_INPUT'
  /** 车辆标识不完整，无法调用官方接口。 */
  | 'VEHICLE_INCOMPLETE'
  /** 数据源未提供该能力。 */
  | 'UNSUPPORTED'
  /** 尚未实现（例如自建 Server 数据源）。 */
  | 'NOT_IMPLEMENTED'
  | 'UNKNOWN'

export interface AppErrorOptions {
  readonly code: AppErrorCode
  readonly retriable?: boolean
  readonly details?: Readonly<Record<string, unknown>>
  readonly cause?: unknown
  /** 面向用户的中文说明，可安全展示。 */
  readonly hint?: string
}

export class AppError extends Error {
  readonly code: AppErrorCode
  readonly retriable: boolean
  readonly details: Readonly<Record<string, unknown>>
  readonly hint: string | null

  constructor(message: string, options: AppErrorOptions) {
    super(message)
    this.name = 'AppError'
    this.code = options.code
    this.retriable = options.retriable ?? false
    this.details = options.details ?? {}
    this.hint = options.hint ?? null
    if (options.cause !== undefined) {
      ;(this as { cause?: unknown }).cause = options.cause
    }
  }
}

export function isAppError(error: unknown): error is AppError {
  return error instanceof AppError
}

export function toAppError(error: unknown): AppError {
  if (isAppError(error)) return error
  if (error instanceof Error) {
    return new AppError(error.message, { code: 'UNKNOWN', cause: error })
  }
  return new AppError(String(error), { code: 'UNKNOWN', cause: error })
}

export function errorCode(error: unknown): string {
  return isAppError(error) ? error.code : 'UNKNOWN'
}

export function userFacingMessage(error: unknown): string {
  const appError = toAppError(error)
  if (appError.hint) return `${appError.message}（${appError.hint}）`
  return appError.message
}
