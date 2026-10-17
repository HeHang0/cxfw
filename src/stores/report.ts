import { computed, ref } from 'vue'
import { defineLiteStore } from './lite'
import { toAppError, userFacingMessage, type AppError } from '@/core/application/errors'
import type { ResultMeta } from '@/core/application/results'
import { addMonths, compareMonth, formatMonth } from '@/core/domain/datetime'
import type { MonthKey } from '@/core/domain/identifiers'
import type { MonthlyStatistics, YearlyStatistics, LifetimeStatistics, MonthlyTrendPoint } from '@/core/domain/statistics/types'
import type { MonthRideReport } from '@/core/domain/models'
import { getContainer } from '@/services/container'

/**
 * 报告数据（月报 / 年报 / 历史总报告 / 总览）。
 *
 * 所有取数都经过 ReportService，页面不直接访问数据源或本地存储。
 */

export const useReportStore = defineLiteStore(() => {
  const selectedMonth = ref<MonthKey>(formatMonth(getContainer().clock.now()))
  const selectedYear = ref<number>(getContainer().clock.now().getFullYear())
  const rangeFrom = ref<MonthKey>(addMonths(formatMonth(getContainer().clock.now()), -5))
  const rangeTo = ref<MonthKey>(formatMonth(getContainer().clock.now()))

  const monthReport = ref<MonthRideReport | null>(null)
  const monthStats = ref<MonthlyStatistics | null>(null)
  const yearStats = ref<YearlyStatistics | null>(null)
  const rangeStats = ref<LifetimeStatistics | null>(null)
  const lifetimeStats = ref<LifetimeStatistics | null>(null)
  const recentMonths = ref<MonthlyTrendPoint[]>([])
  const lastSyncedAt = ref<string | null>(null)

  const loadingMonth = ref(false)
  const loadingYear = ref(false)
  const loadingRange = ref(false)
  const loadingLifetime = ref(false)
  const loadingOverview = ref(false)
  const enriching = ref(false)

  const error = ref<AppError | null>(null)
  const meta = ref<ResultMeta | null>(null)

  const errorMessage = computed(() => (error.value ? userFacingMessage(error.value) : null))
  const hasAnyData = computed(
    () => monthStats.value !== null || yearStats.value !== null || lifetimeStats.value !== null,
  )

  async function loadMonth(month: MonthKey, options: { force?: boolean } = {}): Promise<void> {
    const ref_ = requireRef()
    if (!ref_) return
    selectedMonth.value = month
    loadingMonth.value = true
    error.value = null
    try {
      const result = await getContainer().reportService.getMonthReport(ref_, month, options)
      monthReport.value = result.data?.report ?? null
      monthStats.value = result.data?.statistics ?? null
      meta.value = result.meta
      error.value = result.status === 'error' ? result.error : null
    } catch (caught) {
      error.value = toAppError(caught)
    } finally {
      loadingMonth.value = false
    }
  }

  async function loadYear(year: number, options: { force?: boolean; fetchMissing?: boolean } = {}): Promise<void> {
    const ref_ = requireRef()
    if (!ref_) return
    selectedYear.value = year
    loadingYear.value = true
    error.value = null
    try {
      const result = await getContainer().reportService.getYearReport(ref_, year, options)
      yearStats.value = result.data?.statistics ?? null
      meta.value = result.meta
      error.value = result.status === 'error' ? result.error : null
    } catch (caught) {
      error.value = toAppError(caught)
    } finally {
      loadingYear.value = false
    }
  }

  async function loadRange(
    options: { force?: boolean; fetchMissing?: boolean } = {},
  ): Promise<void> {
    const ref_ = requireRef()
    if (!ref_) return
    // 万一用户先选了结束月份再改开始月份，这里自动纠正，避免发出无效请求。
    if (compareMonth(rangeFrom.value, rangeTo.value) > 0) {
      const swap = rangeFrom.value
      rangeFrom.value = rangeTo.value
      rangeTo.value = swap
    }
    loadingRange.value = true
    error.value = null
    try {
      const result = await getContainer().reportService.getRangeReport(
        ref_,
        rangeFrom.value,
        rangeTo.value,
        options,
      )
      rangeStats.value = result.data?.statistics ?? null
      if (result.data?.range) {
        rangeFrom.value = result.data.range.from
        rangeTo.value = result.data.range.to
      }
      meta.value = result.meta
      error.value = result.status === 'error' ? result.error : null
    } catch (caught) {
      error.value = toAppError(caught)
    } finally {
      loadingRange.value = false
    }
  }

  async function loadLifetime(options: { force?: boolean; fetchMissing?: boolean } = {}): Promise<void> {
    const ref_ = requireRef()
    if (!ref_) return
    loadingLifetime.value = true
    error.value = null
    try {
      const result = await getContainer().reportService.getLifetimeReport(ref_, options)
      lifetimeStats.value = result.data?.statistics ?? null
      meta.value = result.meta
      error.value = result.status === 'error' ? result.error : null
    } catch (caught) {
      error.value = toAppError(caught)
    } finally {
      loadingLifetime.value = false
    }
  }

  async function loadOverview(options: { force?: boolean } = {}): Promise<void> {
    const ref_ = requireRef()
    if (!ref_) return
    loadingOverview.value = true
    error.value = null
    try {
      const result = await getContainer().reportService.getOverview(ref_, options)
      if (result.data) {
        lifetimeStats.value = result.data.lifetime
        monthStats.value = result.data.currentMonth
        recentMonths.value = [...result.data.recentMonths]
        lastSyncedAt.value = result.data.lastSyncedAt
      }
      meta.value = result.meta
      error.value = result.status === 'error' ? result.error : null
    } catch (caught) {
      error.value = toAppError(caught)
    } finally {
      loadingOverview.value = false
    }
  }

  /** 用单日统计补齐急加速/急减速/急转弯（官方只有单日接口提供）。 */
  async function enrichRapidEvents(month: MonthKey): Promise<void> {
    const ref_ = requireRef()
    if (!ref_) return
    enriching.value = true
    error.value = null
    try {
      const result = await getContainer().reportService.enrichRapidEvents(ref_, month)
      monthReport.value = result.data?.report ?? monthReport.value
      monthStats.value = result.data?.statistics ?? monthStats.value
      meta.value = result.meta
      error.value = result.status === 'error' ? result.error : null
    } catch (caught) {
      error.value = toAppError(caught)
    } finally {
      enriching.value = false
    }
  }

  function requireRef() {
    const ref_ = getContainer().vehicleService.getActiveRef()
    if (!ref_) {
      error.value = toAppError(new Error('尚未选择车辆，请先到车辆页刷新车辆列表'))
      return null
    }
    return ref_
  }

  function setMonth(month: MonthKey): void {
    selectedMonth.value = month
  }

  function setYear(year: number): void {
    selectedYear.value = year
  }

  return {
    selectedMonth,
    selectedYear,
    rangeFrom,
    rangeTo,
    monthReport,
    monthStats,
    yearStats,
    rangeStats,
    lifetimeStats,
    recentMonths,
    lastSyncedAt,
    loadingMonth,
    loadingYear,
    loadingRange,
    loadingLifetime,
    loadingOverview,
    enriching,
    error,
    meta,
    errorMessage,
    hasAnyData,
    loadMonth,
    loadYear,
    loadRange,
    loadLifetime,
    loadOverview,
    enrichRapidEvents,
    setMonth,
    setYear,
  }
})
