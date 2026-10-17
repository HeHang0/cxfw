<script setup lang="ts">
import { computed, ref } from 'vue';
import { onShow } from '@dcloudio/uni-app';
import CfBikeScene from '@/components/CfBikeScene.vue';
import CfIcon from '@/components/CfIcon.vue';
import CfStatusChip from '@/components/CfStatusChip.vue';
import CfTabBar from '@/components/CfTabBar.vue';
import SectionCard from '@/components/SectionCard.vue';
import StatePanel from '@/components/StatePanel.vue';
import VehiclePicker from '@/components/VehiclePicker.vue';
import { useAuthStore } from '@/stores/auth';
import { useFuelStore } from '@/stores/fuel';
import { useVehicleStore } from '@/stores/vehicle';
import { useSafeArea } from '@/composables/useSafeArea';
import { formatMonth } from '@/core/domain/datetime';
import { vehicleMessageLabel } from '@/core/domain/vehicleMessages';
import { getContainer } from '@/services/container';
import {
  formatDateOnly,
  formatDurationShort,
  formatKm,
  formatNumber,
  formatSpeed,
  maskMiddle,
  UNKNOWN_TEXT
} from '@/utils/format';
import {
  goToLogin,
  goToTab,
  navigateTo,
  NAV_TABS,
  ROUTES,
  showToast
} from '@/utils/navigation';

/**
 * 我的车辆（设计稿 Frame「04 车辆」，节点 2:597）。
 *
 * 版式：标题行（含刷新按钮）→ 车辆卡（插画 + 名称 + 状态胶囊 + 三格信息）
 * → 车辆状态卡 → 车辆信息卡（脱敏）→ 功能与服务卡 → 切换车辆行 → 账号与接口能力。
 *
 * 设计稿里的部分数据本项目接口拿不到（例如"车联网状态""定位追踪是否开通"），
 * 这些位置改用官方接口确实返回的字段（SIM 到期、电子围栏数量、同步时间等），
 * 拿不到的一律显示"未知"，不编造状态。
 */

const auth = useAuthStore();
const vehicle = useVehicleStore();
const fuel = useFuelStore();
const safeArea = useSafeArea();
const pickerOpen = ref(false);
const servicesOpen = ref(false);
const messageModalOpen = ref(false);
const batteryModalOpen = ref(false);

onShow(async () => {
  if (!auth.isLoggedIn) {
    goToLogin();
    return;
  }
  if (vehicle.vehicles.length === 0) await vehicle.load(false);
  if (vehicle.activeRef) {
    const tasks: Promise<void>[] = [];
    if (vehicle.state === null) tasks.push(vehicle.loadState());
    if (vehicle.telemetry === null) tasks.push(vehicle.loadTelemetry());
    await Promise.all(tasks);
    await fuel.load(formatMonth(getContainer().clock.now()), {
      hasRideRecords: (vehicle.telemetry?.monthMileageKm ?? 0) > 0,
      totalMileageKm: vehicle.telemetry?.totalMileageKm ?? null,
      remainingOil: vehicle.telemetry?.remainingOil ?? null,
      totalOilSegments: vehicle.telemetry?.totalOilSegments ?? null,
      vehicleTypeName: vehicle.telemetry?.vehicleTypeName ?? null
    });
  }
});

const current = computed(() => vehicle.activeVehicle);
const state = computed(() => vehicle.state);
const telemetry = computed(() => vehicle.telemetry);
const bikeImageUrl = computed(
  () => telemetry.value?.imageUrl ?? current.value?.imageUrl ?? null
);
const vehicleTypeLabel = computed(
  () =>
    telemetry.value?.vehicleTypeName ??
    current.value?.model ??
    current.value?.vin ??
    UNKNOWN_TEXT
);

const batteryDisplayValue = computed(() => {
  const live = telemetry.value;
  if (live?.batteryVoltageDisplay) return live.batteryVoltageDisplay;
  return live?.batteryVoltage === null || live?.batteryVoltage === undefined
    ? UNKNOWN_TEXT
    : `${formatNumber(live.batteryVoltage, 1)} V`;
});

const batteryThresholdText = computed(() =>
  telemetry.value?.batteryThreshold === null ||
  telemetry.value?.batteryThreshold === undefined
    ? UNKNOWN_TEXT
    : `${formatNumber(telemetry.value.batteryThreshold, 1)} V`
);

function openBatteryModal(): void {
  batteryModalOpen.value = true;
}

const vehicleChip = computed<{ label: string; tone: 'mint' | 'cream' }>(() => {
  if (vehicle.missingFields.length > 0)
    return { label: '标识待完善', tone: 'cream' };
  if (vehicle.errorMessage) return { label: '读取异常', tone: 'cream' };
  return { label: '状态正常', tone: 'mint' };
});

const triple = computed(() => [
  {
    label: '绑定状态',
    value: current.value ? '已绑定' : UNKNOWN_TEXT,
    align: 'start'
  },
  {
    label: '车载设备',
    value: current.value?.deviceId
      ? `T-BOX · ${maskMiddle(current.value.deviceId, 2, 4)}`
      : UNKNOWN_TEXT,
    align: 'center'
  },
  {
    label: '绑定时间',
    value: formatDateOnly(current.value?.bindDate ?? null),
    align: 'end'
  }
]);

const liveTriple = computed<
  Array<{
    key: 'fuel' | 'signal' | 'battery';
    label: string;
    value: string;
    align: 'start' | 'center' | 'end';
    clickable?: boolean;
    tone: 'good' | 'bad';
  }>
>(() => {
  const live = telemetry.value;
  return [
    {
      key: 'fuel',
      label: '剩余燃油',
      value: live?.remainingOilDisplay ?? UNKNOWN_TEXT,
      align: 'start',
      tone: liveValueTone(live?.remainingOilDisplay ?? UNKNOWN_TEXT)
    },
    {
      key: 'signal',
      label: '信号强度',
      value: live?.signalText ?? formatNumber(live?.signalLevel ?? null, 0),
      align: 'center',
      tone: liveValueTone(
        live?.signalText ?? formatNumber(live?.signalLevel ?? null, 0)
      )
    },
    {
      key: 'battery',
      label: '电池电压',
      value: batteryDisplayValue.value,
      align: 'end',
      clickable: true,
      tone: liveValueTone(batteryDisplayValue.value)
    }
  ];
});

function liveValueTone(value: string): 'good' | 'bad' {
  return ['充足', '强', '正常'].some(keyword => value.includes(keyword))
    ? 'good'
    : 'bad';
}

const liveRows = computed(() => {
  const live = telemetry.value;
  return [
    {
      icon: 'wifi-primary' as const,
      label: '车辆状态',
      value:
        live?.online === true
          ? '在线'
          : live?.online === false
            ? '离线'
            : UNKNOWN_TEXT,
      action: false
    },
    {
      icon: 'pin-primary' as const,
      label: '车辆位置',
      value: live?.recentRide?.endAddress ?? UNKNOWN_TEXT,
      action: false
    },
    {
      icon: 'refresh-primary' as const,
      label: '数据更新时间',
      value: vehicle.telemetryLoading
        ? '刷新中…'
        : (live?.lastUpdate ?? UNKNOWN_TEXT),
      action: true
    }
  ];
});

const recentRide = computed(() => telemetry.value?.recentRide ?? null);

const recentRideAvgSpeed = computed(() => {
  const ride = recentRide.value;
  if (
    !ride ||
    ride.distanceKm === null ||
    ride.durationSeconds === null ||
    ride.durationSeconds <= 0
  ) {
    return null;
  }
  return (ride.distanceKm / (ride.durationSeconds / 3600)) * 1;
});

const fuelSegments = computed(() => {
  const total = Math.min(
    20,
    Math.max(0, Math.round(telemetry.value?.totalOilSegments ?? 0))
  );
  const remaining = Math.max(0, Math.round(telemetry.value?.remainingOil ?? 0));
  return Array.from({ length: total }, (_, index) => index < remaining);
});

const fuelTone = computed<'good' | 'warn' | 'danger'>(() => {
  const remaining = Math.max(0, Math.round(telemetry.value?.remainingOil ?? 0));
  if (remaining >= 3) return 'good';
  if (remaining === 2) return 'warn';
  return 'danger';
});

const fuelValueText = computed(() =>
  fuel.view?.monthConsumptionLPer100Km === null ||
  fuel.view?.monthConsumptionLPer100Km === undefined
    ? UNKNOWN_TEXT
    : `${formatNumber(fuel.view.monthConsumptionLPer100Km, 2)} L`
);

const fuelSourceLabel = computed(() => {
  if (fuel.view?.source === 'official') return '官方数据';
  if (fuel.view?.source === 'manual') return '手动记录估算';
  return '暂无数据';
});

const fuelSublineText = computed(() => {
  const view = fuel.view;
  if (
    view?.latestDaily?.lPer100Km !== null &&
    view?.latestDaily?.lPer100Km !== undefined
  ) {
    return `最近一天 ${view.latestDaily.date}：${formatNumber(view.latestDaily.lPer100Km, 2)} L`;
  }
  if (
    view?.historicalConsumptionLPer100Km !== null &&
    view?.historicalConsumptionLPer100Km !== undefined
  ) {
    return `历史油耗：${formatNumber(view.historicalConsumptionLPer100Km, 2)} L`;
  }
  return '';
});

const statusRows = computed(() => {
  const current_ = state.value;
  const fencing = current_?.electricFences.length ?? 0;
  const simExpire = current_?.simExpire;
  const simKnown = simExpire !== null && simExpire !== undefined;
  const days = current_?.simFreeDays;
  return [
    {
      // simExpire / simExpireTime / simFreeDate 都来自车辆状态接口
      icon: 'wifi-primary' as const,
      label: '车联网服务（SIM）',
      value: simKnown ? (simExpire ? '已到期' : '正常') : UNKNOWN_TEXT,
      chip: simKnown
        ? simExpire
          ? ('已到期' as const)
          : ('正常' as const)
        : null,
      tone: simExpire ? ('cream' as const) : ('mint' as const)
    },
    {
      icon: 'wifi-primary' as const,
      label: 'SIM 剩余天数',
      value: days === null || days === undefined ? UNKNOWN_TEXT : `${days} 天`,
      chip: null,
      tone: 'mint' as const
    },
    {
      icon: 'pin-primary' as const,
      label: '电子围栏',
      value: current_ ? `${fencing} 个` : UNKNOWN_TEXT,
      chip: current_
        ? fencing > 0
          ? ('已设置' as const)
          : ('未设置' as const)
        : null,
      tone: fencing > 0 ? ('mint' as const) : ('neutral' as const)
    }
  ];
});

const infoRows = computed(() => {
  const target = current.value;
  return [
    {
      label: '车型',
      value: vehicleTypeLabel.value,
      fullValue:
        vehicleTypeLabel.value === UNKNOWN_TEXT ? null : vehicleTypeLabel.value,
      sensitive: false
    },
    {
      label: 'VIN 码',
      value: maskMiddle(target?.vin ?? null, 3, 4),
      fullValue: target?.vin ?? null,
      sensitive: true
    },
    {
      label: '车载设备',
      value: target?.deviceId
        ? `T-BOX · ${maskMiddle(target.deviceId, 2, 4)}`
        : UNKNOWN_TEXT,
      fullValue: target?.deviceId ?? null,
      sensitive: true
    },
    {
      label: 'TBox IMEI',
      value: maskMiddle(target?.equipmentNum ?? null, 3, 4),
      fullValue: target?.equipmentNum ?? null,
      sensitive: true
    },
    {
      label: '绑定时间',
      value: formatDateOnly(target?.bindDate ?? null),
      fullValue: target?.bindDate ?? null,
      sensitive: false
    },
    {
      label: 'SIM 卡有效期',
      value: state.value?.simExpireTime ?? UNKNOWN_TEXT,
      fullValue: state.value?.simExpireTime ?? null,
      sensitive: false
    }
  ];
});

const serviceRows = computed(() => {
  const rows: Array<{
    label: string;
    value: string;
    tone: 'mint' | 'neutral';
    action?: boolean;
  }> = (state.value?.functions ?? []).map(item => ({
    label: item.name,
    value: item.supported ? '已支持' : '不支持',
    tone: item.supported ? 'mint' : 'neutral'
  }));
  const messages = state.value?.messageSettings ?? [];
  if (messages.length > 0) {
    const enabled = messages.filter(item => item.enabled).length;
    rows.push({
      label: '消息提醒',
      value: `${enabled}/${messages.length} 已开启`,
      tone: enabled > 0 ? 'mint' : 'neutral',
      action: true
    });
  }
  return rows;
});

const displayMessages = computed(() =>
  (state.value?.messageSettings ?? []).map(item => ({
    type: item.type,
    label: vehicleMessageLabel(item.type),
    enabled: item.enabled
  }))
);

/** 「功能与服务」卡副标题：直接反映官方返回的项数与支持情况。 */
const functionSummary = computed(() => {
  const functions = state.value?.functions ?? [];
  if (functions.length === 0) return '来自车辆接口 · 尚未读取';
  const supported = functions.filter(item => item.supported).length;
  return `已支持 ${supported} 项功能`;
});

const fencingText = computed(() => {
  const fences = state.value?.electricFences ?? [];
  if (fences.length === 0) return '无电子围栏数据';
  return fences
    .map(
      fence =>
        `${fence.name ?? '未命名'}（${fence.address ?? '无地址'}，半径 ${formatKm(fence.radiusKm, 1)}）`
    )
    .join('；');
});

function onInfoRow(row: {
  label: string;
  fullValue: string | null;
  sensitive: boolean;
}): void {
  if (!row.sensitive) return;
  uni.showModal({
    title: row.label,
    content: row.fullValue ?? UNKNOWN_TEXT,
    showCancel: false,
    confirmText: '知道了'
  });
}

async function onRefresh(): Promise<void> {
  await vehicle.load(true);
  if (vehicle.errorMessage) showToast(vehicle.errorMessage, 'none');
  if (vehicle.activeRef) {
    await Promise.all([vehicle.loadState(), vehicle.loadTelemetry()]);
    await fuel.load(formatMonth(getContainer().clock.now()), {
      hasRideRecords: (vehicle.telemetry?.monthMileageKm ?? 0) > 0,
      totalMileageKm: vehicle.telemetry?.totalMileageKm ?? null,
      remainingOil: vehicle.telemetry?.remainingOil ?? null,
      totalOilSegments: vehicle.telemetry?.totalOilSegments ?? null,
      vehicleTypeName: vehicle.telemetry?.vehicleTypeName ?? null
    });
  }
}

async function onRefreshTelemetry(): Promise<void> {
  await vehicle.loadTelemetry();
  if (vehicle.errorMessage) showToast(vehicle.errorMessage, 'none');
}

function onLiveRowTap(row: { action: boolean }): void {
  if (row.action) void onRefreshTelemetry();
}

function toggleServices(): void {
  servicesOpen.value = !servicesOpen.value;
}

function onServiceRowTap(row: { action?: boolean }): void {
  if (row.action) messageModalOpen.value = true;
}

function closeMessageModal(): void {
  messageModalOpen.value = false;
}

async function onSelect(vehicleId: string): Promise<void> {
  vehicle.select(vehicleId);
  pickerOpen.value = false;
  await Promise.all([vehicle.loadState(), vehicle.loadTelemetry()]);
  await fuel.load(formatMonth(getContainer().clock.now()), {
    hasRideRecords: (vehicle.telemetry?.monthMileageKm ?? 0) > 0,
    totalMileageKm: vehicle.telemetry?.totalMileageKm ?? null,
    remainingOil: vehicle.telemetry?.remainingOil ?? null,
    totalOilSegments: vehicle.telemetry?.totalOilSegments ?? null,
    vehicleTypeName: vehicle.telemetry?.vehicleTypeName ?? null
  });
}

function togglePicker(): void {
  if (vehicle.vehicles.length <= 1) {
    showToast(`当前账号只绑定了 ${vehicle.vehicles.length} 台车`);
    return;
  }
  pickerOpen.value = !pickerOpen.value;
}
</script>

<template>
  <view class="cf-page cf-vehicle">
    <view class="cf-vehicle__content">
      <!-- 标题行 -->
      <view
        class="page-head"
        :style="{
          marginTop: `${safeArea.statusBarHeight}px`,
          height: `${safeArea.navBarHeight}px`,
          marginRight: `${safeArea.capsuleGap}px`
        }">
        <text class="page-head__title">我的车辆</text>
        <view class="icon-btn" @tap="onRefresh">
          <CfIcon name="refresh-primary" :size="36" />
        </view>
      </view>

      <StatePanel
        v-if="!current"
        :status="
          vehicle.loading ? 'loading' : vehicle.errorMessage ? 'error' : 'empty'
        "
        :message="vehicle.errorMessage ?? '还没有车辆数据'"
        hint="请检查网络后重新加载"
        retry-text="重新加载"
        @retry="onRefresh" />

      <template v-else>
        <!-- 车辆卡 -->
        <SectionCard>
          <CfBikeScene variant="vehicle" :image-url="bikeImageUrl" />
          <view class="vrow">
            <view class="vrow__info">
              <text class="vrow__name">{{ vehicleTypeLabel }}</text>
              <text class="vrow__sub">CFMOTO · 已绑定</text>
            </view>
            <CfStatusChip :label="vehicleChip.label" :tone="vehicleChip.tone" />
          </view>
          <view class="divider" />
          <view class="triple">
            <view
              v-for="item in triple"
              :key="item.label"
              class="triple__item"
              :class="`triple__item--${item.align}`">
              <text class="triple__label">{{ item.label }}</text>
              <text class="triple__value">{{ item.value }}</text>
            </view>
          </view>
        </SectionCard>

        <!-- 实时车况（vehicle/detail + detail/v1 + iot/attribute） -->
        <SectionCard
          v-if="telemetry"
          title="实时车况"
          subtitle="T-Box 实时数据"
          compact-radius>
          <view class="triple">
            <view
              v-for="item in liveTriple"
              :key="item.key"
              class="triple__item"
              :class="[
                `triple__item--${item.align}`,
                { 'triple__item--clickable': item.clickable }
              ]"
              @tap="item.key === 'battery' && openBatteryModal()">
              <text class="triple__label">{{ item.label }}</text>
              <view class="triple__value-row">
                <text class="triple__value">{{ item.value }}</text>
                <view class="live-dot" :class="`live-dot--${item.tone}`" />
              </view>
            </view>
          </view>
          <view
            v-if="fuelSegments.length > 0"
            class="fuel"
            :class="`fuel--${fuelTone}`">
            <text class="fuel__label">燃油量</text>
            <view class="fuel__segments">
              <view
                v-for="(filled, index) in fuelSegments"
                :key="index"
                class="fuel__segment"
                :class="{ 'fuel__segment--filled': filled }" />
            </view>
          </view>
          <view class="divider" />
          <view class="rows">
            <view
              v-for="(row, index) in liveRows"
              :key="row.label"
              class="rows__item">
              <view v-if="index > 0" class="divider" />
              <view
                class="rows__line"
                :class="{ 'rows__line--action': row.action }"
                @tap="onLiveRowTap(row)">
                <view class="rows__label">
                  <CfIcon :name="row.icon" :size="32" />
                  <text class="rows__label-text">{{ row.label }}</text>
                </view>
                <view class="rows__right">
                  <text class="rows__value">{{ row.value }}</text>
                  <CfIcon
                    v-if="row.action"
                    name="chevron-right-secondary"
                    :size="24" />
                </view>
              </view>
            </view>
          </view>
        </SectionCard>
        <StatePanel
          v-else-if="vehicle.telemetryLoading"
          status="loading"
          message="正在读取实时车况" />

        <!-- 最近行程 -->
        <SectionCard
          v-if="recentRide"
          title="最近行程"
          :subtitle="recentRide.date ?? recentRide.startTime ?? ''"
          compact-radius>
          <view class="triple">
            <view class="triple__item triple__item--start">
              <text class="triple__label">里程</text>
              <text class="triple__value">{{
                formatKm(recentRide.distanceKm, 1)
              }}</text>
            </view>
            <view class="triple__item triple__item--center">
              <text class="triple__label">时长</text>
              <text class="triple__value">{{
                formatDurationShort(recentRide.durationSeconds)
              }}</text>
            </view>
            <view class="triple__item triple__item--end">
              <text class="triple__label">最高速度</text>
              <text class="triple__value">{{
                formatSpeed(recentRide.maxSpeedKph, 0)
              }}</text>
            </view>
          </view>
          <view class="divider" />
          <view class="rows">
            <view class="rows__line">
              <text class="rows__label-text rows__label-text--plain"
                >平均速度</text
              >
              <text class="rows__value rows__value--strong">{{
                formatSpeed(recentRideAvgSpeed, 1)
              }}</text>
            </view>
            <view class="divider" />
            <view class="rows__line">
              <text class="rows__label-text rows__label-text--plain">开始</text>
              <text class="rows__value">{{
                recentRide.startTime ?? UNKNOWN_TEXT
              }}</text>
            </view>
            <view class="divider" />
            <view class="rows__line">
              <text class="rows__label-text rows__label-text--plain">结束</text>
              <text class="rows__value">{{
                recentRide.endTime ?? UNKNOWN_TEXT
              }}</text>
            </view>
          </view>
          <text class="note">
            {{ recentRide.startAddress ?? UNKNOWN_TEXT }} →
            {{ recentRide.endAddress ?? UNKNOWN_TEXT }}
          </text>
        </SectionCard>

        <!-- 本月油耗 -->
        <SectionCard
          title="本月油耗"
          :subtitle="fuelSourceLabel"
          compact-radius>
          <view class="fuel-summary-row">
            <text class="fuel-summary-row__value">{{ fuelValueText }}</text>
            <view class="link" @tap="navigateTo(ROUTES.fuel)">
              <text class="link__text">加油记录</text>
              <CfIcon name="chevron-right-secondary" :size="24" />
            </view>
          </view>
          <text v-if="fuelSublineText" class="note">{{ fuelSublineText }}</text>
          <text v-else-if="fuel.view?.unsupportedByVehicle" class="note">
            当前车辆暂未上报油耗，使用手动加油记录粗略估算。
          </text>
        </SectionCard>

        <!-- 车辆状态 -->
        <SectionCard
          title="车辆状态"
          subtitle="T-Box 与车联网服务"
          compact-radius>
          <view class="rows">
            <view
              v-for="(row, index) in statusRows"
              :key="row.label"
              class="rows__item">
              <view v-if="index > 0" class="divider" />
              <view class="rows__line">
                <view class="rows__label">
                  <CfIcon :name="row.icon" :size="32" />
                  <text class="rows__label-text">{{ row.label }}</text>
                </view>
                <CfStatusChip
                  v-if="row.chip"
                  :label="row.chip"
                  :tone="row.tone" />
                <text v-else class="rows__value">{{ row.value }}</text>
              </view>
            </view>
          </view>
          <text class="note">电子围栏：{{ fencingText }}</text>
          <view class="row-actions">
            <view class="button" @tap="vehicle.loadState">
              <text class="button__text">{{
                vehicle.stateLoading ? '读取中…' : '刷新车辆状态'
              }}</text>
            </view>
          </view>
        </SectionCard>

        <!-- 车辆信息（脱敏） -->
        <SectionCard title="车辆信息" compact-radius>
          <view class="rows">
            <view
              v-for="(row, index) in infoRows"
              :key="row.label"
              class="rows__item">
              <view v-if="index > 0" class="divider" />
              <view
                class="rows__line"
                :class="{ 'rows__line--sensitive': row.sensitive }"
                @tap="onInfoRow(row)">
                <text class="rows__label-text rows__label-text--plain">{{
                  row.label
                }}</text>
                <text
                  class="rows__value rows__value--strong"
                  :class="{ 'rows__value--sensitive': row.sensitive }">
                  {{ row.value }}
                </text>
              </view>
            </view>
          </view>
        </SectionCard>

        <!-- 功能与服务 -->
        <SectionCard
          title="功能与服务"
          :subtitle="functionSummary"
          compact-radius
          clickable-header
          @header-tap="toggleServices">
          <template #right>
            <view class="link">
              <text class="link__text">{{
                servicesOpen ? '收起' : '展开'
              }}</text>
              <view
                class="link__arrow"
                :class="{ 'link__arrow--open': servicesOpen }">
                <CfIcon name="chevron-right-secondary" :size="24" />
              </view>
            </view>
          </template>
          <view v-if="servicesOpen" class="rows">
            <view
              v-for="(row, index) in serviceRows"
              :key="row.label"
              class="rows__item">
              <view v-if="index > 0" class="divider" />
              <view
                class="rows__line"
                :class="{ 'rows__line--action': row.action }"
                @tap="onServiceRowTap(row)">
                <text class="rows__label-text rows__label-text--plain">{{
                  row.label
                }}</text>
                <view class="rows__right">
                  <CfStatusChip :label="row.value" :tone="row.tone" />
                </view>
              </view>
            </view>
          </view>
        </SectionCard>

        <!-- 切换车辆 -->
        <view class="switch-row" @tap="togglePicker">
          <CfIcon name="layers-primary" :size="36" />
          <view class="switch-row__text">
            <text class="switch-row__title">切换车辆</text>
            <text class="switch-row__sub"
              >已绑定 {{ vehicle.vehicles.length }} 台</text
            >
          </view>
        </view>
        <SectionCard v-if="pickerOpen" title="选择车辆" compact-radius>
          <VehiclePicker
            :vehicles="vehicle.vehicles"
            :active-vehicle-id="current.vehicleId ?? null"
            @select="onSelect" />
        </SectionCard>

        <StatePanel
          v-if="vehicle.missingFields.length > 0"
          status="partial"
          :message="`缺少标识：${vehicle.missingFields.join('、')}`"
          hint="缺少标识的车辆无法调用依赖这些字段的官方接口"
          retry-text="重新加载车辆"
          @retry="onRefresh" />
      </template>
    </view>

    <view v-if="messageModalOpen" class="modal" @tap="closeMessageModal">
      <view class="modal__card" @tap.stop>
        <view class="modal__head">
          <text class="modal__title">消息提醒</text>
          <view class="modal__close" @tap="closeMessageModal">
            <CfIcon name="close-secondary" :size="28" />
          </view>
        </view>
        <view v-if="displayMessages.length === 0" class="note"
          >暂无提醒设置</view
        >
        <view v-else class="message-list">
          <view
            v-for="item in displayMessages"
            :key="item.type"
            class="message-row">
            <view
              class="message-row__dot"
              :class="
                item.enabled ? 'message-row__dot--on' : 'message-row__dot--off'
              " />
            <text class="message-row__label">{{ item.label }}</text>
            <text
              class="message-row__status"
              :class="
                item.enabled
                  ? 'message-row__status--on'
                  : 'message-row__status--off'
              ">
              {{ item.enabled ? '已开启' : '已关闭' }}
            </text>
          </view>
        </view>
      </view>
    </view>

    <view v-if="batteryModalOpen" class="modal" @tap="batteryModalOpen = false">
      <view class="modal__card" @tap.stop>
        <view class="modal__head">
          <text class="modal__title">电池电压</text>
          <view class="modal__close" @tap="batteryModalOpen = false">
            <CfIcon name="close-secondary" :size="28" />
          </view>
        </view>
        <view class="battery-detail">
          <text class="battery-detail__value">{{
            (telemetry?.batteryVoltage
              ? `${telemetry.batteryVoltage} V`
              : '') || batteryDisplayValue
          }}</text>
          <text class="battery-detail__caption">实时车况上报值</text>
        </view>
        <view class="battery-detail__rows">
          <view class="battery-detail__row">
            <text class="battery-detail__label">参考阈值</text>
            <text class="battery-detail__text">{{ batteryThresholdText }}</text>
          </view>
          <view class="battery-detail__row">
            <text class="battery-detail__label">数据更新时间</text>
            <text class="battery-detail__text">{{
              telemetry?.lastUpdate ?? UNKNOWN_TEXT
            }}</text>
          </view>
        </view>
      </view>
    </view>

    <CfTabBar current="vehicle" :items="NAV_TABS" @select="goToTab" />
  </view>
</template>

<style>
.cf-vehicle {
  padding: 0;
}

.cf-vehicle__content {
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

.icon-btn {
  width: 80rpx;
  height: 80rpx;
  border-radius: 28rpx;
  background-color: var(--cf-bg-card);
  display: flex;
  align-items: center;
  justify-content: center;
}

/* 车辆卡 */
.vrow {
  display: flex;
  flex-direction: row;
  align-items: center;
  justify-content: space-between;
}

.vrow__info {
  display: flex;
  flex-direction: column;
  gap: 10rpx;
}

.vrow__name {
  font-size: 36rpx;
  font-weight: 700;
  line-height: 1.3;
  color: var(--cf-text-1);
}

.vrow__sub {
  font-size: 24rpx;
  line-height: 1.4;
  color: var(--cf-text-2);
}

.divider {
  width: 100%;
  height: 2rpx;
  background-color: var(--cf-line);
}

.triple {
  display: flex;
  flex-direction: row;
  align-items: center;
  justify-content: space-between;
}

.triple__item {
  display: flex;
  flex-direction: column;
  gap: 8rpx;
}

.triple__item--start {
  align-items: flex-start;
}

.triple__item--center {
  align-items: center;
  flex: 1;
}

.triple__item--end {
  align-items: flex-end;
}

.triple__item--clickable:active {
  opacity: 0.65;
}

.triple__value-row {
  display: flex;
  flex-direction: row;
  align-items: center;
  gap: 4rpx;
}

.live-dot {
  width: 12rpx;
  height: 12rpx;
  border-radius: 50%;
  flex-shrink: 0;
}

.live-dot--good {
  background-color: var(--cf-success);
  box-shadow: 0 2rpx 8rpx rgba(64, 160, 110, 0.32);
}

.live-dot--bad {
  background-color: var(--cf-danger);
  box-shadow: 0 2rpx 8rpx rgba(210, 80, 80, 0.32);
}

.triple__label {
  font-size: 22rpx;
  line-height: 1.3;
  color: var(--cf-text-2);
}

.triple__value {
  font-size: 26rpx;
  font-weight: 600;
  line-height: 1.3;
  color: var(--cf-text-1);
}

.fuel {
  display: flex;
  flex-direction: row;
  align-items: center;
  gap: 18rpx;
}

.fuel__label {
  font-size: 22rpx;
  color: var(--cf-text-2);
  flex-shrink: 0;
}

.fuel__segments {
  flex: 1;
  display: flex;
  flex-direction: row;
  gap: 8rpx;
}

.fuel__segment {
  flex: 1;
  height: 18rpx;
  border-radius: 6rpx;
  background-color: var(--cf-line);
}

.fuel__segment--filled {
  background-color: var(--cf-success);
}

.fuel--warn .fuel__segment--filled {
  background-color: var(--cf-warn);
}

.fuel--danger .fuel__segment--filled {
  background-color: var(--cf-danger);
}

.fuel-summary-row {
  display: flex;
  flex-direction: row;
  align-items: flex-end;
  justify-content: space-between;
}

.fuel-summary-row__value {
  font-size: 52rpx;
  font-weight: 700;
  line-height: 1.1;
  color: var(--cf-text-1);
}

/* 行列表 */
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

.rows__line--action:active {
  opacity: 0.6;
}

.rows__right {
  display: flex;
  flex-direction: row;
  align-items: center;
  gap: 6rpx;
}

.rows__label {
  display: flex;
  flex-direction: row;
  align-items: center;
  gap: 18rpx;
}

.rows__label-text {
  font-size: 26rpx;
  font-weight: 500;
  color: var(--cf-text-1);
}

.rows__label-text--plain {
  font-size: 24rpx;
  font-weight: 400;
  color: var(--cf-text-2);
}

.rows__value {
  font-size: 24rpx;
  color: var(--cf-text-2);
}

.rows__value--strong {
  font-size: 24rpx;
  font-weight: 600;
  color: var(--cf-text-1);
}

.rows__line--sensitive:active {
  opacity: 0.6;
}

.rows__value--sensitive {
  text-decoration: underline;
  text-decoration-style: dotted;
  text-underline-offset: 6rpx;
}

.link {
  display: flex;
  flex-direction: row;
  align-items: center;
  gap: 4rpx;
}

.link__text {
  font-size: 22rpx;
  color: var(--cf-text-2);
}

.link__arrow {
  display: flex;
  align-items: center;
  justify-content: center;
  transition: transform 0.2s ease;
}

.link__arrow--open {
  transform: rotate(90deg);
}

.note {
  font-size: 22rpx;
  line-height: 1.6;
  color: var(--cf-text-3);
}

.row-actions {
  display: flex;
  flex-direction: row;
  flex-wrap: wrap;
}

.button {
  padding: 16rpx 32rpx;
  border-radius: var(--cf-radius-pill);
  background-color: var(--cf-bg-soft);
}

.button__text {
  font-size: 24rpx;
  font-weight: 500;
  color: var(--cf-text-1);
}

.pill {
  height: 44rpx;
  border-radius: var(--cf-radius-pill);
  padding: 0 18rpx;
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
}

.pill--cream {
  background-color: var(--cf-cream-soft);
}

.pill__text {
  font-size: 20rpx;
  color: var(--cf-text-2);
}

.pill__text--cream {
  color: #b58b3a;
  font-weight: 500;
}

/* 切换车辆行 */
.switch-row {
  height: 100rpx;
  border-radius: var(--cf-radius-sm);
  border: 2rpx solid var(--cf-line);
  background-color: var(--cf-bg-card);
  display: flex;
  flex-direction: row;
  align-items: center;
  gap: 16rpx;
  padding: 0 28rpx;
  box-sizing: border-box;
}

.switch-row__text {
  display: flex;
  flex-direction: column;
  gap: 4rpx;
}

.switch-row__title {
  font-size: 28rpx;
  font-weight: 600;
  color: var(--cf-text-1);
}

.switch-row__sub {
  font-size: 24rpx;
  color: var(--cf-text-2);
}

.modal {
  position: fixed;
  inset: 0;
  z-index: 100;
  background-color: rgba(65, 70, 83, 0.35);
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 48rpx;
  box-sizing: border-box;
}

.modal__card {
  width: 100%;
  border-radius: var(--cf-radius-card);
  background-color: var(--cf-bg-card);
  padding: 32rpx;
  box-sizing: border-box;
  display: flex;
  flex-direction: column;
  gap: 24rpx;
  box-shadow: 0 20rpx 60rpx rgba(65, 70, 83, 0.2);
}

.modal__head {
  display: flex;
  flex-direction: row;
  align-items: center;
  justify-content: space-between;
}

.modal__title {
  font-size: 30rpx;
  font-weight: 600;
  color: var(--cf-text-1);
}

.modal__close {
  width: 44rpx;
  height: 44rpx;
  display: flex;
  align-items: center;
  justify-content: center;
}

.battery-detail {
  display: flex;
  flex-direction: column;
  gap: 8rpx;
  padding: 28rpx;
  border-radius: 24rpx;
  background-color: var(--cf-bg-soft);
}

.battery-detail__value {
  font-size: 52rpx;
  font-weight: 700;
  line-height: 1.2;
  color: var(--cf-text-1);
}

.battery-detail__caption {
  font-size: 22rpx;
  color: var(--cf-text-2);
}

.battery-detail__rows {
  display: flex;
  flex-direction: column;
  gap: 20rpx;
}

.battery-detail__row {
  display: flex;
  flex-direction: row;
  align-items: center;
  justify-content: space-between;
  gap: 24rpx;
}

.battery-detail__label {
  font-size: 24rpx;
  color: var(--cf-text-2);
}

.battery-detail__text {
  font-size: 24rpx;
  color: var(--cf-text-1);
  text-align: right;
}

.message-list {
  display: flex;
  flex-direction: column;
  gap: 20rpx;
}

.message-row {
  display: flex;
  flex-direction: row;
  align-items: center;
  gap: 16rpx;
}

.message-row__dot {
  width: 16rpx;
  height: 16rpx;
  border-radius: 999px;
  flex-shrink: 0;
}

.message-row__dot--on {
  background-color: var(--cf-success);
}

.message-row__dot--off {
  background-color: var(--cf-danger);
}

.message-row__label {
  flex: 1;
  min-width: 0;
  font-size: 24rpx;
  color: var(--cf-text-1);
}

.message-row__status {
  font-size: 22rpx;
  flex-shrink: 0;
}

.message-row__status--on {
  color: var(--cf-success);
}

.message-row__status--off {
  color: var(--cf-danger);
}
</style>
