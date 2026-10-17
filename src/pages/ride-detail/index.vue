<script setup lang="ts">
import { computed, nextTick, watch } from 'vue'
import { onLoad, onReady } from '@dcloudio/uni-app'
import CfIcon from '@/components/CfIcon.vue'
import StatePanel from '@/components/StatePanel.vue'
import { useSafeArea } from '@/composables/useSafeArea'
import { useRideHistoryStore } from '@/stores/rideHistory'
import { wgs84ToGcj02 } from '@/core/domain/coordinates'
import { formatCount, formatNumber } from '@/utils/format'
import { navigateBack } from '@/utils/navigation'

const ride = useRideHistoryStore()
const safeArea = useSafeArea()
const MAP_ID = 'ride-track-map'
let mapReady = false

onLoad((options) => {
  const id = typeof options?.id === 'string' ? options.id : ''
  if (id) void ride.loadDetail(id)
})

const trackPoints = computed(() =>
  (ride.detail?.trajectory ?? []).map((point) => {
    const [latitude, longitude] = wgs84ToGcj02(point.latitude, point.longitude)
    return { latitude, longitude, speedKph: point.speedKph }
  }),
)

const mapPoints = computed(() => trackPoints.value.map(({ latitude, longitude }) => ({ latitude, longitude })))

const mapCenter = computed(() => {
  if (mapPoints.value.length === 0) return { latitude: 39.908692, longitude: 116.397477 }
  const latitudes = mapPoints.value.map((point) => point.latitude)
  const longitudes = mapPoints.value.map((point) => point.longitude)
  return {
    latitude: (Math.min(...latitudes) + Math.max(...latitudes)) / 2,
    longitude: (Math.min(...longitudes) + Math.max(...longitudes)) / 2,
  }
})

const speedRange = computed(() => {
  const speeds = trackPoints.value
    .map((point) => point.speedKph)
    .filter((speed): speed is number => speed !== null && Number.isFinite(speed))
  if (speeds.length === 0) return { min: 0, max: 1 }
  return { min: Math.min(...speeds), max: Math.max(...speeds) }
})

const polylines = computed(() => {
  const points = trackPoints.value
  if (points.length < 2) return []
  const { min, max } = speedRange.value
  return points.slice(0, -1).flatMap((point, index) => {
    const next = points[index + 1]
    if (!next) return []
    const speeds = [point.speedKph, next.speedKph].filter(
      (speed): speed is number => speed !== null && Number.isFinite(speed),
    )
    const speed = speeds.length === 0 ? min : speeds.reduce((sum, value) => sum + value, 0) / speeds.length
    return [
      {
        points: [
          { latitude: point.latitude, longitude: point.longitude },
          { latitude: next.latitude, longitude: next.longitude },
        ],
        color: speedColor(speed, min, max),
        width: 6,
        arrowLine: false,
      },
    ]
  })
})

const includePoints = computed(() => {
  if (mapPoints.value.length === 0) return []
  const latitudes = mapPoints.value.map((point) => point.latitude)
  const longitudes = mapPoints.value.map((point) => point.longitude)
  const minLat = Math.min(...latitudes)
  const maxLat = Math.max(...latitudes)
  const minLng = Math.min(...longitudes)
  const maxLng = Math.max(...longitudes)
  const latMargin = Math.max((maxLat - minLat) * 0.14, 0.0015)
  const lngMargin = Math.max((maxLng - minLng) * 0.14, 0.0015)
  return [
    { latitude: minLat - latMargin, longitude: minLng - lngMargin },
    { latitude: minLat - latMargin, longitude: maxLng + lngMargin },
    { latitude: maxLat + latMargin, longitude: minLng - lngMargin },
    { latitude: maxLat + latMargin, longitude: maxLng + lngMargin },
  ]
})

const mapMarkers = computed(() => {
  if (mapPoints.value.length === 0) return []
  const start = mapPoints.value[0]
  const end = mapPoints.value[mapPoints.value.length - 1]
  if (!start || !end) return []
  return [
    {
      id: 1,
      latitude: start.latitude,
      longitude: start.longitude,
      iconPath: '/static/map/start-pin.png',
      width: 30,
      height: 40,
      anchor: { x: 0.5, y: 1 },
      zIndex: 10,
    },
    {
      id: 2,
      latitude: end.latitude,
      longitude: end.longitude,
      iconPath: '/static/map/end-pin.png',
      width: 30,
      height: 40,
      anchor: { x: 0.5, y: 1 },
      zIndex: 9,
    },
  ]
})

const averageSpeed = computed(() => {
  const detail = ride.detail
  if (!detail || detail.distanceKm === null || detail.durationSeconds === null || detail.durationSeconds <= 0) {
    return null
  }
  return detail.distanceKm / (detail.durationSeconds / 3600)
})

const summaryMetrics = computed(() => {
  const detail = ride.detail
  if (!detail) return []
  const duration = durationParts(detail.durationSeconds)
  return [
    { label: '骑行用时', value: duration.value, unit: duration.unit },
    { label: '骑行里程', value: compactNumber(detail.distanceKm, 2), unit: 'km' },
    { label: '极速', value: compactNumber(detail.maxSpeedKph, 1), unit: 'km/h' },
    { label: '均速', value: compactNumber(averageSpeed.value, 1), unit: 'km/h' },
  ]
})

const eventCounts = computed(() => {
  const detail = ride.detail
  if (!detail) return []
  return [
    { label: '压弯次数', value: formatCount(detail.bendingTimes) },
    { label: '加速次数', value: formatCount(detail.accelerationTimes) },
    { label: '急刹次数', value: formatCount(detail.brakesTimes) },
  ]
})

const timeRangeText = computed(() => {
  const detail = ride.detail
  if (!detail) return ''
  return `${detail.startTime?.slice(5, 16) ?? '—'} → ${detail.endTime?.slice(5, 16) ?? '—'}`
})

const tripDateText = computed(() => ride.detail?.startTime?.slice(0, 10) ?? '')

function speedColor(speed: number, min: number, max: number): string {
  const ratio = max <= min ? 0 : Math.min(1, Math.max(0, (speed - min) / (max - min)))
  return hslToHex(140 - 140 * ratio, 0.85, 0.52)
}

function hslToHex(hue: number, saturation: number, lightness: number): string {
  const c = (1 - Math.abs(2 * lightness - 1)) * saturation
  const x = c * (1 - Math.abs(((hue / 60) % 2) - 1))
  const m = lightness - c / 2
  const [r, g, b] =
    hue < 60
      ? [c, x, 0]
      : hue < 120
        ? [x, c, 0]
        : hue < 180
          ? [0, c, x]
          : hue < 240
            ? [0, x, c]
            : hue < 300
              ? [x, 0, c]
              : [c, 0, x]
  const toHex = (value: number): string =>
    Math.round((value + m) * 255)
      .toString(16)
      .padStart(2, '0')
  return `#${toHex(r)}${toHex(g)}${toHex(b)}`
}

function fitTrack(): void {
  if (!mapReady || mapPoints.value.length === 0) return
  void nextTick(() => {
    try {
      uni.createMapContext(MAP_ID).includePoints({
        points: mapPoints.value,
        padding: [80, 70, 260, 70],
      })
    } catch {
      // include-points 属性仍会作为兜底
    }
  })
}

onReady(() => {
  mapReady = true
  fitTrack()
})

watch(mapPoints, fitTrack)

function durationParts(seconds: number | null): { value: string; unit: string } {
  if (seconds === null || !Number.isFinite(seconds) || seconds < 0) return { value: '—', unit: '' }
  if (seconds >= 3600) {
    return { value: compactText((seconds / 3600).toFixed(1)), unit: 'h' }
  }
  if (seconds >= 60) {
    return { value: String(Math.round(seconds / 60)), unit: 'min' }
  }
  return { value: String(Math.round(seconds)), unit: 's' }
}

function compactNumber(value: number | null, digits: number): string {
  const text = formatNumber(value, digits)
  return text === '—' ? text : compactText(text)
}

function compactText(value: string): string {
  return value.includes('.') ? value.replace(/\.?0+$/, '') : value
}
</script>

<template>
  <view class="detail">
    <map
      :id="MAP_ID"
      class="detail__map"
      :latitude="mapCenter.latitude"
      :longitude="mapCenter.longitude"
      :scale="12"
      :include-points="includePoints"
      :markers="mapMarkers"
      :polyline="polylines"
    />

    <view class="detail__back" :style="{ top: `${safeArea.statusBarHeight + 8}px` }" @tap="navigateBack">
      <CfIcon name="chevron-left-primary" :size="34" />
    </view>

    <view v-if="ride.detailLoading || (!ride.detail && !ride.errorMessage)" class="detail__state">
      <StatePanel status="loading" message="正在读取骑行轨迹" />
    </view>
    <view v-else-if="ride.errorMessage" class="detail__state">
      <StatePanel status="error" :message="ride.errorMessage" retry-text="返回" @retry="navigateBack" />
    </view>
    <view v-else-if="ride.detail && mapPoints.length === 0" class="detail__no-track">
      <text class="detail__no-track-text">本次行程暂无轨迹数据</text>
    </view>

    <view v-if="ride.detail" class="detail-card">
      <view class="detail-card__head">
        <text class="detail-card__time">{{ timeRangeText }}</text>
        <text class="detail-card__date">{{ tripDateText }}</text>
      </view>
      <view class="summary">
        <view v-for="item in summaryMetrics" :key="item.label" class="summary__item">
          <view class="summary__number-row">
            <text class="summary__value">{{ item.value }}</text>
            <text class="summary__unit">{{ item.unit }}</text>
          </view>
          <text class="summary__label">{{ item.label }}</text>
        </view>
      </view>
      <view class="events">
        <view v-for="item in eventCounts" :key="item.label" class="events__item">
          <text class="events__label">{{ item.label }}</text>
          <text class="events__value">{{ item.value }}</text>
        </view>
      </view>
    </view>
  </view>
</template>

<style>
.detail {
  position: relative;
  width: 100vw;
  height: 100vh;
  overflow: hidden;
  background-color: var(--cf-bg-page);
}

.detail__map {
  width: 100%;
  height: 100%;
}

.detail__back {
  position: absolute;
  left: 24rpx;
  z-index: 10;
  width: 72rpx;
  height: 72rpx;
  border-radius: 999px;
  background-color: rgba(255, 255, 255, 0.94);
  box-shadow: 0 8rpx 24rpx var(--cf-shadow);
  display: flex;
  align-items: center;
  justify-content: center;
}

.detail__state {
  position: absolute;
  left: 40rpx;
  right: 40rpx;
  top: 35%;
  z-index: 8;
}

.detail__no-track {
  position: absolute;
  left: 50%;
  top: 42%;
  transform: translate(-50%, -50%);
  padding: 16rpx 24rpx;
  border-radius: var(--cf-radius-pill);
  background-color: rgba(255, 255, 255, 0.92);
}

.detail__no-track-text {
  font-size: 22rpx;
  color: var(--cf-text-2);
}

.detail-card {
  position: absolute;
  left: 24rpx;
  right: 24rpx;
  bottom: calc(24rpx + env(safe-area-inset-bottom));
  z-index: 9;
  border-radius: var(--cf-radius-card);
  background-color: rgba(255, 255, 255, 0.97);
  padding: 28rpx;
  box-sizing: border-box;
  box-shadow: 0 16rpx 48rpx rgba(65, 70, 83, 0.18);
  display: flex;
  flex-direction: column;
  gap: 24rpx;
}

.detail-card__time {
  font-size: 22rpx;
  font-weight: 400;
  color: var(--cf-text-2);
}

.detail-card__head {
  display: flex;
  flex-direction: row;
  align-items: center;
  justify-content: space-between;
}

.detail-card__date {
  font-size: 20rpx;
  color: var(--cf-text-3);
}

.summary {
  display: flex;
  flex-direction: row;
  align-items: stretch;
}

.summary__item {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 8rpx;
}

.summary__number-row {
  display: flex;
  flex-direction: row;
  align-items: baseline;
  justify-content: center;
  gap: 4rpx;
}

.summary__value {
  font-size: 32rpx;
  font-weight: 700;
  line-height: 1.2;
  color: var(--cf-text-1);
  white-space: nowrap;
}

.summary__unit {
  font-size: 18rpx;
  color: var(--cf-text-3);
}

.summary__label {
  font-size: 20rpx;
  color: var(--cf-text-3);
  text-align: center;
}

.events {
  display: flex;
  flex-direction: row;
  align-items: center;
  gap: 8rpx;
  padding-top: 18rpx;
  border-top: 2rpx solid var(--cf-line);
}

.events__item {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: row;
  align-items: center;
  justify-content: center;
  gap: 8rpx;
}

.events__label {
  font-size: 22rpx;
  color: var(--cf-text-3);
}

.events__value {
  font-size: 26rpx;
  font-weight: 700;
  color: var(--cf-blue-deep);
}
</style>
