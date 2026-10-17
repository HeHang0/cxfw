<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { onShow } from '@dcloudio/uni-app'
import CfIcon from '@/components/CfIcon.vue'
import SectionCard from '@/components/SectionCard.vue'
import StatePanel from '@/components/StatePanel.vue'
import { useAuthStore } from '@/stores/auth'
import { useFuelStore } from '@/stores/fuel'
import { useVehicleStore } from '@/stores/vehicle'
import { useSafeArea } from '@/composables/useSafeArea'
import { formatDate, formatMonth, pad2 } from '@/core/domain/datetime'
import type { DateKey } from '@/core/domain/identifiers'
import { CHINA_PROVINCES, matchProvinceFromAddress } from '@/core/domain/provinces'
import type { FuelPriceQuote } from '@/core/contracts/FuelPriceDataSource'
import { FUEL_GRADES, priceForGrade, type FuelGrade } from '@/core/domain/fuelPrice'
import { getContainer } from '@/services/container'
import { formatNumber } from '@/utils/format'
import { exportJsonFile, readJsonFile } from '@/utils/jsonFile'
import { goToLogin, navigateTo, ROUTES, showToast } from '@/utils/navigation'
import { readInputValue } from '@/utils/uni-events'

const auth = useAuthStore()
const fuel = useFuelStore()
const vehicle = useVehicleStore()
const safeArea = useSafeArea()
const now = getContainer().clock.now()
const dateOptions = Array.from({ length: 1096 }, (_, index) =>
  formatDate(new Date(now.getTime() - (1095 - index) * 24 * 60 * 60 * 1000)),
)
const timeOptions = Array.from({ length: 288 }, (_, index) => {
  const hour = Math.floor(index / 12)
  const minute = (index % 12) * 5
  return `${pad2(hour)}:${pad2(minute)}`
})
const dateTimeRange = [dateOptions, timeOptions]
const initialTimeIndex = now.getHours() * 12 + Math.floor(now.getMinutes() / 5)
const dateTimeIndex = ref<[number, number]>([dateOptions.length - 1, initialTimeIndex])
const selectedDate = computed<DateKey>(() => dateOptions[dateTimeIndex.value[0]] as DateKey)
const selectedTime = computed(() => timeOptions[dateTimeIndex.value[1]] ?? '00:00')
const selectedDateTime = computed(() => `${selectedDate.value} ${selectedTime.value}`)
const liters = ref('')
const priceAmount = ref('')
const unitPrice = ref('')
const gradeIndex = ref(FUEL_GRADES.indexOf('95#'))
const provinceIndex = ref(0)
const provinceInitialized = ref(false)
const priceLoading = ref(false)
const priceQuote = ref<FuelPriceQuote | null>(null)
const importing = ref(false)
const exporting = ref(false)
const capacityInput = ref('')

onShow(async () => {
  if (!auth.isLoggedIn) {
    goToLogin()
    return
  }
  if (vehicle.activeRef && vehicle.telemetry === null) await vehicle.loadTelemetry()
  if (!provinceInitialized.value) {
    const matched = matchProvinceFromAddress(vehicle.telemetry?.recentRide?.endAddress)
    const index = CHINA_PROVINCES.findIndex((province) => province.name === matched)
    if (index >= 0) provinceIndex.value = index
    provinceInitialized.value = true
  }
  await fuel.load(undefined, {
    totalMileageKm: vehicle.telemetry?.totalMileageKm ?? null,
    remainingOil: vehicle.telemetry?.remainingOil ?? null,
    totalOilSegments: vehicle.telemetry?.totalOilSegments ?? null,
    vehicleTypeName: vehicle.telemetry?.vehicleTypeName ?? null,
  })
  capacityInput.value = String(fuel.tankCapacity)
})

const monthLabel = computed(() => {
  const [year, month] = formatMonth(getContainer().clock.now()).split('-')
  return `${year} 年 ${Number(month)} 月`
})

const consumptionText = computed(() => {
  const value = fuel.view?.monthConsumptionLPer100Km
  return value === null || value === undefined ? '—' : `${formatNumber(value, 2)} L`
})

const sourceText = computed(() => {
  if (fuel.view?.source === 'official') return '官方油耗'
  if (fuel.view?.source === 'manual') return '手动加油记录估算'
  return '暂无油耗数据'
})

const consumptionSubline = computed(() => {
  const view = fuel.view
  if (view?.latestDaily?.lPer100Km !== null && view?.latestDaily?.lPer100Km !== undefined) {
    return `最近一天 ${view.latestDaily.date}：${formatNumber(view.latestDaily.lPer100Km, 2)} L`
  }
  if (
    view?.historicalConsumptionLPer100Km !== null &&
    view?.historicalConsumptionLPer100Km !== undefined
  ) {
    return `历史油耗：${formatNumber(view.historicalConsumptionLPer100Km, 2)} L`
  }
  return ''
})

const canAdd = computed(() => Number(liters.value) > 0 && Number(liters.value) <= 100)
const provinceName = computed(() => CHINA_PROVINCES[provinceIndex.value]?.name ?? '江苏')
const fuelGrade = computed<FuelGrade>(() => FUEL_GRADES[gradeIndex.value] ?? '92#')

function onDateTimeChange(event: { detail: { value: Array<string | number> } }): void {
  dateTimeIndex.value = [Number(event.detail.value[0]) || 0, Number(event.detail.value[1]) || 0]
  priceQuote.value = null
  unitPrice.value = ''
}

function onGradeChange(event: { detail: { value: string | number } }): void {
  gradeIndex.value = Number(event.detail.value) || 0
  const price = priceForGrade(priceQuote.value, fuelGrade.value)
  unitPrice.value = price === null ? '' : price.toFixed(2)
}

function onLitersInput(event: unknown): void {
  liters.value = readInputValue(event).replace(/[^\d.]/g, '')
}

function onPriceInput(event: unknown): void {
  priceAmount.value = readInputValue(event).replace(/[^\d.]/g, '')
}

function onUnitPriceInput(event: unknown): void {
  unitPrice.value = readInputValue(event).replace(/[^\d.]/g, '')
  priceQuote.value = null
}

function onProvinceChange(event: { detail: { value: string | number } }): void {
  provinceIndex.value = Number(event.detail.value) || 0
  priceQuote.value = null
  unitPrice.value = ''
}

async function onLookupPrice(): Promise<void> {
  priceLoading.value = true
  try {
    const quote = await fuel.lookupPrice(provinceName.value, selectedDate.value)
    const price = priceForGrade(quote, fuelGrade.value)
    if (!quote || price === null) {
      priceQuote.value = null
      showToast('该日期附近暂无油价数据', 'none')
      return
    }
    priceQuote.value = quote
    unitPrice.value = price.toFixed(2)
    showToast(`已查询 ${fuelGrade.value} ${price.toFixed(2)} 元/L`, 'none')
  } finally {
    priceLoading.value = false
  }
}

function recalculateLiters(): void {
  const amount = Number(priceAmount.value)
  const price = Number(unitPrice.value)
  if (Number.isFinite(amount) && amount > 0 && Number.isFinite(price) && price > 0) {
    liters.value = (amount / price).toFixed(2)
  }
}

watch([priceAmount, unitPrice], recalculateLiters)

async function onAdd(): Promise<void> {
  if (!canAdd.value) {
    showToast('请输入 0–100 L 的加油量，最多两位小数', 'none')
    return
  }
  const amount = Number(priceAmount.value)
  const price = Number(unitPrice.value)
  const ok = fuel.add({
    refueledAt: selectedDateTime.value,
    liters: Number(liters.value),
    price: Number.isFinite(amount) && amount > 0 ? amount : null,
    grade: Number.isFinite(price) && price > 0 ? fuelGrade.value : null,
  })
  if (!ok) {
    showToast(fuel.errorMessage ?? '保存失败', 'none')
    return
  }
  liters.value = ''
  priceAmount.value = ''
  unitPrice.value = ''
  priceQuote.value = null
  await fuel.load()
  showToast('加油记录已保存', 'success')
}

function onCapacityInput(event: unknown): void {
  capacityInput.value = readInputValue(event).replace(/[^\d.]/g, '')
}

async function onSaveCapacity(): Promise<void> {
  if (!fuel.setTankCapacity(Number(capacityInput.value))) {
    showToast(fuel.errorMessage ?? '油箱容量保存失败', 'none')
    return
  }
  await fuel.load()
  capacityInput.value = String(fuel.tankCapacity)
  showToast('油箱容量已保存', 'success')
}

function onRemove(id: string): void {
  fuel.remove(id)
  void fuel.load()
}

async function onImport(): Promise<void> {
  importing.value = true
  try {
    const payload = await readJsonFile()
    const result = fuel.importJson(payload)
    if (!result) {
      showToast(fuel.errorMessage ?? '导入失败', 'none')
      return
    }
    await fuel.load()
    showToast(`已导入 ${result.imported} 条，共 ${result.total} 条`, 'success')
  } catch (error) {
    showToast(error instanceof Error ? error.message : '导入失败', 'none')
  } finally {
    importing.value = false
  }
}

async function onExport(): Promise<void> {
  exporting.value = true
  try {
    const payload = fuel.exportPayload()
    if (!payload) {
      showToast(fuel.errorMessage ?? '导出失败', 'none')
      return
    }
    const result = await exportJsonFile(`cfmoto-refuels-${formatDate(getContainer().clock.now())}.json`, payload)
    showToast(
      result === 'copied'
        ? '当前环境不支持分享文件，JSON 已复制到剪贴板'
        : result === 'downloaded'
          ? 'JSON 文件已下载'
          : '加油记录已导出',
      'success',
    )
  } catch (error) {
    showToast(error instanceof Error ? error.message : '导出失败', 'none')
  } finally {
    exporting.value = false
  }
}

function goBack(): void {
  navigateTo(ROUTES.vehicle)
}

function recordPriceText(record: { price: number | null; grade: string | null }): string {
  const parts = ['加油记录']
  if (record.price !== null) parts.push(`${formatNumber(record.price, 2)} 元`)
  if (record.grade) parts.push(record.grade)
  return parts.join(' · ')
}
</script>

<template>
  <view class="cf-page cf-fuel">
    <view class="cf-fuel__content">
      <view
        class="page-head"
        :style="{
          marginTop: `${safeArea.statusBarHeight}px`,
          height: `${safeArea.navBarHeight}px`,
          marginRight: `${safeArea.capsuleGap}px`,
        }"
      >
        <view class="page-head__title-row">
          <view class="back" @tap="goBack">
            <CfIcon name="chevron-left-primary" :size="32" />
          </view>
          <text class="page-head__title">油耗与加油记录</text>
        </view>
      </view>

      <SectionCard compact-radius>
        <view class="fuel-summary">
          <view class="fuel-summary__top">
            <text class="fuel-summary__month">{{ monthLabel }}</text>
            <text class="fuel-summary__source">{{ sourceText }}</text>
          </view>
          <view class="fuel-summary__value-row">
            <text class="fuel-summary__value">{{ consumptionText }}</text>
            <text class="fuel-summary__unit">本月油耗</text>
          </view>
          <text v-if="consumptionSubline" class="note">{{ consumptionSubline }}</text>
          <text v-else-if="fuel.view?.unsupportedByVehicle" class="note">
            当前车辆未上报油耗，已使用手动加油记录估算。
          </text>
          <view class="fuel-summary__manual">
            <text class="note">手动记录 {{ fuel.records.length }} 条</text>
            <text class="note">
              累计估算 {{ fuel.view?.manualTotalLiters === null || fuel.view?.manualTotalLiters === undefined ? '—' : `${formatNumber(fuel.view.manualTotalLiters, 2)} L` }}
            </text>
          </view>
        </view>
      </SectionCard>

      <SectionCard
        title="油箱容量"
        :subtitle="`默认 ${fuel.tankCapacity} L${vehicle.telemetry?.vehicleTypeName ? ` · ${vehicle.telemetry.vehicleTypeName}` : ''}`"
        compact-radius
      >
        <view class="capacity">
          <input
            class="capacity__input"
            type="digit"
            :value="capacityInput"
            placeholder="12"
            placeholder-class="field__placeholder"
            @input="onCapacityInput"
          />
          <text class="capacity__unit">L</text>
          <view class="capacity__save" @tap="onSaveCapacity">
            <text class="capacity__save-text">保存</text>
          </view>
        </view>
      </SectionCard>

      <SectionCard title="添加加油记录" subtitle="日期与时间精确到分钟，可一天添加多次" compact-radius>
        <view class="form">
          <view class="form__row form__row--main">
            <view class="form-slot form-slot--province">
              <picker mode="selector" :range="CHINA_PROVINCES" range-key="name" :value="provinceIndex" @change="onProvinceChange">
                <view class="field">
                  <text class="field__label">省份</text>
                  <text class="field__value">{{ provinceName }}</text>
                </view>
              </picker>
            </view>
            <view class="form-slot form-slot--datetime">
              <picker mode="multiSelector" :range="dateTimeRange" :value="dateTimeIndex" @change="onDateTimeChange">
                <view class="field">
                  <text class="field__label">日期时间</text>
                  <text class="field__value field__value--datetime">{{ selectedDateTime }}</text>
                </view>
              </picker>
            </view>
            <view class="price-query" @tap="onLookupPrice">
              <text class="price-query__text">{{ priceLoading ? '查询中…' : '查询油价' }}</text>
            </view>
          </view>
          <view class="form__row form__row--details">
            <view class="form-slot">
              <picker mode="selector" :range="FUEL_GRADES" :value="gradeIndex" @change="onGradeChange">
                <view class="field">
                  <text class="field__label">汽油</text>
                  <text class="field__value">{{ fuelGrade }}</text>
                </view>
              </picker>
            </view>
            <view class="field field--unit-price">
              <text class="field__label">油价（元/L）</text>
              <input
                class="field__input"
                type="digit"
                :value="unitPrice"
                placeholder="如 8.58"
                placeholder-class="field__placeholder"
                @input="onUnitPriceInput"
              />
            </view>
            <view class="field field--price">
              <text class="field__label">金额（元）</text>
              <input
                class="field__input"
                type="digit"
                :value="priceAmount"
                placeholder="如 100"
                placeholder-class="field__placeholder"
                @input="onPriceInput"
              />
            </view>
            <view class="field field--liters">
              <text class="field__label">油量（L）</text>
              <input
                class="field__input"
                type="digit"
                :value="liters"
                placeholder="如 12.35"
                placeholder-class="field__placeholder"
                @input="onLitersInput"
              />
            </view>
          </view>
          <view class="submit" :class="{ 'submit--disabled': !canAdd }" @tap="onAdd">
            <text class="submit__text">保存加油记录</text>
          </view>
        </view>
      </SectionCard>

      <SectionCard title="加油记录" :subtitle="`共 ${fuel.records.length} 条`" compact-radius>
        <template #right>
          <view class="record-actions">
            <view class="record-action" @tap="onImport">
              <text class="record-action__text">{{ importing ? '导入中' : '导入' }}</text>
            </view>
            <view
              v-if="fuel.records.length > 0"
              class="record-action record-action--primary"
              @tap="onExport"
            >
              <text class="record-action__text record-action__text--primary">{{ exporting ? '导出中' : '导出' }}</text>
            </view>
          </view>
        </template>
        <view v-if="fuel.records.length === 0" class="empty">
          <text class="empty__text">还没有手动加油记录</text>
        </view>
        <view v-else class="records">
          <view v-for="(record, index) in fuel.records" :key="record.time" class="record">
            <view v-if="index > 0" class="divider" />
            <view class="record__line">
              <view class="record__left">
                <text class="record__date">{{ record.time.slice(0, 16) }}</text>
                <text class="record__hint">{{ recordPriceText(record) }}</text>
              </view>
              <view class="record__right">
                <text class="record__liters">{{ record.liters.toFixed(2) }} L</text>
                <text class="record__delete" @tap.stop="onRemove(record.time)">删除</text>
              </view>
            </view>
          </view>
        </view>
        <text class="note">导入时相同日期和时间的记录会覆盖原记录。</text>
        <StatePanel v-if="fuel.errorMessage" status="error" :message="fuel.errorMessage" />
        <StatePanel v-else-if="fuel.loading" status="loading" />
      </SectionCard>
    </view>
  </view>
</template>

<style>
.cf-fuel {
  padding: 0;
}

.cf-fuel__content {
  display: flex;
  flex-direction: column;
  gap: var(--cf-space-gap);
  padding: 0 var(--cf-space-page) 80rpx;
}

.page-head {
  display: flex;
  flex-direction: row;
  align-items: center;
}

.page-head__title-row {
  display: flex;
  flex-direction: row;
  align-items: center;
  gap: 14rpx;
}

.page-head__title {
  font-size: 40rpx;
  font-weight: 700;
  color: var(--cf-text-1);
}

.back {
  width: 52rpx;
  height: 52rpx;
  display: flex;
  align-items: center;
  justify-content: center;
}

.fuel-summary {
  display: flex;
  flex-direction: column;
  gap: 18rpx;
}

.fuel-summary__top,
.fuel-summary__manual {
  display: flex;
  flex-direction: row;
  align-items: center;
  justify-content: space-between;
}

.fuel-summary__month {
  font-size: 26rpx;
  color: var(--cf-text-2);
}

.fuel-summary__source {
  font-size: 22rpx;
  color: var(--cf-text-2);
}

.fuel-summary__value-row {
  display: flex;
  flex-direction: row;
  align-items: flex-end;
  gap: 14rpx;
}

.fuel-summary__value {
  font-size: 64rpx;
  font-weight: 700;
  line-height: 1;
  color: var(--cf-text-1);
}

.fuel-summary__unit {
  font-size: 24rpx;
  color: var(--cf-text-2);
  padding-bottom: 6rpx;
}

.capacity {
  display: flex;
  flex-direction: row;
  align-items: center;
  gap: 12rpx;
}

.capacity__input {
  flex: 1;
  height: 72rpx;
  padding: 0 24rpx;
  box-sizing: border-box;
  border-radius: 22rpx;
  background-color: var(--cf-bg-soft);
  font-size: 26rpx;
  color: var(--cf-text-1);
}

.capacity__unit {
  font-size: 24rpx;
  color: var(--cf-text-2);
}

.capacity__save {
  height: 72rpx;
  padding: 0 28rpx;
  border-radius: 22rpx;
  background-color: var(--cf-blue-deep);
  display: flex;
  align-items: center;
  justify-content: center;
}

.capacity__save-text {
  font-size: 24rpx;
  font-weight: 600;
  color: #ffffff;
}

.form {
  display: flex;
  flex-direction: column;
  gap: 24rpx;
}

.form__row {
  display: flex;
  flex-direction: row;
  gap: 10rpx;
}

.form__row--main {
  align-items: stretch;
  gap: 18rpx;
}

.form-slot {
  flex: 1;
  min-width: 0;
  display: flex;
}

.form-slot picker {
  width: 100%;
}

.form-slot--province {
  flex: 1;
}

.form-slot--datetime {
  flex: 2;
}

.form-slot .field {
  flex: 1;
  width: 100%;
  box-sizing: border-box;
}

.form__row--details > .form-slot {
  flex: 1 1 0;
  width: 0;
  max-width: none;
  min-width: 0;
}

.form__row--details > .field {
  flex: 1 1 0;
  width: 0;
  max-width: none;
  min-width: 0;
}

.form__row--details .field {
  min-height: 118rpx;
  justify-content: center;
  padding-left: 12rpx;
  padding-right: 12rpx;
}

.form__row--details .field__label {
  font-size: 18rpx;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.form__row--details .field__value,
.form__row--details .field__input {
  font-size: 22rpx;
}

.field {
  min-width: 0;
  flex: 1;
  overflow: hidden;
  box-sizing: border-box;
  display: flex;
  flex-direction: column;
  gap: 8rpx;
  padding: 18rpx 20rpx;
  border-radius: 22rpx;
  background-color: var(--cf-bg-soft);
}

.field__label {
  font-size: 20rpx;
  color: var(--cf-text-3);
}

.field__value,
.field__input {
  width: 100%;
  height: 42rpx;
  font-size: 24rpx;
  color: var(--cf-text-1);
  box-sizing: border-box;
}

.field__value--datetime {
  font-size: 21rpx;
  white-space: nowrap;
}

.field__placeholder {
  color: var(--cf-text-3);
}

.price-query {
  flex: 1;
  min-width: 0;
  min-height: 78rpx;
  border-radius: 22rpx;
  background-color: var(--cf-blue-soft);
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 10rpx;
  box-sizing: border-box;
}

.price-query__text {
  font-size: 20rpx;
  font-weight: 600;
  color: var(--cf-blue-deep);
  text-align: center;
}

.submit {
  height: 76rpx;
  border-radius: var(--cf-radius-pill);
  background-color: var(--cf-blue-deep);
  display: flex;
  align-items: center;
  justify-content: center;
}

.submit--disabled {
  opacity: 0.55;
}

.submit__text {
  font-size: 26rpx;
  font-weight: 600;
  color: #ffffff;
}

.records {
  display: flex;
  flex-direction: column;
  gap: 22rpx;
}

.record {
  display: flex;
  flex-direction: column;
  gap: 20rpx;
}

.record__line {
  display: flex;
  flex-direction: row;
  align-items: center;
  justify-content: space-between;
}

.record__left,
.record__right {
  display: flex;
  flex-direction: column;
  gap: 6rpx;
}

.record__right {
  align-items: flex-end;
}

.record__date {
  font-size: 24rpx;
  font-weight: 500;
  color: var(--cf-text-1);
}

.record__hint {
  font-size: 20rpx;
  color: var(--cf-text-3);
}

.record__liters {
  font-size: 26rpx;
  font-weight: 600;
  color: var(--cf-text-1);
}

.record__delete {
  font-size: 20rpx;
  color: var(--cf-danger);
}

.record-actions {
  display: flex;
  flex-direction: row;
  gap: 10rpx;
}

.record-action {
  width: 82rpx;
  height: 44rpx;
  border-radius: var(--cf-radius-pill);
  background-color: var(--cf-bg-soft);
  display: flex;
  align-items: center;
  justify-content: center;
}

.record-action--primary {
  background-color: var(--cf-blue-deep);
}

.record-action__text {
  font-size: 22rpx;
  color: var(--cf-text-1);
}

.record-action__text--primary {
  color: #ffffff;
}

.note {
  font-size: 21rpx;
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

.divider {
  width: 100%;
  height: 2rpx;
  background-color: var(--cf-line);
}
</style>
