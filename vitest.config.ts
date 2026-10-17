import { defineConfig } from 'vitest/config'
import { fileURLToPath } from 'node:url'

// 单元测试只覆盖与框架无关的 src/core、infrastructure、services 代码，
// 因此这里不加载 uni 插件，测试可以在纯 Node 环境运行。
export default defineConfig({
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
    },
  },
  test: {
    include: ['tests/**/*.spec.ts'],
    environment: 'node',
  },
})

