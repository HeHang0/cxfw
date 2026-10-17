/**
 * 轻量运行时探针：把关键节点写入本地存储。
 *
 * 小程序里 console 经自动化桥只能拿到 [object Object]，而 uni.setStorageSync 可读，
 * 因此用存储作为错误与流程的观测通道（键名 `__trace`，最多保留 40 行）。
 * 排查线上问题时可在开发者工具 Storage 面板直接查看。
 */

interface StorageLike {
  getStorageSync?(key: string): unknown
  setStorageSync?(key: string, value: unknown): void
}

function storage(): StorageLike | null {
  if (typeof uni !== 'undefined' && uni) return uni as StorageLike
  const candidate = (globalThis as { uni?: StorageLike }).uni
  return candidate ?? null
}

export function writeTrace(message: string): void {
  try {
    const api = storage()
    if (!api?.getStorageSync || !api.setStorageSync) return
    const raw = api.getStorageSync('__trace')
    const lines = typeof raw === 'string' && raw !== '' ? raw.split('\n') : []
    lines.push(`${new Date().toISOString().slice(11, 19)} ${message}`)
    api.setStorageSync('__trace', lines.slice(-40).join('\n'))
  } catch {
    // ignore
  }
}
