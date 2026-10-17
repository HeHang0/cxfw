<script setup lang="ts">
/**
 * 三格指标行（设计稿节点 2:103）。
 * 数值 17px（34rpx）+ 标签 11px（22rpx），三格等宽，中间用 1px 竖线分隔。
 */

defineProps<{
  items: Array<{ value: string; label: string }>
}>()
</script>

<template>
  <view class="triple">
    <template v-for="(item, index) in items" :key="item.label">
      <view v-if="index > 0" class="triple__divider" />
      <view class="triple__item">
        <text class="triple__value">{{ item.value }}</text>
        <text class="triple__label">{{ item.label }}</text>
      </view>
    </template>
  </view>
</template>

<style>
.triple {
  display: flex;
  flex-direction: row;
  align-items: center;
  width: 100%;
}

.triple__item {
  flex: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 10rpx;
}

.triple__divider {
  width: 2rpx;
  height: 52rpx;
  background-color: var(--cf-line);
}

.triple__value {
  font-size: 32rpx;
  line-height: 1.2;
  color: var(--cf-text-1);
  white-space: nowrap;
}

.triple__label {
  font-size: 22rpx;
  line-height: 1.3;
  color: var(--cf-text-2);
}
</style>
