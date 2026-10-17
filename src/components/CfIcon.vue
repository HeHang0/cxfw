<script setup lang="ts">
import { computed } from 'vue'
import { iconUri, type IconName } from '@/utils/icons'

/**
 * 线性图标。尺寸用设计稿的 px 值 × 2 得到 rpx（例如设计稿 18px → 36rpx）。
 */

const props = withDefaults(
  defineProps<{
    name: IconName
    size?: number
  }>(),
  { size: 36 },
)

const style = computed(() => ({
  width: `${props.size}rpx`,
  height: `${props.size}rpx`,
}))
</script>

<template>
  <image class="cf-icon" :src="iconUri(name)" :style="style" mode="aspectFit" />
</template>

<style>
.cf-icon {
  display: block;
  flex-shrink: 0;
}
</style>
