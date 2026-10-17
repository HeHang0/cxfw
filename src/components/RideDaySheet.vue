<script setup lang="ts">
import { watch } from 'vue'
import CfIcon from './CfIcon.vue'
import StatePanel from './StatePanel.vue'
import type { DateKey } from '@/core/domain/identifiers'
import type { RideHistoryItem } from '@/core/domain/models'
import { useRideHistoryStore } from '@/stores/rideHistory'
import { formatKm, formatMonthDay } from '@/utils/format'

const props = defineProps<{
  visible: boolean
  date: DateKey | null
}>()

const emit = defineEmits<{
  close: []
  select: [trip: RideHistoryItem]
}>()

const ride = useRideHistoryStore()

watch(
  () => [props.visible, props.date] as const,
  ([visible, date]) => {
    if (visible && date) void ride.loadDay(date)
  },
  { immediate: true, flush: 'sync' },
)

function selectTrip(trip: RideHistoryItem): void {
  emit('select', trip)
}
</script>

<template>
  <view v-if="visible" class="sheet" @tap="emit('close')">
    <view class="sheet__card" @tap.stop>
      <view class="sheet__head">
        <view class="sheet__titles">
          <text class="sheet__title">{{ date ? formatMonthDay(date) : '行程列表' }}</text>
          <text class="sheet__sub">共 {{ ride.trips.length }} 段行程</text>
        </view>
        <view class="sheet__close" @tap="emit('close')">
          <CfIcon name="close-secondary" :size="28" />
        </view>
      </view>

      <StatePanel v-if="ride.loading" status="loading" message="正在读取当天行程" />
      <StatePanel
        v-else-if="ride.errorMessage"
        status="error"
        :message="ride.errorMessage"
        retry-text="重试"
        @retry="date && ride.loadDay(date)"
      />
      <view v-else-if="ride.trips.length === 0" class="sheet__empty">
        <text class="sheet__empty-text">当天没有单次行程记录</text>
      </view>
      <view v-else class="sheet__list">
        <view
          v-for="trip in ride.trips"
          :key="trip.id"
          class="trip"
          @tap="selectTrip(trip)"
        >
          <view class="trip__time">
            <text class="trip__start">{{ trip.startTime?.slice(11, 16) ?? '—' }}</text>
            <text class="trip__end">{{ trip.endTime?.slice(11, 16) ?? '—' }}</text>
          </view>
          <view class="trip__main">
            <text class="trip__distance">{{ formatKm(trip.distanceKm, 1) }}</text>
            <text class="trip__address">{{ trip.startAddress ?? '—' }}</text>
          </view>
          <CfIcon name="chevron-right-secondary" :size="28" />
        </view>
      </view>
    </view>
  </view>
</template>

<style>
.sheet {
  position: fixed;
  inset: 0;
  z-index: 120;
  background-color: rgba(65, 70, 83, 0.35);
  display: flex;
  align-items: flex-end;
}

.sheet__card {
  width: 100%;
  max-height: 70vh;
  background-color: var(--cf-bg-card);
  border-radius: 40rpx 40rpx 0 0;
  padding: 32rpx;
  padding-bottom: calc(32rpx + env(safe-area-inset-bottom));
  box-sizing: border-box;
  display: flex;
  flex-direction: column;
  gap: 24rpx;
}

.sheet__head {
  display: flex;
  flex-direction: row;
  align-items: center;
  justify-content: space-between;
}

.sheet__titles {
  display: flex;
  flex-direction: column;
  gap: 6rpx;
}

.sheet__title {
  font-size: 32rpx;
  font-weight: 700;
  color: var(--cf-text-1);
}

.sheet__sub {
  font-size: 22rpx;
  color: var(--cf-text-3);
}

.sheet__close {
  width: 44rpx;
  height: 44rpx;
  display: flex;
  align-items: center;
  justify-content: center;
}

.sheet__list {
  display: flex;
  flex-direction: column;
  gap: 16rpx;
  overflow-y: auto;
}

.trip {
  min-height: 100rpx;
  border-radius: 24rpx;
  background-color: var(--cf-bg-soft);
  padding: 20rpx 24rpx;
  box-sizing: border-box;
  display: flex;
  flex-direction: row;
  align-items: center;
  gap: 20rpx;
}

.trip__time,
.trip__main {
  display: flex;
  flex-direction: column;
  gap: 6rpx;
}

.trip__time {
  flex-shrink: 0;
}

.trip__main {
  flex: 1;
  min-width: 0;
}

.trip__start {
  font-size: 25rpx;
  font-weight: 600;
  color: var(--cf-text-1);
}

.trip__end {
  font-size: 21rpx;
  color: var(--cf-text-3);
}

.trip__distance {
  font-size: 26rpx;
  font-weight: 600;
  color: var(--cf-text-1);
}

.trip__address {
  font-size: 21rpx;
  color: var(--cf-text-2);
  overflow: hidden;
  white-space: nowrap;
  text-overflow: ellipsis;
}

.sheet__empty {
  padding: 40rpx 0;
  display: flex;
  justify-content: center;
}

.sheet__empty-text {
  font-size: 24rpx;
  color: var(--cf-text-3);
}
</style>
