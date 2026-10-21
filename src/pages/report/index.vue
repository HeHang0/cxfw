<script setup lang="ts">
import { computed, nextTick, ref, watch } from 'vue'
import { onLoad, onShow } from '@dcloudio/uni-app'
import CfBarChart from '@/components/CfBarChart.vue'
import CfIcon from '@/components/CfIcon.vue'
import RideDaySheet from '@/components/RideDaySheet.vue'
import CfStatTriple from '@/components/CfStatTriple.vue'
import CfStatusChip from '@/components/CfStatusChip.vue'
import CfTabBar from '@/components/CfTabBar.vue'
import CfTopBlur from '@/components/CfTopBlur.vue'
import SectionCard from '@/components/SectionCard.vue'
import StatePanel from '@/components/StatePanel.vue'
import { useAuthStore } from '@/stores/auth'
import { useReportStore } from '@/stores/report'
import { useVehicleStore } from '@/stores/vehicle'
import { useSafeArea } from '@/composables/useSafeArea'
import { addMonths, compareMonth, formatMonth } from '@/core/domain/datetime'
import type { MonthKey } from '@/core/domain/identifiers'
import type { DateKey } from '@/core/domain/identifiers'
import type { RideHistoryItem } from '@/core/domain/models'
import { getContainer } from '@/services/container'
import {
  formatCount,
  formatDuration,
  formatDurationShort,
  formatKm,
  formatMonthDay,
  formatMonthLabel,
  formatNumber,
  formatSpeed,
} from '@/utils/format'
import { goToLogin, goToTab, navigateTo, NAV_TABS, ROUTES } from '@/utils/navigation'

/**
 * 骑行报告（设计稿 Frame「02 报告」，节点 2:232）。
 *
 * 版式：标题行（含日历按钮）→ 切换卡（月度/年度 + 月份切换）→ 累计里程卡
 * → 里程图表卡（每日/每月）→ 平均速度 / 最高速度 双卡 → 骑行记录卡 → 底部导航。
 *
 * 历史总报告（累计里程/时长/骑行天数/覆盖范围）放在「档案」页，因为那里才是历史维度。
 */

type Mode = 'month' | 'year' | 'range'

interface PickerChangeEvent {
  readonly detail: { readonly value: string }
}

interface RecordRow {
  readonly label: string
  readonly value: string
  readonly stats: readonly string[]
  readonly extra?: string
  readonly month?: MonthKey
  readonly date?: DateKey
}

const auth = useAuthStore()
const vehicle = useVehicleStore()
const report = useReportStore()
const safeArea = useSafeArea()
const mode = ref<Mode>('month')
const bootstrapped = ref(false)
const selectedBarIndex = ref(-1)
const rangeInitialized = ref(false)
const daySheetDate = ref<DateKey | null>(null)
const focusTarget = ref<'records' | 'day' | null>(null)
const focusDate = ref<DateKey | null>(null)
const hasScrollTail = ref(false)

onLoad((options) => {
  const date = typeof options?.date === 'string' ? options.date : ''
  const dateValid = /^\d{4}-\d{2}-\d{2}$/.test(date)
  const month =
    (dateValid ? date.slice(0, 7) : '') ||
    (typeof options?.month === 'string' ? options.month : '')
  if (/^\d{4}-\d{2}$/.test(month)) {
    report.selectedMonth = month as MonthKey
  }
  if (dateValid) {
    focusDate.value = date as DateKey
  }
  if (options?.focus === 'day' && focusDate.value !== null) {
    mode.value = 'month'
    focusTarget.value = 'day'
    hasScrollTail.value = true
  } else if (options?.focus === 'records') {
    mode.value = 'month'
    focusTarget.value = 'records'
    hasScrollTail.value = true
  }
})

onShow(async () => {
  if (!auth.isLoggedIn) {
    goToLogin()
    return
  }
  if (!vehicle.loadedOnce) await vehicle.load(false)
  // 先取账号注册月份，月报拉取以它为下界
  await auth.ensureProfile()
  if (vehicle.activeRef) {
    if (mode.value === 'month') await report.loadMonth(report.selectedMonth)
    else if (mode.value === 'year') await report.loadYear(report.selectedYear)
    else {
      applyRangeDefaults()
      await report.loadRange()
    }
  }
  bootstrapped.value = true
  void scrollToFocus()
})

async function scrollToFocus(): Promise<void> {
  const target = focusTarget.value
  if (!target) return
  focusTarget.value = null
  await nextTick()

  const selector =
    target === 'day' && focusDate.value
      ? `#report-day-${focusDate.value}`
      : '#report-records'
  setTimeout(() => {
    scrollToSelector(selector, target === 'day', target === 'day' ? '#report-records' : undefined)
  }, 100)
}

function scrollToSelector(
  selector: string,
  centerElement: boolean,
  fallbackSelector?: string,
): void {
  const query = uni.createSelectorQuery()
  query.select(selector).boundingClientRect()
  query.selectViewport().scrollOffset(() => {})
  query.exec((result) => {
    const rect = result?.[0] as { top?: number; height?: number } | null
    const viewport = result?.[1] as { scrollTop?: number } | null
    if (rect?.top === undefined || viewport?.scrollTop === undefined) {
      if (fallbackSelector) scrollToSelector(fallbackSelector, false)
      return
    }

    const windowHeight = uni.getWindowInfo().windowHeight
    const offsetFromTop = centerElement
      ? (windowHeight - (rect.height ?? 0)) / 2
      : windowHeight / 2 - 40
    const targetTop = Math.max(0, viewport.scrollTop + rect.top - offsetFromTop)
    uni.pageScrollTo({
      scrollTop: targetTop,
      duration: 300,
      fail: () => {
        // 页面结构尚未完成时由用户继续操作，不影响报告内容。
      },
    })
  })
}

const monthStats = computed(() => report.monthStats)
const yearStats = computed(() => report.yearStats)
const rangeStats = computed(() => report.rangeStats)
const currentMonthKey = computed(() => formatMonth(getContainer().clock.now()))
const minMonthKey = computed<MonthKey>(() => vehicle.activeRef?.bindMonth ?? '2020-01')
const pickerStart = computed(() => `${minMonthKey.value}-01`)
const pickerEnd = computed(() => `${currentMonthKey.value}-01`)
const monthPickerValue = computed(() => `${report.selectedMonth}-01`)
const rangeFromPickerValue = computed(() => `${report.rangeFrom}-01`)
const rangeToPickerValue = computed(() => `${report.rangeTo}-01`)
const summaryPeriodLabel = computed(() => {
  if (mode.value === 'month') {
    const [year, month] = report.selectedMonth.split('-')
    return `${year}年${Number(month)}月`
  }
  if (mode.value === 'year') return `${report.selectedYear}年`
  return `${report.rangeFrom.replace('-', '.')} ~ ${report.rangeTo.replace('-', '.')}`
})

function switchMode(next: Mode): void {
  mode.value = next
  if (next === 'range') {
    applyRangeDefaults()
    void report.loadRange()
    return
  }
  void load()
}

function applyRangeDefaults(): void {
  if (rangeInitialized.value) return
  report.rangeFrom = vehicle.activeRef?.bindMonth ?? addMonths(currentMonthKey.value, -5)
  report.rangeTo = currentMonthKey.value
  rangeInitialized.value = true
}

async function load(): Promise<void> {
  if (!vehicle.activeRef) return
  if (mode.value === 'month') await report.loadMonth(report.selectedMonth)
  else await report.loadYear(report.selectedYear)
}

async function shift(delta: number): Promise<void> {
  if (mode.value === 'month') {
    const next = addMonths(report.selectedMonth, delta)
    if (compareMonth(next, currentMonthKey.value) > 0) return
    await report.loadMonth(next)
    return
  }
  const nextYear = report.selectedYear + delta
  if (nextYear > getContainer().clock.now().getFullYear()) return
  await report.loadYear(nextYear)
}

/** 设计稿里的「累计里程」卡：月度显示本月合计，年度显示全年合计。 */
const summary = computed(() => {
  if (mode.value === 'month') {
    const stats = monthStats.value
    return {
      pill: summaryPeriodLabel.value,
      distanceKm: stats?.totalDistanceKm ?? null,
      triple: [
        { value: formatCount(stats?.rideDays ?? 0), label: '骑行天数' },
        { value: formatDurationShort(stats?.totalDurationSeconds ?? null), label: '骑行时长' },
        { value: formatKm(stats?.averageDistancePerRideDayKm ?? null, 1), label: '骑行日均' },
      ],
      averageSpeedKph: averageSpeed(stats?.totalDistanceKm ?? null, stats?.totalDurationSeconds ?? null),
      topSpeedKph: stats?.topSpeed?.speedKph ?? null,
      topSpeedDate: stats?.topSpeed?.date ?? null,
      longestRideDay: stats?.longestRideDay ?? null,
    }
  }
  const stats = mode.value === 'year' ? yearStats.value : rangeStats.value
  return {
    pill: summaryPeriodLabel.value,
    distanceKm: stats?.totalDistanceKm ?? null,
    triple: [
      {
        value: formatCount(mode.value === 'year' ? (yearStats.value?.rideDays ?? 0) : (rangeStats.value?.totalRideDays ?? 0)),
        label: '骑行天数',
      },
      { value: formatDurationShort(stats?.totalDurationSeconds ?? null), label: '骑行时长' },
      {
        value: formatCount(
          mode.value === 'year' ? (yearStats.value?.monthsCovered.length ?? 0) : (rangeStats.value?.monthsCovered ?? 0),
        ),
        label: '覆盖月份',
      },
    ],
    averageSpeedKph: averageSpeed(stats?.totalDistanceKm ?? null, stats?.totalDurationSeconds ?? null),
    topSpeedKph: stats?.topSpeed?.speedKph ?? null,
    topSpeedDate: stats?.topSpeed?.date ?? null,
    longestRideDay: stats?.longestRideDay ?? null,
  }
})

/** 急加速 / 急刹车 / 压弯：月报按天记录已经返回，直接汇总展示。 */
const rapidItems = computed(() => {
  const rapid =
    mode.value === 'month'
      ? monthStats.value?.rapid
      : mode.value === 'year'
        ? yearStats.value?.rapid
        : rangeStats.value?.rapid
  return [
    { value: formatCount(rapid?.acceleration ?? null), label: '急加速' },
    { value: formatCount(rapid?.deceleration ?? null), label: '急刹车' },
    { value: formatCount(rapid?.turn ?? null), label: '压弯' },
  ]
})

function averageSpeed(distanceKm: number | null, durationSeconds: number | null): number | null {
  if (distanceKm === null || durationSeconds === null || durationSeconds <= 0) return null
  return Math.round((distanceKm / (durationSeconds / 3600)) * 10) / 10
}

/** 图表：月度看每日趋势（标签按 4 天抽稀，和设计稿一致），年度看每月。 */
const chartPoints = computed(() => {
  if (mode.value === 'month') {
    return (monthStats.value?.dailyTrend ?? []).map((point) => ({
      label: String(Number(point.date.slice(-2))),
      value: point.distanceKm,
      tooltip: point.distanceKm === null ? '—' : formatKm(point.distanceKm, 1),
    }))
  }
  const trend =
    mode.value === 'year'
      ? (yearStats.value?.monthlyTrend ?? [])
      : (rangeStats.value?.monthlyTrend ?? [])
  return trend.map((point) => ({
    label: `${Number(point.month.slice(5))}月`,
    value: point.hasData ? point.distanceKm : null,
    tooltip: point.hasData && point.distanceKm !== null ? formatKm(point.distanceKm, 1) : '—',
  }))
})

watch(chartPoints, () => {
  selectedBarIndex.value = -1
})

const chartTitle = computed(() => (mode.value === 'month' ? '每日里程' : '每月里程'))

const chartSubtitle = computed(() => {
  const scope =
    mode.value === 'month'
      ? formatMonthLabel(report.selectedMonth)
      : mode.value === 'year'
        ? `${report.selectedYear} 年`
        : `${report.rangeFrom} ~ ${report.rangeTo}`
  return `${scope} · 单位 km`
})

const chartPill = computed(() => {
  const days =
    mode.value === 'month'
      ? (monthStats.value?.rideDays ?? 0)
      : mode.value === 'year'
        ? (yearStats.value?.rideDays ?? 0)
        : (rangeStats.value?.totalRideDays ?? 0)
  return `已骑行 ${days} 天`
})

const periodLabel = computed(() => {
  if (mode.value === 'month') return formatMonthLabel(report.selectedMonth)
  if (mode.value === 'year') return `${report.selectedYear} 年`
  return `${report.rangeFrom} ~ ${report.rangeTo}`
})

/**
 * 骑行记录：
 * - 月度：列出当月所有骑行日，并带上时长、均速、极速与三项安全事件；
 * - 年度/自定义区间：列出完整月度摘要，点击某个月可直接跳到该月月报。
 */
const records = computed<{ title: string; subtitle: string; rows: RecordRow[] }>(() => {
  if (mode.value === 'month') {
    const rows = [...(report.monthReport?.days ?? [])]
      .filter((day) => (day.distanceKm ?? 0) > 0 || (day.durationSeconds ?? 0) > 0)
      .sort((a, b) => (a.date < b.date ? 1 : -1))
      .map((day) => {
        const avg = averageSpeed(day.distanceKm, day.durationSeconds)
        const safety = [
          `急加速 ${formatCount(day.rapidAcceleration)}`,
          `急刹车 ${formatCount(day.rapidDeceleration)}`,
          `压弯 ${formatCount(day.rapidTurn)}`,
        ].join(' · ')
        return {
          label: formatMonthDay(day.date),
          value: formatKm(day.distanceKm, 1),
          stats: [
            formatDuration(day.durationSeconds),
            `均速 ${formatNumber(avg, 1)} km/h`,
            `极速 ${formatNumber(day.maxSpeedKph, 0)} km/h`,
          ],
          extra: safety,
          date: day.date,
        }
      })
    return {
      title: '当月骑行记录',
      subtitle: `共 ${rows.length} 天有记录 · 点击月份标题可切换月份`,
      rows,
    }
  }

  const trend =
    mode.value === 'year'
      ? (yearStats.value?.monthlyTrend ?? [])
      : (rangeStats.value?.monthlyTrend ?? [])
  const rows = [...trend]
    .filter((point) => point.hasData)
    .sort((a, b) => (a.month < b.month ? 1 : -1))
    .map((point) => ({
      label: formatMonthLabel(point.month),
      value: formatKm(point.distanceKm, 1),
      stats: [
        `${formatCount(point.rideDays ?? 0)} 天`,
        formatDurationShort(point.durationSeconds),
        `极速 ${formatNumber(point.maxSpeedKph, 0)} km/h`,
      ],
      month: point.month,
    }))
  return {
    title: mode.value === 'year' ? `${report.selectedYear} 年月度摘要` : '区间月度摘要',
    subtitle: `共 ${rows.length} 个月 · 点击月份查看月报`,
    rows,
  }
})

const loading = computed(() => report.loadingMonth || report.loadingYear || report.loadingRange)
const errorText = computed(() => report.errorMessage)
const issueText = computed(() =>
  (report.meta?.issues ?? [])
    .slice(0, 3)
    .map((issue) => issue.message)
    .join('；'),
)

function monthFromPicker(event: PickerChangeEvent): MonthKey | null {
  const value = String(event.detail.value).slice(0, 7)
  return /^\d{4}-\d{2}$/.test(value) ? (value as MonthKey) : null
}

async function onMonthPick(event: PickerChangeEvent): Promise<void> {
  const month = monthFromPicker(event)
  if (!month || compareMonth(month, currentMonthKey.value) > 0) return
  mode.value = 'month'
  await report.loadMonth(month)
}

function onRangeFromPick(event: PickerChangeEvent): void {
  const month = monthFromPicker(event)
  if (!month) return
  report.rangeFrom = month
  if (compareMonth(report.rangeFrom, report.rangeTo) > 0) report.rangeTo = month
}

function onRangeToPick(event: PickerChangeEvent): void {
  const month = monthFromPicker(event)
  if (!month) return
  report.rangeTo = month
  if (compareMonth(report.rangeFrom, report.rangeTo) > 0) report.rangeFrom = month
}

async function onRangeQuery(): Promise<void> {
  mode.value = 'range'
  applyRangeDefaults()
  await report.loadRange()
}

async function onRecordTap(row: RecordRow): Promise<void> {
  if (row.date) {
    daySheetDate.value = row.date
    return
  }
  if (!row.month) return
  mode.value = 'month'
  await report.loadMonth(row.month)
}

function openTripDetail(trip: RideHistoryItem): void {
  daySheetDate.value = null
  navigateTo(`${ROUTES.rideDetail}?id=${encodeURIComponent(trip.id)}`)
}

function onBarSelect(index: number): void {
  selectedBarIndex.value = index
}
</script>

<template>
  <view class="cf-page cf-report" @tap="selectedBarIndex = -1">
    <CfTopBlur />
    <view class="cf-report__content">
      <!-- 标题行 -->
      <view
        class="page-head"
        :style="{
          marginTop: `${safeArea.statusBarHeight}px`,
          height: `${safeArea.navBarHeight}px`,
          marginRight: `${safeArea.capsuleGap}px`,
        }"
      >
        <view class="page-head__text">
          <text class="page-head__title">骑行报告</text>
          <text class="page-head__sub">按月查看你的骑行数据</text>
        </view>
      </view>

      <StatePanel v-if="loading && !bootstrapped" status="loading" />
      <StatePanel
        v-else-if="!vehicle.activeRef"
        status="empty"
        message="还没有可用车辆"
        hint="请到车辆页刷新车辆列表"
        retry-text="去车辆页"
        @retry="goToTab(NAV_TABS[3]?.path ?? '/pages/vehicle/index')"
      />

      <template v-else>
        <!-- 周期切换 -->
        <SectionCard compact-radius>
          <view class="segment">
            <view
              class="segment__item"
              :class="{ 'segment__item--active': mode === 'month' }"
              @tap="switchMode('month')"
            >
              <text class="segment__text" :class="{ 'segment__text--active': mode === 'month' }">月度</text>
            </view>
            <view
              class="segment__item"
              :class="{ 'segment__item--active': mode === 'year' }"
              @tap="switchMode('year')"
            >
              <text class="segment__text" :class="{ 'segment__text--active': mode === 'year' }">年度</text>
            </view>
            <view
              class="segment__item"
              :class="{ 'segment__item--active': mode === 'range' }"
              @tap="switchMode('range')"
            >
              <text class="segment__text" :class="{ 'segment__text--active': mode === 'range' }">自定义</text>
            </view>
          </view>
          <view v-if="mode !== 'range'" class="switcher">
            <view class="switcher__btn" @tap="shift(-1)">
              <CfIcon name="chevron-left-primary" :size="32" />
            </view>
            <picker
              v-if="mode === 'month'"
              mode="date"
              fields="month"
              :value="monthPickerValue"
              :start="pickerStart"
              :end="pickerEnd"
              @change="onMonthPick"
            >
              <text class="switcher__label">{{ periodLabel }}</text>
            </picker>
            <text v-else class="switcher__label">{{ periodLabel }}</text>
            <view class="switcher__btn" @tap="shift(1)">
              <CfIcon name="chevron-right-primary" :size="32" />
            </view>
          </view>
          <view v-else class="range">
            <view class="range__row">
              <picker
                class="range__picker"
                mode="date"
                fields="month"
                :value="rangeFromPickerValue"
                :start="pickerStart"
                :end="pickerEnd"
                @change="onRangeFromPick"
              >
                <view class="range__field">
                  <text class="range__label">开始月份</text>
                  <text class="range__value">{{ formatMonthLabel(report.rangeFrom) }}</text>
                </view>
              </picker>
              <text class="range__sep">至</text>
              <picker
                class="range__picker"
                mode="date"
                fields="month"
                :value="rangeToPickerValue"
                :start="pickerStart"
                :end="pickerEnd"
                @change="onRangeToPick"
              >
                <view class="range__field">
                  <text class="range__label">结束月份</text>
                  <text class="range__value">{{ formatMonthLabel(report.rangeTo) }}</text>
                </view>
              </picker>
            </view>
            <view class="range__query" @tap="onRangeQuery">
              <text class="range__query-text">{{ report.loadingRange ? '统计中…' : '查看区间报告' }}</text>
            </view>
          </view>
        </SectionCard>

        <!-- 累计里程 -->
        <SectionCard>
          <view class="metric__header">
            <view class="metric__label">
              <CfIcon name="route-secondary" :size="30" />
              <text class="metric__label-text">骑行里程</text>
            </view>
            <view class="pill pill--blue">
              <text class="pill__text">{{ summary.pill }}</text>
            </view>
          </view>
          <view class="metric__value">
            <text class="metric__number">{{ formatNumber(summary.distanceKm, 1) }}</text>
            <text class="metric__unit">km</text>
          </view>
          <view class="divider" />
          <CfStatTriple :items="summary.triple" />
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
              <text class="duo__number">{{ formatNumber(summary.averageSpeedKph, 1) }}</text>
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
              <text class="duo__number">{{ formatSpeed(summary.topSpeedKph, 0).replace(' km/h', '') }}</text>
              <text class="duo__unit">km/h</text>
            </view>
            <text class="duo__hint">
              {{ summary.topSpeedDate ? `${formatMonthDay(summary.topSpeedDate)} 记录` : '暂无记录' }}
            </text>
          </view>
          <view class="duo__card duo__card--cream">
            <view class="duo__head">
              <CfIcon name="route-secondary" :size="28" />
              <text class="duo__label">单日最远</text>
            </view>
            <view class="duo__value">
              <text class="duo__number">{{ formatNumber(summary.longestRideDay?.distanceKm ?? null, 1) }}</text>
              <text class="duo__unit">km</text>
            </view>
            <text class="duo__hint">
              {{ summary.longestRideDay ? formatMonthDay(summary.longestRideDay.date) : '暂无记录' }}
            </text>
          </view>
        </view>

        <!-- 里程图表 -->
        <SectionCard :title="chartTitle" :subtitle="chartSubtitle" compact-radius>
          <template #right>
            <CfStatusChip :label="chartPill" tone="mint" />
          </template>
          <CfBarChart
            id="report-chart"
            :points="chartPoints"
            :label-every="mode === 'month' ? 4 : 1"
            :selected-index="selectedBarIndex"
            @select="onBarSelect"
          />
        </SectionCard>

        <!-- 骑行记录 -->
        <SectionCard
          id="report-records"
          :title="records.title"
          :subtitle="records.subtitle"
          compact-radius>
          <view v-if="records.rows.length === 0" class="empty">
            <text class="empty__text">
              {{
                mode === 'month'
                  ? `${formatMonthLabel(report.selectedMonth)}还没有骑行记录`
                  : mode === 'year'
                    ? `${report.selectedYear} 年还没有可统计的月份数据`
                    : '所选区间没有可统计的月份数据'
              }}
            </text>
          </view>
          <view v-else class="rows">
            <view
              v-for="(row, index) in records.rows"
              :key="row.label"
              :id="row.date ? `report-day-${row.date}` : undefined"
              class="rows__item"
              :class="{ 'rows__item--tappable': !!row.month || !!row.date }"
              @tap="onRecordTap(row)"
            >
              <view v-if="index > 0" class="divider" />
              <view class="rows__line">
                <text class="rows__label">{{ row.label }}</text>
                <view class="rows__right">
                  <text class="rows__value">{{ row.value }}</text>
                </view>
              </view>
              <view class="rows__stats">
                <text v-for="stat in row.stats" :key="stat" class="rows__meta">{{ stat }}</text>
              </view>
              <text v-if="row.extra" class="rows__extra">{{ row.extra }}</text>
            </view>
          </view>
        </SectionCard>

        <StatePanel
          v-if="errorText"
          status="error"
          :message="errorText"
          retry-text="重试"
          @retry="load"
        />
        <StatePanel
          v-else-if="issueText"
          status="partial"
          :message="issueText"
          hint="部分月份暂未获取，合计已排除缺失数据"
          retry-text="刷新"
          @retry="load"
        />
        <text v-else-if="mode === 'month' && monthStats?.inProgress" class="footnote">
          当前月份数据统计至今日。
        </text>
        <view v-if="hasScrollTail" class="scroll-tail" />
      </template>
    </view>

    <RideDaySheet
      :visible="daySheetDate !== null"
      :date="daySheetDate"
      @close="daySheetDate = null"
      @select="openTripDetail"
    />

    <CfTabBar current="report" :items="NAV_TABS" @select="goToTab" />
  </view>
</template>

<style>
.cf-report {
  padding: 0;
}

.cf-report__content {
  display: flex;
  flex-direction: column;
  gap: var(--cf-space-gap);
  padding: 0 var(--cf-space-page) 200rpx;
}

.scroll-tail {
  height: 50vh;
  flex-shrink: 0;
}

.page-head {
  display: flex;
  flex-direction: row;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 20rpx;
}

.page-head__text {
  display: flex;
  flex-direction: column;
  gap: 10rpx;
  /* 标题本身与胶囊中心对齐；副标题向标题下方自然延伸。 */
  transform: translateY(20rpx);
}

.page-head__title {
  font-size: 44rpx;
  font-weight: 700;
  line-height: 1.3;
  color: var(--cf-text-1);
}

.page-head__sub {
  font-size: 24rpx;
  line-height: 1.4;
  color: var(--cf-text-2);
}

/* 周期切换 */
.segment {
  height: 76rpx;
  border-radius: var(--cf-radius-pill);
  background-color: var(--cf-bg-soft);
  padding: 6rpx;
  box-sizing: border-box;
  display: flex;
  flex-direction: row;
  align-items: center;
}

.segment__item {
  flex: 1;
  height: 64rpx;
  border-radius: var(--cf-radius-pill);
  display: flex;
  align-items: center;
  justify-content: center;
}

.segment__item--active {
  background-color: var(--cf-bg-card);
}

.segment__text {
  font-size: 24rpx;
  color: var(--cf-text-2);
}

.segment__text--active {
  font-weight: 600;
  color: var(--cf-text-1);
}

.switcher {
  display: flex;
  flex-direction: row;
  align-items: center;
  justify-content: space-between;
}

.switcher__btn {
  width: 64rpx;
  height: 64rpx;
  border-radius: var(--cf-radius-pill);
  background-color: var(--cf-blue-soft);
  display: flex;
  align-items: center;
  justify-content: center;
}

.switcher__label {
  font-size: 30rpx;
  font-weight: 600;
  color: var(--cf-text-1);
}

/* 自定义月份区间 */
.range {
  display: flex;
  flex-direction: column;
  gap: 20rpx;
}

.range__row {
  display: flex;
  flex-direction: row;
  align-items: flex-end;
  gap: 16rpx;
}

.range__picker {
  flex: 1;
  min-width: 0;
}

.range__field {
  display: flex;
  flex-direction: column;
  gap: 8rpx;
  padding: 20rpx 24rpx;
  border-radius: 24rpx;
  background-color: var(--cf-bg-soft);
}

.range__label {
  font-size: 20rpx;
  color: var(--cf-text-3);
}

.range__value {
  font-size: 24rpx;
  font-weight: 600;
  color: var(--cf-text-1);
  white-space: nowrap;
}

.range__sep {
  font-size: 22rpx;
  color: var(--cf-text-3);
  padding-bottom: 28rpx;
}

.range__query {
  height: 76rpx;
  border-radius: var(--cf-radius-pill);
  background-color: var(--cf-blue-deep);
  display: flex;
  align-items: center;
  justify-content: center;
}

.range__query-text {
  font-size: 26rpx;
  font-weight: 600;
  color: #ffffff;
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

.metric__note {
  font-size: 22rpx;
  line-height: 1.5;
  color: var(--cf-text-2);
}

.pill {
  height: 48rpx;
  border-radius: var(--cf-radius-pill);
  padding: 0 20rpx;
  display: flex;
  align-items: center;
  justify-content: center;
}

.pill--blue {
  background-color: var(--cf-blue-soft);
}

.pill__text {
  font-size: 22rpx;
  color: var(--cf-text-2);
}

/* 平均/最高速度双卡 */
.duo {
  display: flex;
  flex-direction: row;
  gap: 16rpx;
  align-items: stretch;
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

/* 记录列表 */
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

.rows__item--tappable:active {
  opacity: 0.65;
}

.rows__line {
  display: flex;
  flex-direction: row;
  align-items: center;
  justify-content: space-between;
}

.rows__label {
  font-size: 26rpx;
  font-weight: 500;
  color: var(--cf-text-1);
  white-space: nowrap;
  flex-shrink: 0;
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

.rows__stats {
  display: flex;
  flex-direction: row;
  flex-wrap: wrap;
  gap: 10rpx 24rpx;
}

.rows__extra {
  font-size: 20rpx;
  line-height: 1.4;
  color: var(--cf-text-3);
}

.empty {
  padding: 16rpx 0;
}

.empty__text {
  font-size: 24rpx;
  color: var(--cf-text-3);
}

.footnote {
  font-size: 22rpx;
  line-height: 1.6;
  color: var(--cf-text-3);
}
</style>
