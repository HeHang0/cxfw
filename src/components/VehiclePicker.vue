<script setup lang="ts">
import type { Vehicle } from '@/core/domain/models'

defineProps<{
  vehicles: Vehicle[]
  activeVehicleId: string | null
}>()

const emit = defineEmits<{ select: [vehicleId: string] }>()
</script>

<template>
  <scroll-view scroll-x class="picker">
    <view class="picker__row">
      <view
        v-for="vehicle in vehicles"
        :key="vehicle.vin"
        class="picker__item"
        :class="{ 'picker__item--active': vehicle.vehicleId === activeVehicleId }"
        @tap="emit('select', vehicle.vehicleId ?? '')"
      >
        <text class="picker__title">{{ vehicle.model ?? vehicle.vin }}</text>
        <text class="picker__subtitle">{{ vehicle.vin }}</text>
      </view>
    </view>
  </scroll-view>
</template>

<style>
.picker {
  white-space: nowrap;
  width: 100%;
}

.picker__row {
  display: flex;
  flex-direction: row;
}

.picker__item {
  padding: 16rpx 24rpx;
  margin-right: 16rpx;
  border-radius: var(--cf-radius-sm);
  background-color: var(--cf-bg-soft);
  display: flex;
  flex-direction: column;
}

.picker__item--active {
  background-color: var(--cf-blue-soft);
}

.picker__title {
  font-size: 26rpx;
  color: var(--cf-text-1);
}

.picker__subtitle {
  font-size: 20rpx;
  color: var(--cf-text-3);
}
</style>
