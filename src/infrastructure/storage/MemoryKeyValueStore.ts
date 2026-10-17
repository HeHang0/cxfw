import type { KeyValueStore } from '@/core/contracts/KeyValueStore'

/**
 * 内存键值存储。
 * 用于单元测试与不依赖 uni 的运行环境，语义与 `UniKeyValueStore` 保持一致（深拷贝）。
 */

export class MemoryKeyValueStore implements KeyValueStore {
  private readonly map = new Map<string, string>()

  get<T>(key: string): T | null {
    const raw = this.map.get(key)
    if (raw === undefined) return null
    try {
      return JSON.parse(raw) as T
    } catch {
      return null
    }
  }

  set<T>(key: string, value: T): void {
    this.map.set(key, JSON.stringify(value))
  }

  remove(key: string): void {
    this.map.delete(key)
  }

  keys(prefix?: string): string[] {
    const all = [...this.map.keys()]
    return prefix === undefined ? all : all.filter((key) => key.startsWith(prefix))
  }
}
