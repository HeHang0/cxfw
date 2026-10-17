import { defineConfig } from 'vite'
import uni from '@dcloudio/vite-plugin-uni'

const configuredBase = process.env.VITE_PUBLIC_BASE?.trim()
const base = configuredBase && configuredBase !== '/'
  ? `${configuredBase.replace(/\/+$/, '')}/`
  : '/'

export default defineConfig({
  base,
  plugins: [uni()],
})

