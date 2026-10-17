<script setup lang="ts">
import { computed, ref } from 'vue'
import { onShow } from '@dcloudio/uni-app'
import CfIcon from '@/components/CfIcon.vue'
import CfStatTriple from '@/components/CfStatTriple.vue'
import CfStatusChip from '@/components/CfStatusChip.vue'
import CfTabBar from '@/components/CfTabBar.vue'
import ProgressBar from '@/components/ProgressBar.vue'
import SectionCard from '@/components/SectionCard.vue'
import StatePanel from '@/components/StatePanel.vue'
import { useAuthStore } from '@/stores/auth'
import { useReportStore } from '@/stores/report'
import { useSyncStore } from '@/stores/sync'
import { useVehicleStore } from '@/stores/vehicle'
import { useSafeArea } from '@/composables/useSafeArea'
import type { SyncMode } from '@/core/application/HistorySyncService'
import { getContainer } from '@/services/container'
import {
  formatCount,
  formatDateTimeText,
  formatDuration,
  formatDurationShort,
  formatKm,
  formatMonthDay,
  formatMonthLabel,
  formatNumber,
  formatSpeed,
  maskMiddle,
  UNKNOWN_TEXT,
} from '@/utils/format'
import { goToLogin, goToTab, NAV_TABS, showConfirm, showToast } from '@/utils/navigation'

/**
 * 我的档案（设计稿 Frame「03 档案」，节点 2:411）。
 *
 * 版式：标题行（含设置按钮）→ 用户卡 → 累计里程卡（历史总报告）→ 近 6 个月里程条
 * → 历史月份摘要（含同步操作）→ 退出登录 → 底部导航。
 *
 * 这个页面同时承担「历史月报同步与缓存」的功能：同步按钮、进度、失败清单都在这里，
 * 并且本地已有的月份直接以设计稿的摘要列表形式呈现。
 */

const auth = useAuthStore()
const vehicle = useVehicleStore()
const report = useReportStore()
const sync = useSyncStore()
const safeArea = useSafeArea()
const initialized = ref(false)

onShow(async () => {
  if (!auth.isLoggedIn) {
    goToLogin()
    return
  }
  if (!vehicle.loadedOnce) await vehicle.load(false)
  sync.refresh()
  if (vehicle.activeRef) {
    // 昵称/手机号/头像来自 userinfo，dev ticket 直登时需要主动补一次
    await auth.ensureProfile()
    // 只读本地已缓存的月份，不在打开页面时批量联网
    await report.loadLifetime({ fetchMissing: false })
    if (!initialized.value) {
      initialized.value = true
      await sync.autoFillMissing()
      if ((sync.autoResult?.succeeded.length ?? 0) > 0) {
        await report.loadLifetime({ fetchMissing: false })
      }
    }
  }
})

const lifetime = computed(() => report.lifetimeStats)
const profile = computed(() => auth.profile)
const syncState = computed(() =>
  vehicle.activeRef ? getContainer().historySyncService.getSyncState(vehicle.activeRef.vehicleId) : null,
)

const phoneText = computed(() => maskMiddle(profile.value?.phone ?? null, 3, 4))

const summary = computed(() => {
  const stats = lifetime.value
  return {
    distanceKm: stats?.totalDistanceKm ?? null,
    triple: [
      { value: `${formatCount(stats?.totalRideDays ?? 0)} 天`, label: '骑行天数' },
      { value: formatDurationShort(stats?.totalDurationSeconds ?? null), label: '累计时长' },
      { value: formatCount(stats?.monthsCovered ?? 0), label: '覆盖月份' },
    ],
  }
})

const highlights = computed(() => {
  const stats = lifetime.value
  const longest = stats?.longestRideDay
  return [
    { value: formatSpeed(stats?.topSpeed?.speedKph ?? null, 0), label: '历史最高速度' },
    { value: formatKm(longest?.distanceKm ?? null, 1), label: '最长单日' },
    { value: longest ? formatMonthDay(longest.date) : UNKNOWN_TEXT, label: '最长骑行日' },
  ]
})

/** 近 6 个月里程条：按月份升序取最后 6 个，条长按最大值等比。 */
const trend = computed(() => {
  const points = (lifetime.value?.monthlyTrend ?? []).slice(-6).reverse()
  const max = points.reduce((best, point) => {
    const value = point.hasData ? (point.distanceKm ?? 0) : 0
    return value > best ? value : best
  }, 0)
  return points.map((point) => {
    const value = point.hasData ? point.distanceKm : null
    const ratio = value !== null && max > 0 ? Math.max(value / max, 0.02) : 0
    return {
      label: `${Number(point.month.slice(5))} 月`,
      distanceText: value === null ? UNKNOWN_TEXT : formatKm(value, 1),
      percent: Math.round(ratio * 100),
      unknown: value === null,
    }
  })
})

const trendYear = computed(() => `${report.selectedMonth.slice(0, 4)} 年`)

/** 历史月份摘要：本地已缓存的月份，最近的排前面。 */
const historyRows = computed(() => {
  const trendMap = new Map((lifetime.value?.monthlyTrend ?? []).map((point) => [point.month, point]))
  return [...sync.localMonths]
    .sort((a, b) => (a < b ? 1 : -1))
    .slice(0, 6)
    .map((month) => {
      const point = trendMap.get(month)
      return {
        month,
        label: formatMonthLabel(month),
        sub: point?.hasData ? `骑行 ${point.rideDays ?? 0} 天` : '无骑行记录',
        value: point?.hasData ? formatKm(point.distanceKm, 1) : UNKNOWN_TEXT,
        meta: point?.hasData ? formatDuration(point.durationSeconds) : '',
      }
    })
})

const failureText = computed(() =>
  sync.failedMonths.map((item) => `${item.month}：${item.message}`).join('；'),
)

const autoSyncNotice = computed(() => {
  if (sync.autoStatus === 'idle') return null
  const result = sync.autoResult

  if (sync.autoStatus === 'running') {
    const progress = sync.progress
    return {
      title: '正在加载历史骑行数据',
      subtitle:
        progress && progress.total > 0
          ? `正在同步 ${progress.currentMonth ?? '—'}，已完成 ${progress.completed}/${progress.total} 个月`
          : '首次使用会自动补齐缺失月份，已完成的月份会立即缓存。',
      closable: false,
      showProgress: true,
      action: 'cancel' as const,
    }
  }

  if (sync.autoStatus === 'completed') {
    return {
      title: '历史数据已加载',
      subtitle: `本次补齐 ${result?.succeeded.length ?? 0} 个月，历史累计和趋势已经更新。`,
      closable: true,
      showProgress: false,
      action: null,
    }
  }

  if (sync.autoStatus === 'partial') {
    const failed = result?.failed.length ?? 0
    return {
      title: result?.cancelled ? '历史数据加载已中断' : '部分历史月份加载失败',
      subtitle: result?.cancelled
        ? `已完成 ${result.succeeded.length} 个月，剩余月份可稍后继续。`
        : `已补齐 ${result?.succeeded.length ?? 0} 个月，${failed} 个月失败；已成功的缓存不会丢失。`,
      closable: true,
      showProgress: false,
      action: 'retry' as const,
    }
  }

  return {
    title: '历史数据加载失败',
    subtitle: sync.errorMessage ?? '暂时无法获取历史月份，请检查网络后重试。',
    closable: true,
    showProgress: false,
    action: 'retry' as const,
  }
})

const resultText = computed(() => {
  const result = sync.lastResult
  if (!result) return ''
  const parts = [`成功 ${result.succeeded.length} 个月`]
  if (result.failed.length > 0) parts.push(`失败 ${result.failed.length} 个月`)
  if (result.skipped.length > 0) parts.push(`跳过 ${result.skipped.length} 个月`)
  if (result.cancelled) parts.push('已中断')
  return parts.join('，')
})

const rangeText = computed(() => {
  const range = sync.range
  if (!range) return UNKNOWN_TEXT
  return `${range.from} ~ ${range.to}`
})

const loading = computed(() => report.loadingLifetime)

async function onPlan(mode: SyncMode = 'missing'): Promise<void> {
  await sync.planSync(mode)
}

async function onRun(mode: SyncMode = 'missing'): Promise<void> {
  if (mode === 'all') {
    const confirmed = await showConfirm('重新同步会逐月重新请求官方接口，可能耗时较长，确认继续？', '重新同步历史月份')
    if (!confirmed) return
  }
  await sync.run(mode)
  await report.loadLifetime({ fetchMissing: false })
  if (sync.errorMessage) showToast(sync.errorMessage, 'none')
}

async function onRetryAuto(): Promise<void> {
  await sync.retryAutoFill()
  await report.loadLifetime({ fetchMissing: false })
}

function onProfile(): void {
  showToast(
    profile.value
      ? `用户 ${profile.value.nickname ?? profile.value.userId}｜CFMOTO 号 ${profile.value.cfmotoNumber ?? '—'}${
          profile.value.joinedAt ? `｜注册于 ${profile.value.joinedAt}` : ''
        }`
      : '未读取到用户资料',
  )
}

async function onLogout(): Promise<void> {
  const confirmed = await showConfirm('退出后需要重新登录才能查看骑行数据，确认退出？', '退出登录')
  if (!confirmed) return
  await auth.logout()
  goToLogin()
}
</script>

<template>
  <view class="cf-page cf-archive">
    <view class="cf-archive__content">
      <!-- 标题行 -->
      <view
        class="page-head"
        :style="{
          marginTop: `${safeArea.statusBarHeight}px`,
          height: `${safeArea.navBarHeight}px`,
          marginRight: `${safeArea.capsuleGap}px`,
        }"
      >
        <text class="page-head__title">我的档案</text>
      </view>

      <!-- 用户卡 -->
      <view class="profile" @tap="onProfile">
        <view class="profile__avatar">
          <image v-if="profile?.avatarUrl" class="profile__photo" :src="profile.avatarUrl" mode="aspectFill" />
          <CfIcon v-else name="user-lavender" :size="52" />
        </view>
        <view class="profile__info">
          <text class="profile__name">{{ profile?.nickname ?? (auth.isLoggedIn ? '骑士' : '未登录') }}</text>
          <view class="profile__status">
            <CfStatusChip :label="auth.isLoggedIn ? '已登录' : '未登录'" :tone="auth.isLoggedIn ? 'mint' : 'neutral'" />
            <text class="profile__phone">{{ phoneText }}</text>
          </view>
          <text class="profile__joined">
            注册时间 {{ profile?.joinedAt ?? profile?.joinedMonth ?? UNKNOWN_TEXT }}
          </text>
        </view>
        <CfIcon name="chevron-right-secondary" :size="36" class="profile__arrow" />
      </view>

      <!-- 首次历史数据自动加载提示 -->
      <SectionCard
        v-if="autoSyncNotice"
        compact-radius
        :title="autoSyncNotice.title"
        :subtitle="autoSyncNotice.subtitle"
        icon="info-secondary"
      >
        <template v-if="autoSyncNotice.closable" #right>
          <view class="auto-sync__close" @tap="sync.dismissAutoNotice">
            <CfIcon name="close-secondary" :size="30" />
          </view>
        </template>
        <ProgressBar
          v-if="autoSyncNotice.showProgress"
          :percent="sync.progressPercent"
          :label="
            sync.progress && sync.progress.total > 0
              ? `${sync.progress.completed}/${sync.progress.total}（当前：${sync.progress.currentMonth ?? '—'}）`
              : '正在检查可查询范围…'
          "
        />
        <view
          v-if="autoSyncNotice.action"
          class="auto-sync__action"
          :class="{ 'auto-sync__action--primary': autoSyncNotice.action === 'retry' }"
          @tap="autoSyncNotice.action === 'cancel' ? sync.cancel() : onRetryAuto()"
        >
          <text class="auto-sync__action-text">
            {{ autoSyncNotice.action === 'cancel' ? '中断加载' : '重试缺失月份' }}
          </text>
        </view>
      </SectionCard>

      <!-- 累计里程（历史总报告） -->
      <SectionCard>
        <view class="metric__header">
          <view class="metric__label">
            <CfIcon name="award-lavender" :size="30" />
            <text class="metric__label-text">累计骑行里程</text>
          </view>
          <view class="pill pill--lavender">
            <text class="pill__text pill__text--lavender">全部时间</text>
          </view>
        </view>
        <view class="metric__value">
          <text class="metric__number">{{ formatNumber(summary.distanceKm, 1) }}</text>
          <text class="metric__unit">km</text>
        </view>
        <view class="divider" />
        <CfStatTriple :items="summary.triple" />
        <view class="divider" />
        <CfStatTriple :items="highlights" />
        <text class="note">
          统计区间 {{ lifetime?.range ? `${lifetime.range.from} ~ ${lifetime.range.to}` : UNKNOWN_TEXT }}
        </text>
      </SectionCard>

      <!-- 近 6 个月里程 -->
      <SectionCard title="近 6 个月里程" subtitle="按月对比 · 单位 km" compact-radius>
        <template #right>
          <view class="pill pill--lavender">
            <text class="pill__text pill__text--lavender">{{ trendYear }}</text>
          </view>
        </template>
        <view v-if="trend.length === 0" class="empty">
          <text class="empty__text">还没有可对比的月份，先同步历史月份</text>
        </view>
        <view v-else class="meters">
          <view v-for="item in trend" :key="item.label" class="meter">
            <text class="meter__label">{{ item.label }}</text>
            <view class="meter__track">
              <view class="meter__fill" :class="{ 'meter__fill--unknown': item.unknown }" :style="{ width: `${item.percent}%` }" />
            </view>
            <text class="meter__value">{{ item.distanceText }}</text>
          </view>
        </view>
      </SectionCard>

      <!-- 历史月份摘要 + 同步 -->
      <SectionCard
        title="最近同步月份"
        :subtitle="`最近 6 个月 · 本地共 ${sync.localMonths.length} 个月`"
        compact-radius
      >
        <template #right>
          <view class="link" @tap="onPlan('missing')">
            <text class="link__text">{{ sync.planning ? '计算中…' : '重新计算' }}</text>
            <CfIcon name="chevron-lavender" :size="24" />
          </view>
        </template>

        <view v-if="historyRows.length === 0" class="empty">
          <text class="empty__text">还没有同步过月份</text>
        </view>
        <view v-else class="rows">
          <view v-for="(row, index) in historyRows" :key="row.month" class="rows__item">
            <view v-if="index > 0" class="divider" />
            <view class="rows__line">
              <view class="rows__left">
                <text class="rows__label">{{ row.label }}</text>
                <text class="rows__sub">{{ row.sub }}</text>
              </view>
              <view class="rows__right">
                <text class="rows__value">{{ row.value }}</text>
                <text class="rows__meta">{{ row.meta }}</text>
              </view>
            </view>
          </view>
        </view>

        <view class="divider" />
        <text class="note">更多月份可在骑行报告中选择年度或自定义区间查看。</text>
        <text class="note">可同步范围：{{ rangeText }}</text>
        <view class="actions">
          <view class="button" @tap="onPlan('missing')">
            <text class="button__text">待同步 {{ sync.plan.length }} 个</text>
          </view>
          <view class="button button--primary" @tap="onRun('missing')">
            <text class="button__text button__text--primary">{{ sync.running ? '同步中…' : '补齐缺失月份' }}</text>
          </view>
          <view v-if="sync.failedMonths.length > 0" class="button" @tap="onRun('retry-failed')">
            <text class="button__text">重试失败</text>
          </view>
          <view class="button" @tap="onRun('all')">
            <text class="button__text">重新同步</text>
          </view>
          <view v-if="sync.running" class="button" @tap="sync.cancel">
            <text class="button__text">中断</text>
          </view>
        </view>
        <ProgressBar
          v-if="sync.progress && sync.progress.total > 0"
          :percent="sync.progressPercent"
          :label="`${sync.progress.completed}/${sync.progress.total}（当前：${sync.progress.currentMonth ?? '—'}）`"
        />
        <text v-if="resultText" class="note">上次运行：{{ resultText }}</text>
        <text class="note">上次同步时间：{{ formatDateTimeText(syncState?.lastSyncedAt ?? null) }}</text>
        <StatePanel
          v-if="failureText"
          status="error"
          :message="failureText"
          hint="失败月份的已有缓存会保留，不会被清空"
          retry-text="重试失败月份"
          @retry="onRun('retry-failed')"
        />
        <StatePanel v-else-if="loading" status="loading" />
      </SectionCard>

      <!-- 退出登录 -->
      <view class="logout" @tap="onLogout">
        <text class="logout__text">退出登录</text>
      </view>
    </view>

    <CfTabBar current="archive" :items="NAV_TABS" @select="goToTab" />
  </view>
</template>

<style>
.cf-archive {
  padding: 0;
}

.cf-archive__content {
  display: flex;
  flex-direction: column;
  gap: var(--cf-space-gap);
  padding: 0 var(--cf-space-page) 200rpx;
}

.page-head {
  display: flex;
  flex-direction: row;
  align-items: center;
  justify-content: space-between;
}

.page-head__title {
  font-size: 44rpx;
  font-weight: 700;
  line-height: 1.3;
  color: var(--cf-text-1);
}

/* 用户卡 */
.profile {
  display: flex;
  flex-direction: row;
  align-items: center;
  gap: 28rpx;
  padding: 36rpx;
  border-radius: var(--cf-radius-lg);
  background-color: var(--cf-bg-card);
  box-shadow: 0 12rpx 32rpx var(--cf-shadow);
}

.profile__avatar {
  width: 116rpx;
  height: 116rpx;
  border-radius: var(--cf-radius-pill);
  background-color: var(--cf-lavender-soft);
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
  overflow: hidden;
}

.profile__photo {
  width: 116rpx;
  height: 116rpx;
  border-radius: var(--cf-radius-pill);
}

.profile__info {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 12rpx;
}

.profile__name {
  font-size: 36rpx;
  font-weight: 700;
  color: var(--cf-text-1);
}

.profile__status {
  display: flex;
  flex-direction: row;
  align-items: center;
  gap: 14rpx;
}

.profile__phone {
  font-size: 22rpx;
  color: var(--cf-text-2);
}

.profile__joined {
  font-size: 22rpx;
  color: var(--cf-text-3);
}

.profile__arrow {
  flex-shrink: 0;
}

.auto-sync__close {
  width: 48rpx;
  height: 48rpx;
  display: flex;
  align-items: center;
  justify-content: center;
}

.auto-sync__action {
  height: 64rpx;
  padding: 0 28rpx;
  border-radius: var(--cf-radius-pill);
  background-color: var(--cf-bg-soft);
  display: flex;
  align-items: center;
  justify-content: center;
  align-self: flex-start;
}

.auto-sync__action--primary {
  background-color: var(--cf-blue-soft);
}

.auto-sync__action-text {
  font-size: 24rpx;
  font-weight: 600;
  color: var(--cf-blue-deep);
}

/* 累计里程 */
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
  color: var(--cf-text-2);
  padding-bottom: 6rpx;
}

.divider {
  width: 100%;
  height: 2rpx;
  background-color: var(--cf-line);
}

.pill {
  height: 48rpx;
  border-radius: var(--cf-radius-pill);
  padding: 0 20rpx;
  display: flex;
  align-items: center;
  justify-content: center;
}

.pill--lavender {
  background-color: var(--cf-lavender-soft);
}

.pill__text {
  font-size: 22rpx;
  color: var(--cf-text-2);
}

.pill__text--lavender {
  color: #8a7ccb;
  font-weight: 500;
}

/* 里程条 */
.meters {
  display: flex;
  flex-direction: column;
  gap: 24rpx;
}

.meter {
  display: flex;
  flex-direction: row;
  align-items: center;
  gap: 20rpx;
}

.meter__label {
  width: 72rpx;
  font-size: 24rpx;
  font-weight: 500;
  color: var(--cf-text-2);
  flex-shrink: 0;
}

.meter__track {
  flex: 1;
  min-width: 0;
  height: 16rpx;
  border-radius: var(--cf-radius-pill);
  background-color: #f5f2ec;
  overflow: hidden;
}

.meter__fill {
  height: 100%;
  border-radius: var(--cf-radius-pill);
  background-color: var(--cf-lavender);
}

.meter__fill--unknown {
  background-color: var(--cf-line);
}

.meter__value {
  width: 140rpx;
  text-align: right;
  font-size: 24rpx;
  font-weight: 600;
  color: var(--cf-text-1);
  flex-shrink: 0;
}

/* 摘要列表 */
.rows {
  display: flex;
  flex-direction: column;
  gap: 24rpx;
}

.rows__item {
  display: flex;
  flex-direction: column;
  gap: 24rpx;
}

.rows__line {
  display: flex;
  flex-direction: row;
  align-items: center;
  justify-content: space-between;
}

.rows__left {
  display: flex;
  flex-direction: column;
  gap: 8rpx;
  flex: 1;
  min-width: 0;
}

.rows__label {
  font-size: 26rpx;
  font-weight: 500;
  color: var(--cf-text-1);
}

.rows__sub {
  font-size: 22rpx;
  color: var(--cf-text-2);
}

.rows__right {
  display: flex;
  flex-direction: column;
  align-items: flex-end;
  gap: 8rpx;
}

.rows__value {
  font-size: 28rpx;
  font-weight: 600;
  color: var(--cf-text-1);
}

.rows__meta {
  font-size: 22rpx;
  color: var(--cf-text-2);
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
  color: #8a7ccb;
}

.actions {
  display: flex;
  flex-direction: row;
  flex-wrap: wrap;
  gap: 16rpx;
}

.button {
  padding: 16rpx 28rpx;
  border-radius: var(--cf-radius-pill);
  background-color: var(--cf-bg-soft);
}

.button--primary {
  background-color: var(--cf-blue-deep);
}

.button__text {
  font-size: 24rpx;
  font-weight: 500;
  color: var(--cf-text-1);
}

.button__text--primary {
  color: #ffffff;
}

.note {
  font-size: 22rpx;
  line-height: 1.6;
  color: var(--cf-text-3);
}

.empty {
  padding: 16rpx 0;
}

.empty__text {
  font-size: 24rpx;
  color: var(--cf-text-3);
}

/* 账号卡 */
.account__row {
  display: flex;
  flex-direction: row;
  align-items: center;
  justify-content: space-between;
  min-height: 96rpx;
}

.account__left {
  display: flex;
  flex-direction: row;
  align-items: center;
  gap: 20rpx;
}

.account__icon {
  width: 64rpx;
  height: 64rpx;
  border-radius: 20rpx;
  display: flex;
  align-items: center;
  justify-content: center;
}

.account__icon--blue {
  background-color: var(--cf-blue-soft);
}

.account__icon--lavender {
  background-color: var(--cf-lavender-soft);
}

.account__icon--mint {
  background-color: var(--cf-mint-soft);
}

.account__label {
  font-size: 26rpx;
  font-weight: 500;
  color: var(--cf-text-1);
}

.account__right {
  display: flex;
  flex-direction: row;
  align-items: center;
  gap: 10rpx;
}

.account__value {
  font-size: 22rpx;
  color: var(--cf-text-2);
}

/* 退出登录 */
.logout {
  height: 96rpx;
  border-radius: var(--cf-radius-card);
  background-color: var(--cf-danger-soft);
  display: flex;
  align-items: center;
  justify-content: center;
}

.logout__text {
  font-size: 26rpx;
  font-weight: 500;
  color: var(--cf-danger);
}
</style>
