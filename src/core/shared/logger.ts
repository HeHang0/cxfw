/**
 * 日志工具。
 *
 * 硬性要求：日志中不得出现密码、验证码、ticket、cookie 等认证凭证。
 * 因此这里在写入 sink 之前统一做一次脱敏，任何调用点都不需要自己记得处理。
 */

export type LogLevel = 'debug' | 'info' | 'warn' | 'error'

export interface LogRecord {
  readonly level: LogLevel
  readonly scope: string
  readonly message: string
  readonly context?: Readonly<Record<string, unknown>>
  readonly time: string
}

export type LogSink = (record: LogRecord) => void

export interface Logger {
  debug(message: string, context?: Record<string, unknown>): void
  info(message: string, context?: Record<string, unknown>): void
  warn(message: string, context?: Record<string, unknown>): void
  error(message: string, context?: Record<string, unknown>): void
  child(scope: string): Logger
}

/** 需要整体隐藏的字段名（小写比较）。 */
const SECRET_KEYS = new Set([
  'ticket',
  'password',
  'passwd',
  'verifycode',
  'verify_code',
  'captcha',
  'token',
  'cookie',
  'authorization',
  'appsecret',
  'app_secret',
  'sign',
  'signature',
  'cfmoto-x-sign',
  'cfmoto-x-param',
])

/** 需要部分打码的字段名（手机号等）。 */
const MASK_KEYS = new Set(['phone', 'mobile', 'phonenumber', 'tel'])

export const REDACTED = '[redacted]'

export function maskPhone(value: unknown): string {
  const text = String(value)
  if (text.length < 7) return '***'
  return `${text.slice(0, 3)}****${text.slice(-4)}`
}

export function redactValue(key: string, value: unknown): unknown {
  const normalized = key.toLowerCase()
  if (SECRET_KEYS.has(normalized)) return REDACTED
  if (MASK_KEYS.has(normalized)) return maskPhone(value)
  if (Array.isArray(value)) return value.map((item) => redactUnknown(item))
  if (value !== null && typeof value === 'object') return redactContext(value as Record<string, unknown>)
  return value
}

function redactUnknown(value: unknown): unknown {
  if (Array.isArray(value)) return value.map((item) => redactUnknown(item))
  if (value !== null && typeof value === 'object') return redactContext(value as Record<string, unknown>)
  return value
}

export function redactContext(context: Readonly<Record<string, unknown>>): Record<string, unknown> {
  const result: Record<string, unknown> = {}
  for (const [key, value] of Object.entries(context)) {
    result[key] = redactValue(key, value)
  }
  return result
}

export interface LoggerOptions {
  readonly scope?: string
  readonly level?: LogLevel
  readonly sink?: LogSink
  readonly now?: () => Date
}

const LEVEL_ORDER: Record<LogLevel, number> = { debug: 0, info: 1, warn: 2, error: 3 }

/** 默认 sink：只输出脱敏后的信息。 */
const consoleSink: LogSink = (record) => {
  const payload = record.context ? [record.message, record.context] : [record.message]
  if (record.level === 'error') console.error(`[${record.scope}]`, ...payload)
  else if (record.level === 'warn') console.warn(`[${record.scope}]`, ...payload)
  else console.log(`[${record.scope}]`, ...payload)
}

export function createLogger(options: LoggerOptions = {}): Logger {
  const scope = options.scope ?? 'app'
  const minLevel = LEVEL_ORDER[options.level ?? 'info']
  const sink = options.sink ?? consoleSink
  const now = options.now ?? (() => new Date())

  const emit = (level: LogLevel, message: string, context?: Record<string, unknown>): void => {
    if (LEVEL_ORDER[level] < minLevel) return
    const safeContext = context ? redactContext(context) : undefined
    sink({
      level,
      scope,
      message,
      time: now().toISOString(),
      ...(safeContext ? { context: safeContext } : {}),
    })
  }

  return {
    debug: (message, context) => emit('debug', message, context),
    info: (message, context) => emit('info', message, context),
    warn: (message, context) => emit('warn', message, context),
    error: (message, context) => emit('error', message, context),
    child: (childScope) => createLogger({ ...options, scope: `${scope}:${childScope}` }),
  }
}

export const silentLogger: Logger = createLogger({ level: 'error', sink: () => {} })
