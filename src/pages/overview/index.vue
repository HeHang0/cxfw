<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { onShow } from '@dcloudio/uni-app'
import CfBarChart from '@/components/CfBarChart.vue'
import CfBikeScene from '@/components/CfBikeScene.vue'
import CfIcon from '@/components/CfIcon.vue'
import CfStatTriple from '@/components/CfStatTriple.vue'
import CfTabBar from '@/components/CfTabBar.vue'
import SectionCard from '@/components/SectionCard.vue'
import StatePanel from '@/components/StatePanel.vue'
import { useAuthStore } from '@/stores/auth'
import { useReportStore } from '@/stores/report'
import { useRideHistoryStore } from '@/stores/rideHistory'
import { useVehicleStore } from '@/stores/vehicle'
import { useWeatherStore } from '@/stores/weather'
import { useSafeArea } from '@/composables/useSafeArea'
import { writeTrace } from '@/utils/trace'
import { getContainer } from '@/services/container'
import { formatMonth } from '@/core/domain/datetime'
import { wgs84ToGcj02 } from '@/core/domain/coordinates'
import type { DateKey } from '@/core/domain/identifiers'
import type { RideHistoryItem } from '@/core/domain/models'
import {
  formatCount,
  formatDurationShort,
  formatKm,
  formatMonthDay,
  formatMonthLabel,
  formatMonthShort,
  formatNumber,
  formatSpeed,
  UNKNOWN_TEXT,
} from '@/utils/format'
import { goToLogin, goToTab, navigateTo, NAV_TABS, ROUTES } from '@/utils/navigation'

/**
 * 骑行总览（设计稿 Frame「01 总览」，节点 2:32）。
 *
 * 版式与设计稿一一对应：
 * 问候行（通知 + 头像）→ 车辆卡（含插画）→ 本月累计里程卡 → 里程趋势卡
 * → 最近骑行卡 → 安全骑行横幅 → 底部导航。
 * 所有尺寸按设计稿 px × 2 换算成 rpx，颜色/圆角/间距取自设计变量。
 */

const auth = useAuthStore()
const vehicle = useVehicleStore()
const report = useReportStore()
const rideHistory = useRideHistoryStore()
const weather = useWeatherStore()
const safeArea = useSafeArea()
const bootstrapped = ref(false)
const selectedBarIndex = ref(-1)

onShow(async () => {
  writeTrace('overview.onShow')
  if (!auth.isLoggedIn) {
    writeTrace('overview.notLoggedIn')
    goToLogin()
    return
  }
  writeTrace('overview.loggedIn')
  if (!vehicle.loadedOnce) {
    writeTrace('overview.beforeLoad')
    await vehicle.load(false)
    writeTrace(`overview.afterLoad n=${vehicle.vehicles.length} err=${vehicle.errorMessage ?? ''}`)
    if (vehicle.vehicles.length === 0) await vehicle.load(true)
  }
  if (vehicle.activeRef && vehicle.telemetry === null) await vehicle.loadTelemetry()
  // 先取账号注册月份，月报拉取以它为下界
  await auth.ensureProfile()
  if (vehicle.activeRef) {
    await report.loadOverview()
    await loadRecentTrips()
  }
  bootstrapped.value = true
})

watch(
  () =>
    [
      vehicle.telemetry?.location?.latitude,
      vehicle.telemetry?.location?.longitude,
    ] as const,
  ([latitude, longitude]) => {
    if (latitude !== null && latitude !== undefined && longitude !== null && longitude !== undefined) {
      void weather.loadFromLocation(latitude, longitude)
      return
    }
    if (!vehicle.telemetryLoading) weather.useFallback()
  },
  { immediate: true },
)

const stats = computed(() => report.monthStats)
const lifetime = computed(() => report.lifetimeStats)

const greeting = computed(() => {
  const hour = getContainer().clock.now().getHours()
  if (hour < 6) return '夜深了，骑士'
  if (hour < 11) return '早安，骑士'
  if (hour < 14) return '午安，骑士'
  if (hour < 18) return '下午好，骑士'
  return '晚安，骑士'
})

const vehicleTitle = computed(
  () =>
    vehicle.telemetry?.vehicleTypeName ??
    vehicle.activeVehicle?.model ??
    vehicle.activeVehicle?.vin ??
    '未绑定车辆',
)

const vehicleLocation = computed(() => vehicle.telemetry?.location ?? null)
const vehicleMapCoordinates = computed<[number, number] | null>(() => {
  const lat = vehicleLocation.value?.latitude
  const lng = vehicleLocation.value?.longitude
  return lat === null || lat === undefined || lng === null || lng === undefined
    ? null
    : wgs84ToGcj02(lat, lng)
})
const vehicleMapLatitude = computed(() => vehicleMapCoordinates.value?.[0] ?? null)
const vehicleMapLongitude = computed(() => vehicleMapCoordinates.value?.[1] ?? null)
const vehicleMapMarkers = computed(() =>
  vehicleMapLatitude.value === null || vehicleMapLongitude.value === null
    ? []
    : [
        {
          id: 1,
          latitude: vehicleMapLatitude.value,
          longitude: vehicleMapLongitude.value,
          width: 28,
          height: 36,
          callout: {
            content: vehicleTitle.value,
            display: 'ALWAYS',
            padding: 8,
            borderRadius: 8,
          },
        },
      ],
)
const vehicleAddress = computed(
  () =>
    vehicle.telemetry?.recentRide?.endAddress ??
    (vehicleMapLatitude.value !== null && vehicleMapLongitude.value !== null
      ? `${vehicleMapLatitude.value.toFixed(5)}, ${vehicleMapLongitude.value.toFixed(5)}`
      : UNKNOWN_TEXT),
)

const currentMonthKey = computed(() => formatMonth(getContainer().clock.now()))
const monthPill = computed(() => formatMonthLabel(currentMonthKey.value))

const tripleItems = computed(() => {
  const current = stats.value
  return [
    { value: formatCount(current?.rideDays ?? 0), label: '骑行天数' },
    { value: formatDurationShort(current?.totalDurationSeconds ?? null), label: '骑行时长' },
    { value: formatKm(current?.averageDistancePerRideDayKm ?? null, 1), label: '骑行日均' },
  ]
})

const rapidItems = computed(() => {
  const rapid = stats.value?.rapid
  return [
    { value: formatCount(rapid?.acceleration ?? null), label: '急加速' },
    { value: formatCount(rapid?.deceleration ?? null), label: '急刹车' },
    { value: formatCount(rapid?.turn ?? null), label: '压弯' },
  ]
})

const averageSpeedKph = computed(() => {
  const distance = stats.value?.totalDistanceKm ?? null
  const duration = stats.value?.totalDurationSeconds ?? null
  if (distance === null || duration === null || duration <= 0) return null
  return Math.round((distance / (duration / 3600)) * 10) / 10
})

const trendPoints = computed(() =>
  report.recentMonths.map((point) => ({
    label: formatMonthShort(point.month),
    value: point.hasData ? point.distanceKm : null,
    tooltip: point.hasData && point.distanceKm !== null ? formatKm(point.distanceKm, 1) : '—',
  })),
)

const trendYear = computed(() => `${currentMonthKey.value.slice(0, 4)} 年`)

const latestRideDate = computed<DateKey | null>(() => {
  const points = (stats.value?.dailyTrend ?? []).filter(
    (point) => point.distanceKm !== null && point.distanceKm > 0,
  )
  return points[points.length - 1]?.date ?? null
})

const recentTrips = computed(() => rideHistory.trips)
const recentDateLabel = computed(() =>
  latestRideDate.value ? formatMonthDay(latestRideDate.value) : '最近一天',
)

async function loadRecentTrips(): Promise<void> {
  if (latestRideDate.value) await rideHistory.loadDay(latestRideDate.value)
}

function openTripDetail(trip: RideHistoryItem): void {
  navigateTo(`${ROUTES.rideDetail}?id=${encodeURIComponent(trip.id)}`)
}

const banner = computed(() => {
  const issues = report.meta?.issues ?? []
  if (issues.length > 0) {
    return { title: '数据提示', text: issues[0]?.message ?? '' }
  }
  if (vehicle.missingFields.length > 0) {
    return { title: '车辆信息待完善', text: `缺少 ${vehicle.missingFields.join('、')}，部分骑行接口无法调用` }
  }
  return { title: '安全骑行 · 快乐出发', text: '每一次出发，都值得被记录' }
})

const loading = computed(() => report.loadingOverview || report.loadingMonth || vehicle.loading)
const lifetimeCoverage = computed(() => {
  const range = lifetime.value?.range
  if (!range) return UNKNOWN_TEXT
  return `${range.from} ~ ${range.to}`
})

async function onRefresh(): Promise<void> {
  await vehicle.load(true)
  await report.loadOverview({ force: true })
  await loadRecentTrips()
}

function onBarSelect(index: number): void {
  selectedBarIndex.value = index
}
</script>

<template>
  <view class="cf-page cf-overview" @tap="selectedBarIndex = -1">
    <view class="cf-overview__content">
      <view
        v-if="loading && !bootstrapped"
        :style="{ marginTop: `${safeArea.statusBarHeight}px` }"
      >
        <StatePanel status="loading" />
      </view>
      <view
        v-else-if="!vehicle.activeRef"
        :style="{ marginTop: `${safeArea.statusBarHeight}px` }"
      >
        <StatePanel
          :status="vehicle.errorMessage ? 'error' : 'empty'"
          :message="vehicle.errorMessage ?? '还没有可用车辆'"
          :hint="vehicle.errorMessage ? '请检查网络或登录状态后重试' : '请到车辆页刷新车辆列表'"
          retry-text="去车辆页"
          @retry="goToTab(ROUTES.vehicle)"
        />
      </view>

      <template v-else>
        <!-- 问候行 -->
        <view
          class="greet"
          :style="{
            marginTop: `${safeArea.statusBarHeight}px`,
            height: `${safeArea.navBarHeight}px`,
            marginRight: `${safeArea.capsuleGap}px`,
          }"
        >
          <view class="greet__text">
            <text class="greet__title">{{ greeting }}</text>
            <text class="greet__subtitle">{{ weather.copy }}</text>
          </view>
        </view>

        <!-- 车辆位置 -->
        <view class="vehicle-map-card">
          <map
            v-if="vehicleMapLatitude !== null && vehicleMapLongitude !== null"
            class="vehicle-map-card__view"
            :latitude="vehicleMapLatitude"
            :longitude="vehicleMapLongitude"
            :scale="14"
            :markers="vehicleMapMarkers"
          />
          <view v-else class="vehicle-map-card__empty">
            <CfIcon name="pin-primary" :size="36" />
            <text class="vehicle-map-card__empty-text">暂无车辆位置</text>
          </view>
          <view class="vehicle-map-card__fade" />
          <view v-if="vehicleMapLatitude !== null" class="vehicle-map-card__location">
            <CfIcon name="pin-primary" :size="26" />
            <text class="vehicle-map-card__address">{{ vehicleAddress }}</text>
          </view>
        </view>

        <!-- 本月累计里程 -->
        <SectionCard>
          <view class="metric__header">
            <view class="metric__label">
              <CfIcon name="route-secondary" :size="30" />
              <text class="metric__label-text">本月累计里程</text>
            </view>
            <view class="pill pill--blue">
              <text class="pill__text">{{ monthPill }}</text>
            </view>
          </view>
          <view class="metric__value">
            <text class="metric__number">{{ formatNumber(stats?.totalDistanceKm ?? null, 1) }}</text>
            <text class="metric__unit">km</text>
          </view>
          <view class="divider" />
          <CfStatTriple :items="tripleItems" />
          <view class="divider" />
          <view class="subsection">
            <text class="subsection__title">安全骑行</text>
            <CfStatTriple :items="rapidItems" />
          </view>
        </SectionCard>

        <!-- 平均速度 / 最高速度 / 单日最远 -->
        <view class="duo">
          <view class="duo__card duo__card--blue">
            <view class="duo__head">
              <CfIcon name="gauge-deep" :size="28" />
              <text class="duo__label">平均速度</text>
            </view>
            <view class="duo__value">
              <text class="duo__number">{{ formatNumber(averageSpeedKph, 1) }}</text>
              <text class="duo__unit">km/h</text>
            </view>
            <text class="duo__hint">总里程 ÷ 总时长</text>
          </view>
          <view class="duo__card duo__card--mint">
            <view class="duo__head">
              <CfIcon name="zap-deep" :size="28" />
              <text class="duo__label">最高速度</text>
            </view>
            <view class="duo__value">
              <text class="duo__number">{{ formatSpeed(stats?.topSpeed?.speedKph ?? null, 0).replace(' km/h', '') }}</text>
              <text class="duo__unit">km/h</text>
            </view>
            <text class="duo__hint">
              {{ stats?.topSpeed ? `${formatMonthDay(stats.topSpeed.date)} 记录` : '暂无记录' }}
            </text>
          </view>
          <view class="duo__card duo__card--cream">
            <view class="duo__head">
              <CfIcon name="route-secondary" :size="28" />
              <text class="duo__label">单日最远</text>
            </view>
            <view class="duo__value">
              <text class="duo__number">{{ formatNumber(stats?.longestRideDay?.distanceKm ?? null, 1) }}</text>
              <text class="duo__unit">km</text>
            </view>
            <text class="duo__hint">
              {{ stats?.longestRideDay ? formatMonthDay(stats.longestRideDay.date) : '暂无记录' }}
            </text>
          </view>
        </view>

        <!-- 最近骑行 -->
        <SectionCard title="最近骑行" :subtitle="recentDateLabel" compact-radius>
          <template #right>
            <view class="link" @tap="goToTab(ROUTES.report)">
              <text class="link__text">全部记录</text>
              <CfIcon name="chevron-deep" :size="24" />
            </view>
          </template>
          <StatePanel
            v-if="rideHistory.loading"
            status="loading"
            message="正在读取最近行程"
          />
          <StatePanel
            v-else-if="rideHistory.errorMessage"
            status="error"
            :message="rideHistory.errorMessage"
            retry-text="重试"
            @retry="loadRecentTrips"
          />
          <view v-else-if="recentTrips.length === 0" class="recent__empty">
            <text class="recent__empty-text">最近一天没有单次行程记录</text>
          </view>
          <view v-else class="recent__rows">
            <view
              v-for="(trip, index) in recentTrips"
              :key="trip.id"
              class="recent__row recent__row--tappable"
              @tap="openTripDetail(trip)"
            >
              <view v-if="index > 0" class="divider" />
              <view class="recent__line">
                <view class="recent__left">
                  <text class="recent__date">
                    {{ trip.startTime?.slice(11, 16) ?? '—' }} - {{ trip.endTime?.slice(11, 16) ?? '—' }}
                  </text>
                  <text class="recent__detail">{{ trip.startAddress ?? '—' }}</text>
                </view>
                <view class="recent__right">
                  <text class="recent__distance">{{ formatKm(trip.distanceKm, 1) }}</text>
                  <text class="recent__duration">{{ formatDurationShort(trip.durationSeconds) }}</text>
                </view>
            </view>
            </view>
          </view>
        </SectionCard>

        <!-- 里程趋势 -->
        <SectionCard title="里程趋势" subtitle="近 6 个月 · 单位 km" compact-radius>
          <template #right>
            <view class="pill pill--cream">
              <text class="pill__text pill__text--cream">{{ trendYear }}</text>
            </view>
          </template>
          <CfBarChart :points="trendPoints" :selected-index="selectedBarIndex" @select="onBarSelect" />
        </SectionCard>

        <!-- 安全骑行横幅 -->
        <view class="banner">
          <CfBikeScene compact :image-url="vehicle.activeVehicle?.imageUrl ?? null" />
          <view class="banner__text">
            <text class="banner__title">{{ banner.title }}</text>
            <text class="banner__desc">{{ banner.text }}</text>
          </view>
        </view>

        <!-- 历史累计（设计稿之外的补充信息，沿用卡片样式） -->
        <SectionCard title="历史累计" :subtitle="lifetimeCoverage" compact-radius>
          <template #right>
            <view class="pill pill--blue" @tap="onRefresh">
              <text class="pill__text">刷新</text>
            </view>
          </template>
          <CfStatTriple
            :items="[
              { value: formatNumber(lifetime?.totalDistanceKm ?? null, 1), label: '累计里程 km' },
              { value: formatCount(lifetime?.totalRideDays ?? 0), label: '累计骑行天数' },
              { value: formatSpeed(lifetime?.topSpeed?.speedKph ?? null, 0), label: '历史最高速度' },
            ]"
          />
          <text v-if="lifetime?.range" class="coverage">
            统计区间 {{ lifetime.range.from }} ~ {{ lifetime.range.to }}
          </text>
        </SectionCard>
      </template>
    </view>

    <CfTabBar current="overview" :items="NAV_TABS" @select="goToTab" />
  </view>
</template>

<style>
.cf-overview {
  padding: 0;
  background-color: var(--cf-bg-page);
}

.cf-overview__content {
  display: flex;
  flex-direction: column;
  gap: var(--cf-space-gap);
  /* 设计稿内容区 padding：10 / 20 / 24，再为自定义底部导航留出空间 */
  padding: 0 var(--cf-space-page) 200rpx;
}

/* 问候行 */
.greet {
  display: flex;
  flex-direction: row;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 20rpx;
}

.greet__text {
  display: flex;
  flex-direction: column;
  gap: 10rpx;
  /* 问候标题与胶囊中心对齐，副标题保持在其下方。 */
  transform: translateY(18rpx);
}

.greet__title {
  font-size: 40rpx;
  line-height: 1.3;
  color: var(--cf-text-1);
}

.greet__subtitle {
  font-size: 24rpx;
  line-height: 1.4;
  color: var(--cf-text-2);
}

.vehicle-map-card {
  position: relative;
  width: 100%;
  height: 360rpx;
  border-radius: 36rpx;
  overflow: hidden;
  background-color: var(--cf-bg-soft);
  border: 2rpx solid var(--cf-line);
  box-sizing: border-box;
}

.vehicle-map-card__view {
  width: 100%;
  height: 100%;
}

.vehicle-map-card__empty {
  width: 100%;
  height: 100%;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 12rpx;
}

.vehicle-map-card__empty-text {
  font-size: 24rpx;
  color: var(--cf-text-3);
}

.vehicle-map-card__fade {
  position: absolute;
  left: 0;
  right: 0;
  bottom: 0;
  height: 180rpx;
  pointer-events: none;
  background-image: linear-gradient(
    to top,
    rgba(255, 255, 255, 0.96) 0%,
    rgba(255, 255, 255, 0.72) 42%,
    rgba(255, 255, 255, 0) 100%
  );
}

.vehicle-map-card__location {
  position: absolute;
  left: 28rpx;
  right: 28rpx;
  bottom: 24rpx;
  display: flex;
  flex-direction: row;
  align-items: center;
  gap: 10rpx;
}

.vehicle-map-card__address {
  flex: 1;
  min-width: 0;
  font-size: 23rpx;
  line-height: 1.4;
  color: var(--cf-text-1);
}

/* 本月累计里程 */
.metric__header {
  display: flex;
  flex-direction: row;
  align-items: center;
  justify-content: space-between;
}

.metric__label {
  display: flex;
  flex-direction: row;
  align-items: center;
  gap: 14rpx;
}

.metric__label-text {
  font-size: 26rpx;
  color: var(--cf-text-2);
}

.metric__value {
  display: flex;
  flex-direction: row;
  align-items: flex-end;
  gap: 16rpx;
}

.metric__number {
  font-size: 72rpx;
  font-weight: 700;
  line-height: 1;
  color: var(--cf-text-1);
}

.metric__unit {
  font-size: 28rpx;
  line-height: 1.2;
  color: var(--cf-text-2);
  padding-bottom: 6rpx;
}

.divider {
  width: 100%;
  height: 2rpx;
  background-color: var(--cf-line);
}

.subsection {
  display: flex;
  flex-direction: column;
  gap: 20rpx;
}

.subsection__title {
  font-size: 22rpx;
  color: var(--cf-text-3);
}

.duo {
  display: flex;
  flex-direction: row;
  align-items: stretch;
  gap: 16rpx;
}

.duo__card {
  flex: 1;
  min-width: 0;
  border-radius: 32rpx;
  padding: 22rpx;
  display: flex;
  flex-direction: column;
  gap: 16rpx;
  box-shadow: 0 12rpx 32rpx var(--cf-shadow);
}

.duo__card--blue {
  background-color: var(--cf-blue-soft);
}

.duo__card--mint {
  background-color: var(--cf-mint-soft);
}

.duo__card--cream {
  background-color: var(--cf-cream-soft);
}

.duo__head {
  display: flex;
  flex-direction: row;
  align-items: center;
  gap: 12rpx;
}

.duo__label {
  font-size: 22rpx;
  color: var(--cf-text-2);
}

.duo__value {
  display: flex;
  flex-direction: row;
  align-items: flex-end;
  gap: 10rpx;
  white-space: nowrap;
  overflow: hidden;
}

.duo__number {
  font-size: 36rpx;
  font-weight: 700;
  line-height: 1;
  color: var(--cf-text-1);
  white-space: nowrap;
}

.duo__unit {
  font-size: 22rpx;
  color: var(--cf-text-2);
  padding-bottom: 4rpx;
}

.duo__hint {
  font-size: 20rpx;
  color: var(--cf-text-3);
}

.pill {
  height: 48rpx;
  border-radius: var(--cf-radius-pill);
  padding: 0 20rpx;
  display: flex;
  flex-direction: row;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
}

.pill--blue {
  background-color: var(--cf-blue-soft);
}

.pill--cream {
  background-color: var(--cf-cream-soft);
}

.pill__text {
  font-size: 22rpx;
  color: var(--cf-text-2);
}

.pill__text--cream {
  color: #b58b3a;
  font-weight: 500;
}

/* 最近骑行 */
.recent__rows {
  display: flex;
  flex-direction: column;
}

.link {
  display: flex;
  flex-direction: row;
  align-items: center;
  gap: 6rpx;
}

.link__text {
  font-size: 22rpx;
  font-weight: 500;
  color: var(--cf-blue-deep);
}

.recent__line {
  display: flex;
  flex-direction: row;
  align-items: center;
  justify-content: space-between;
  padding-top: 8rpx;
}

.recent__row .divider {
  margin-top: 18rpx;
  margin-bottom: 4rpx;
}

.recent__row--tappable:active {
  opacity: 0.65;
}

.recent__left {
  display: flex;
  flex-direction: column;
  gap: 8rpx;
  flex: 1;
}

.recent__date {
  font-size: 26rpx;
  font-weight: 500;
  color: var(--cf-text-1);
}

.recent__detail {
  font-size: 22rpx;
  color: var(--cf-text-2);
}

.recent__right {
  display: flex;
  flex-direction: column;
  align-items: flex-end;
  gap: 8rpx;
}

.recent__distance {
  font-size: 28rpx;
  font-weight: 600;
  color: var(--cf-text-1);
}

.recent__duration {
  font-size: 22rpx;
  color: var(--cf-text-2);
}

.recent__empty {
  padding: 16rpx 0;
}

.recent__empty-text {
  font-size: 24rpx;
  color: var(--cf-text-3);
}

/* 安全骑行横幅 */
.banner {
  height: 152rpx;
  border-radius: var(--cf-radius-card);
  background-color: var(--cf-bg-soft);
  display: flex;
  flex-direction: row;
  align-items: center;
  gap: 24rpx;
  padding: 0 36rpx 0 24rpx;
  box-sizing: border-box;
}

.banner__text {
  display: flex;
  flex-direction: column;
  gap: 8rpx;
  flex: 1;
}

.banner__title {
  font-size: 26rpx;
  font-weight: 600;
  color: var(--cf-text-1);
}

.banner__desc {
  font-size: 22rpx;
  color: var(--cf-text-2);
}

.coverage {
  font-size: 22rpx;
  line-height: 1.6;
  color: var(--cf-text-3);
}
</style>
