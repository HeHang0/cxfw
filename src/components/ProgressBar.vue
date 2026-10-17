<script setup lang="ts">
defineProps<{
  percent: number
  label?: string
}>()
</script>

<template>
  <view class="progress">
    <view class="progress__track">
      <view class="progress__fill" :style="{ width: `${Math.min(100, Math.max(0, percent))}%` }" />
    </view>
    <text v-if="label" class="progress__label">{{ label }}</text>
  </view>
</template>

<style>
.progress {
  display: flex;
  flex-direction: column;
}

.progress__track {
  height: 12rpx;
  border-radius: 999px;
  background-color: var(--cf-line);
  overflow: hidden;
}

.progress__fill {
  height: 100%;
  background-color: var(--cf-blue-deep);
}

.progress__label {
  font-size: 22rpx;
  color: var(--cf-text-2);
  margin-top: 8rpx;
}
</style>
