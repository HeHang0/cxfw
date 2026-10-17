/** 时间来源抽象。统计模块不接受隐式 `new Date()`，便于测试"当前未结束月份"等场景。 */

export interface Clock {
  now(): Date
}

export const systemClock: Clock = {
  now: () => new Date(),
}

export function fixedClock(iso: string): Clock {
  const fixed = new Date(iso)
  return { now: () => new Date(fixed.getTime()) }
}
