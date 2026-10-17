<script setup lang="ts">
import StatCard from './StatCard.vue'
import type { StatItem } from './types'

defineProps<{
  items: StatItem[]
}>()
</script>

<template>
  <view class="stat-grid">
    <StatCard
      v-for="item in items"
      :key="item.label"
      :label="item.label"
      :value="item.value"
      :hint="item.hint ?? ''"
      :tone="item.tone ?? 'default'"
    />
  </view>
</template>

<style>
.stat-grid {
  display: flex;
  flex-wrap: wrap;
  margin: -8rpx;
}
</style>
