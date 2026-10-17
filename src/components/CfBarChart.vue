<script setup lang="ts">
import { computed } from 'vue'

/**
 * 柱状趋势图（设计稿节点 2:125 那一组）。
 *
 * 设计规格：柱宽 14px（28rpx）、圆角 7px（14rpx）、最高柱 78px（156rpx）、
 * 柱子间距均分、标签 10px 三级色，当前/最高的一根用品牌蓝并加粗标签。
 * `null` 表示该月数据未知 —— 画成最矮的浅灰柱，绝不当成 0。
 */

interface BarPoint {
  readonly label: string
  readonly value: number | null
  /** 点击柱子后显示的说明，例如「10 月 14 日 · 87.6 km」。 */
  readonly tooltip?: string
}

const props = withDefaults(
  defineProps<{
    points: BarPoint[]
    /** 高亮下标，默认高亮最后一个（设计稿里是当前月份）。 */
    activeIndex?: number
    /** 标签抽稀：每 N 根柱显示一个标签（设计稿按 4 天间隔标注），高亮柱始终显示。 */
    labelEvery?: number
    /** 当前选中的柱子；由页面维护，点击图表外时可以统一清除。 */
    selectedIndex?: number
  }>(),
  { activeIndex: -1, labelEvery: 1, selectedIndex: -1 },
)

const emit = defineEmits<{
  (event: 'select', index: number): void
}>()

const MAX_HEIGHT_RPX = 156
const MIN_HEIGHT_RPX = 10

const maxValue = computed(() => {
  let max = 0
  for (const point of props.points) {
    if (point.value !== null && point.value > max) max = point.value
  }
  return max
})

const active = computed(() => {
  if (props.selectedIndex >= 0) return props.selectedIndex
  if (props.activeIndex >= 0) return props.activeIndex
  return props.points.length - 1
})

const selectedPoint = computed(() => {
  if (props.selectedIndex < 0) return null
  return props.points[props.selectedIndex] ?? null
})

const tooltipLeft = computed(() => {
  if (props.selectedIndex < 0 || props.points.length === 0) return '50%'
  const raw = ((props.selectedIndex + 0.5) / props.points.length) * 100
  return `${Math.min(92, Math.max(8, raw))}%`
})

function heightOf(value: number | null): string {
  if (value === null) return `${MIN_HEIGHT_RPX}rpx`
  if (maxValue.value <= 0) return `${MIN_HEIGHT_RPX}rpx`
  const ratio = Math.max(value / maxValue.value, 0)
  return `${Math.round(Math.max(ratio * MAX_HEIGHT_RPX, MIN_HEIGHT_RPX))}rpx`
}

function showLabel(index: number): boolean {
  if (props.labelEvery <= 1) return true
  return index % props.labelEvery === 0 || index === active.value
}

function selectBar(index: number): void {
  emit('select', index)
}
</script>

<template>
  <view class="bars-wrap">
    <view
      v-if="selectedPoint"
      class="bars__tip"
      :style="{ left: tooltipLeft }"
    >
      <text class="bars__tip-text">{{ selectedPoint.tooltip ?? `${selectedPoint.label} · ${selectedPoint.value ?? '暂无数据'}` }}</text>
    </view>
    <view class="bars">
      <view
        v-for="(point, index) in points"
        :key="`${point.label}-${index}`"
        class="bars__item"
        @tap.stop="selectBar(index)"
      >
        <view class="bars__track">
          <view
            class="bars__bar"
            :class="{
              'bars__bar--active': index === active && point.value !== null,
              'bars__bar--selected': index === selectedIndex && point.value !== null,
              'bars__bar--unknown': point.value === null,
            }"
            :style="{ height: heightOf(point.value) }"
          />
        </view>
        <text class="bars__label" :class="{ 'bars__label--active': index === active }">
          {{ showLabel(index) ? point.label : '' }}
        </text>
      </view>
    </view>
  </view>
</template>

<style>
.bars-wrap {
  position: relative;
  width: 100%;
  padding-top: 72rpx;
  box-sizing: border-box;
}

.bars__tip {
  position: absolute;
  top: 0;
  transform: translateX(-50%);
  max-width: 92%;
  padding: 10rpx 18rpx;
  border-radius: 14rpx;
  background-color: var(--cf-blue-deep);
  box-shadow: 0 8rpx 20rpx rgba(25, 54, 92, 0.18);
  white-space: nowrap;
}

.bars__tip::after {
  content: '';
  position: absolute;
  left: 50%;
  bottom: -8rpx;
  width: 16rpx;
  height: 16rpx;
  background-color: var(--cf-blue-deep);
  transform: translateX(-50%) rotate(45deg);
}

.bars__tip-text {
  position: relative;
  z-index: 1;
  font-size: 22rpx;
  line-height: 1.2;
  color: #ffffff;
}

.bars {
  display: flex;
  flex-direction: row;
  align-items: flex-end;
  width: 100%;
}

.bars__item {
  flex: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
  padding-top: 10rpx;
}

.bars__track {
  height: 156rpx;
  display: flex;
  flex-direction: row;
  align-items: flex-end;
  justify-content: center;
}

.bars__bar {
  width: 28rpx;
  border-radius: 14rpx;
  background-color: var(--cf-blue-soft);
}

.bars__bar--active {
  background-color: var(--cf-blue);
}

.bars__bar--selected {
  background-color: var(--cf-blue-deep);
}

.bars__bar--unknown {
  background-color: var(--cf-line);
}

.bars__label {
  font-size: 20rpx;
  line-height: 1.2;
  color: var(--cf-text-3);
  margin-top: 12rpx;
  min-height: 24rpx;
}

.bars__label--active {
  color: var(--cf-blue-deep);
  font-weight: 600;
}
</style>
