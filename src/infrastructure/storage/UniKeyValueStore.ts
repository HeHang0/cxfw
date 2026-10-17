import type { KeyValueStore } from '@/core/contracts/KeyValueStore'
import { createLogger, silentLogger, type Logger } from '@/core/shared/logger'

/**
 * uni-app 本地存储实现。
 *
 * 通过构造参数注入 uni 对象，避免在模块加载时硬依赖全局变量（便于测试与 Web 复用）。
 */

export interface UniStorageInfo {
  readonly keys: readonly string[]
}

export interface UniStorageLike {
  getStorageSync(key: string): unknown
  setStorageSync(key: string, value: unknown): void
  removeStorageSync(key: string): void
  getStorageInfoSync?(): UniStorageInfo
}

export interface UniKeyValueStoreOptions {
  readonly uni: UniStorageLike
  readonly logger?: Logger
}

export class UniKeyValueStore implements KeyValueStore {
  private readonly uni: UniStorageLike
  private readonly logger: Logger

  constructor(options: UniKeyValueStoreOptions) {
    this.uni = options.uni
    this.logger = options.logger ?? silentLogger
  }

  get<T>(key: string): T | null {
    try {
      const value = this.uni.getStorageSync(key)
      if (value === '' || value === null || value === undefined) return null
      if (typeof value === 'string') {
        // 部分平台会把对象序列化成字符串返回。
        try {
          return JSON.parse(value) as T
        } catch {
          return value as unknown as T
        }
      }
      return value as T
    } catch (error) {
      this.logger.warn('读取本地存储失败', { key, reason: describe(error) })
      return null
    }
  }

  set<T>(key: string, value: T): void {
    try {
      this.uni.setStorageSync(key, value)
    } catch (error) {
      this.logger.warn('写入本地存储失败', { key, reason: describe(error) })
    }
  }

  remove(key: string): void {
    try {
      this.uni.removeStorageSync(key)
    } catch (error) {
      this.logger.warn('删除本地存储失败', { key, reason: describe(error) })
    }
  }

  keys(prefix?: string): string[] {
    try {
      const info = this.uni.getStorageInfoSync?.()
      const all = info?.keys ?? []
      return prefix === undefined ? [...all] : all.filter((key) => key.startsWith(prefix))
    } catch (error) {
      this.logger.warn('枚举本地存储失败', { reason: describe(error) })
      return []
    }
  }
}

/** 给本地存储加独立命名空间，演示模式与真实账号互不读取。 */
export class ScopedKeyValueStore implements KeyValueStore {
  private readonly base: KeyValueStore
  private readonly prefix: string

  constructor(base: KeyValueStore, prefix: string) {
    this.base = base
    this.prefix = prefix
  }

  get<T>(key: string): T | null {
    return this.base.get<T>(`${this.prefix}${key}`)
  }

  set<T>(key: string, value: T): void {
    this.base.set(`${this.prefix}${key}`, value)
  }

  remove(key: string): void {
    this.base.remove(`${this.prefix}${key}`)
  }

  keys(prefix?: string): string[] {
    const scopedPrefix = `${this.prefix}${prefix ?? ''}`
    return this.base.keys(scopedPrefix).map((key) => key.slice(this.prefix.length))
  }
}

function describe(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}

export function createUniKeyValueStore(options: UniKeyValueStoreOptions): UniKeyValueStore {
  return new UniKeyValueStore({ ...options, logger: options.logger ?? createLogger({ scope: 'storage' }) })
}
