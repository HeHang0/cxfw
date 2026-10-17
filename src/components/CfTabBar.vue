<script setup lang="ts">
import { computed } from 'vue'
import CfIcon from './CfIcon.vue'
import type { TabItem } from './types'

/**
 * 底部导航（设计稿 2:186）。
 *
 * 设计稿的底部栏是白底 + 顶部一条分割线，选中项在**图标后面**垫一层薄荷蓝胶囊，
 * 原生 tabBar 做不出这个效果，所以这里用自定义组件实现，
 * 代价是页面切换用 reLaunch 而不是 switchTab（原生 tabBar 已从 pages.json 移除）。
 */

const props = defineProps<{
  current: string
  items: TabItem[]
}>()

const emit = defineEmits<{ select: [path: string] }>()

const list = computed(() => props.items)

function onTap(item: TabItem): void {
  if (item.key === props.current) return
  emit('select', item.path)
}
</script>

<template>
  <view class="tabbar">
    <view v-for="item in list" :key="item.key" class="tabbar__item" @tap="onTap(item)">
      <view class="tabbar__icon-box" :class="{ 'tabbar__icon-box--active': item.key === current }">
        <CfIcon :name="item.key === current ? item.activeIcon : item.icon" :size="36" />
      </view>
      <text class="tabbar__label" :class="{ 'tabbar__label--active': item.key === current }">
        {{ item.label }}
      </text>
    </view>
  </view>
</template>

<style>
.tabbar {
  position: fixed;
  left: 0;
  right: 0;
  bottom: 0;
  z-index: 20;
  height: 124rpx;
  padding-bottom: constant(safe-area-inset-bottom);
  padding-bottom: env(safe-area-inset-bottom);
  background-color: var(--cf-bg-card);
  border-top: 1rpx solid var(--cf-line);
  display: flex;
  flex-direction: row;
  align-items: center;
  justify-content: space-between;
}

.tabbar__item {
  flex: 1;
  height: 124rpx;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
}

.tabbar__icon-box {
  width: 88rpx;
  height: 48rpx;
  border-radius: var(--cf-radius-pill);
  display: flex;
  flex-direction: row;
  align-items: center;
  justify-content: center;
}

.tabbar__icon-box--active {
  background-color: var(--cf-blue-soft);
}

.tabbar__label {
  font-size: 20rpx;
  line-height: 1.2;
  margin-top: 8rpx;
  color: var(--cf-text-3);
}

.tabbar__label--active {
  color: var(--cf-text-1);
  font-weight: 600;
}
</style>
