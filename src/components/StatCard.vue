<script setup lang="ts">
withDefaults(
  defineProps<{
    label: string
    value: string
    hint?: string
    tone?: 'default' | 'primary' | 'warning'
  }>(),
  { hint: '', tone: 'default' },
)
</script>

<template>
  <view class="stat-card" :class="`stat-card--${tone}`">
    <text class="stat-card__label">{{ label }}</text>
    <text class="stat-card__value">{{ value }}</text>
    <text v-if="hint" class="stat-card__hint">{{ hint }}</text>
  </view>
</template>

<style>
.stat-card {
  flex: 1;
  min-width: 200rpx;
  background-color: var(--cf-bg-soft);
  border-radius: var(--cf-radius-sm);
  padding: 20rpx;
  margin: 8rpx;
  display: flex;
  flex-direction: column;
}

.stat-card--primary {
  background-color: var(--cf-blue-soft);
}

.stat-card--warning {
  background-color: var(--cf-cream-soft);
}

.stat-card__label {
  font-size: 24rpx;
  color: var(--cf-text-2);
}

.stat-card__value {
  font-size: 36rpx;
  font-weight: 600;
  color: var(--cf-text-1);
  margin-top: 8rpx;
}

.stat-card__hint {
  font-size: 22rpx;
  color: var(--cf-text-3);
  margin-top: 6rpx;
}
</style>
