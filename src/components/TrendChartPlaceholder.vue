<script setup lang="ts">
/**
 * 趋势图占位组件。
 *
 * 当前阶段不实现图表库，只用柱状高度表达相对大小；
 * `null` 表示未知（画成虚线占位），`0` 表示确实没有数据（画成最矮的柱子）。
 * 后续接入真实图表组件时替换内部实现即可，对外接口保持不变。
 */

import { computed } from 'vue'
import type { TrendPointItem } from './types'

const props = withDefaults(
  defineProps<{
    points: TrendPointItem[]
    unit?: string
  }>(),
  { unit: '' },
)

const maxValue = computed(() => {
  let max = 0
  for (const point of props.points) {
    if (point.value !== null && point.value > max) max = point.value
  }
  return max
})

function heightOf(value: number | null): string {
  if (value === null) return '4rpx'
  if (maxValue.value <= 0) return '4rpx'
  const percent = Math.max(4, Math.round((value / maxValue.value) * 100))
  return `${percent}%`
}

function isUnknown(value: number | null): boolean {
  return value === null
}
</script>

<template>
  <view class="trend">
    <view class="trend__bars">
      <view v-for="point in points" :key="point.label" class="trend__item">
        <view class="trend__bar-wrap">
          <view
            class="trend__bar"
            :class="{ 'trend__bar--unknown': isUnknown(point.value) }"
            :style="{ height: heightOf(point.value) }"
          />
        </view>
        <text class="trend__label">{{ point.label }}</text>
      </view>
    </view>
    <text v-if="unit" class="trend__unit">单位：{{ unit }}</text>
  </view>
</template>

<style>
.trend {
  display: flex;
  flex-direction: column;
}

.trend__bars {
  display: flex;
  align-items: flex-end;
  height: 220rpx;
}

.trend__item {
  flex: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
}

.trend__bar-wrap {
  width: 100%;
  height: 180rpx;
  display: flex;
  align-items: flex-end;
  justify-content: center;
}

.trend__bar {
  width: 60%;
  background-color: var(--cf-blue);
  border-radius: 4px 4px 0 0;
}

.trend__bar--unknown {
  background-color: var(--cf-line);
}

.trend__label {
  font-size: 20rpx;
  color: var(--cf-text-3);
  margin-top: 6rpx;
}

.trend__unit {
  font-size: 22rpx;
  color: var(--cf-text-2);
  margin-top: 8rpx;
}
</style>
