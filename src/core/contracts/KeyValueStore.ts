/** 键值存储抽象。uni-app 端由 `uni.setStorageSync` 实现，测试用内存实现。 */

export interface KeyValueStore {
  get<T>(key: string): T | null
  set<T>(key: string, value: T): void
  remove(key: string): void
  /** 返回所有键（可按前缀过滤）。 */
  keys(prefix?: string): string[]
}
