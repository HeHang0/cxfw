import { reactive, type UnwrapNestedRefs } from 'vue'

/**
 * 极简 store 工厂（替代 Pinia）。
 *
 * 为什么不用 Pinia：本项目的 mp-weixin 产物里，Pinia 的 setup store 在运行时拿不到
 * 定义里的 action（`store.load` / `store.restore` 都是 undefined），导致页面 onShow 中断、
 * 数据永远加载不出来；H5 正常。这里用 Vue 自带的 `reactive` 建单例：
 * - 对外的调用方式（`useXStore()` 返回 store 对象）与 Pinia 一致，页面无需改动；
 * - `reactive` 会自动解包 ref，函数属性原样保留；
 * - 少一个依赖，也更适合小程序这种单实例环境。
 */
export function defineLiteStore<T extends object>(factory: () => T): () => UnwrapNestedRefs<T> {
  let instance: UnwrapNestedRefs<T> | null = null
  return () => {
    if (instance === null) {
      instance = reactive(factory()) as UnwrapNestedRefs<T>
    }
    return instance
  }
}
