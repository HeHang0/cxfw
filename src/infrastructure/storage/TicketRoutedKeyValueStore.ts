import type { KeyValueStore } from '@/core/contracts/KeyValueStore'

/**
 * 统一存储入口。
 *
 * 正常账号写入持久化存储；预览 ticket 使用进程内 MemoryKeyValueStore，
 * 因此 fixture 数据仍由业务层正常读取/缓存，但不会落到 localStorage。
 */
export class TicketRoutedKeyValueStore implements KeyValueStore {
  private readonly persistent: KeyValueStore
  private readonly preview: KeyValueStore
  private readonly isPreview: () => boolean

  constructor(options: {
    readonly persistent: KeyValueStore
    readonly preview: KeyValueStore
    readonly isPreview: () => boolean
  }) {
    this.persistent = options.persistent
    this.preview = options.preview
    this.isPreview = options.isPreview
  }

  private active(): KeyValueStore {
    return this.isPreview() ? this.preview : this.persistent
  }

  get<T>(key: string): T | null {
    return this.active().get<T>(key)
  }

  set<T>(key: string, value: T): void {
    this.active().set(key, value)
  }

  remove(key: string): void {
    this.active().remove(key)
  }

  keys(prefix?: string): string[] {
    return this.active().keys(prefix)
  }
}
