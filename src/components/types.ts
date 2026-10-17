/** 组件的公共数据类型。放在独立文件，避免 `<script setup>` 内出现 ES 导出。 */

import type { IconName } from '@/utils/icons'

export interface StatItem {
  readonly label: string
  readonly value: string
  readonly hint?: string
  readonly tone?: 'default' | 'primary' | 'warning'
}

export interface TrendPointItem {
  readonly label: string
  readonly value: number | null
}

/** 底部导航项（需要新图标时在 utils/icons.ts 里补上对应变体）。 */
export interface TabItem {
  readonly key: string
  readonly label: string
  readonly path: string
  /** 选中态图标（深色） */
  readonly activeIcon: IconName
  /** 未选中态图标（浅色） */
  readonly icon: IconName
}
