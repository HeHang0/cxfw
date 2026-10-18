<script setup lang="ts">
import type { IconName } from '@/utils/icons'
import CfIcon from './CfIcon.vue'

/**
 * 卡片容器（设计稿 2:64 / 2:89 / 2:118 / 2:144 共用的样式）。
 *
 * 设计规格：白底、圆角 24px（48rpx；图表卡与列表卡为 20px/40rpx）、
 * 阴影 0 6px 16px rgba(169,180,196,0.10)、内边距 18px（36rpx）、
 * 标题 15px SemiBold（30rpx）、副标题 11px（22rpx）次级色。
 */

const props = withDefaults(
  defineProps<{
    title?: string
    subtitle?: string
    note?: string
    icon?: IconName | null
    /** 图表卡与列表卡用的是 20px 圆角 */
    compactRadius?: boolean
    /** 标题行整体是否可点击。 */
    clickableHeader?: boolean
    /** 折叠态隐藏 body，避免空内容仍占用卡片间距。 */
    hideBody?: boolean
  }>(),
  {
    title: '',
    subtitle: '',
    note: '',
    icon: null,
    compactRadius: false,
    clickableHeader: false,
    hideBody: false,
  },
)

const emit = defineEmits<{ headerTap: [] }>()

function onHeaderTap(): void {
  if (props.clickableHeader) emit('headerTap')
}
</script>

<template>
  <view class="section-card" :class="{ 'section-card--compact': compactRadius }">
    <view
      v-if="title || subtitle || $slots.right"
      class="section-card__header"
      :class="{ 'section-card__header--clickable': clickableHeader }"
      @tap="onHeaderTap"
    >
      <view class="section-card__heading">
        <CfIcon v-if="icon" :name="icon" :size="30" />
        <view class="section-card__titles">
          <text v-if="title" class="section-card__title">{{ title }}</text>
          <text v-if="subtitle" class="section-card__subtitle">{{ subtitle }}</text>
        </view>
      </view>
      <slot name="right" />
    </view>
    <view v-if="!hideBody" class="section-card__body">
      <slot />
    </view>
    <text v-if="note" class="section-card__note">{{ note }}</text>
  </view>
</template>

<style>
.section-card {
  width: 100%;
  box-sizing: border-box;
  background-color: var(--cf-bg-card);
  border-radius: var(--cf-radius-lg);
  padding: 36rpx;
  box-shadow: 0 12rpx 32rpx var(--cf-shadow);
  display: flex;
  flex-direction: column;
  gap: 28rpx;
}

.section-card--compact {
  border-radius: var(--cf-radius-card);
}

.section-card__header {
  display: flex;
  flex-direction: row;
  align-items: center;
  justify-content: space-between;
}

.section-card__header--clickable:active {
  opacity: 0.7;
}

.section-card__heading {
  display: flex;
  flex-direction: row;
  align-items: center;
  gap: 14rpx;
  flex: 1;
}

.section-card__titles {
  display: flex;
  flex-direction: column;
  gap: 8rpx;
}

.section-card__title {
  font-size: 30rpx;
  font-weight: 600;
  line-height: 1.3;
  color: var(--cf-text-1);
}

.section-card__subtitle {
  font-size: 22rpx;
  line-height: 1.3;
  color: var(--cf-text-2);
}

.section-card__body {
  display: flex;
  flex-direction: column;
  gap: 28rpx;
}

.section-card__note {
  font-size: 22rpx;
  color: var(--cf-text-3);
  line-height: 1.6;
}
</style>
