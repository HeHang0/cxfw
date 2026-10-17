<script setup lang="ts">
/** 加载 / 错误 / 空数据 / 不完整 四种状态的统一占位组件（配色走设计令牌）。 */

import { computed } from 'vue'

const props = withDefaults(
  defineProps<{
    status: 'loading' | 'error' | 'empty' | 'partial' | 'ready'
    message?: string
    hint?: string
    retryText?: string
  }>(),
  { message: '', hint: '', retryText: '重试' },
)

const emit = defineEmits<{ retry: [] }>()

const DEFAULT_TITLE: Record<string, string> = {
  loading: '加载中…',
  error: '加载失败',
  empty: '暂无数据',
  partial: '数据不完整',
  ready: '',
}

const visible = computed(() => props.status !== 'ready')
const title = computed(() => props.message || DEFAULT_TITLE[props.status] || '')
const canRetry = computed(() => props.status === 'error' || props.status === 'partial')

function onRetry(): void {
  emit('retry')
}
</script>

<template>
  <view v-if="visible" class="state-panel" :class="`state-panel--${status}`">
    <text class="state-panel__title">{{ title }}</text>
    <text v-if="hint" class="state-panel__hint">{{ hint }}</text>
    <view v-if="canRetry" class="state-panel__action" @tap="onRetry">
      <text class="state-panel__action-text">{{ retryText }}</text>
    </view>
  </view>
</template>

<style>
.state-panel {
  padding: 36rpx;
  border-radius: var(--cf-radius-sm);
  background-color: var(--cf-bg-soft);
  display: flex;
  flex-direction: column;
  align-items: center;
}

.state-panel--error {
  background-color: var(--cf-danger-soft);
}

.state-panel--partial {
  background-color: var(--cf-cream-soft);
}

.state-panel__title {
  font-size: 26rpx;
  color: var(--cf-text-1);
}

.state-panel__hint {
  font-size: 22rpx;
  color: var(--cf-text-2);
  margin-top: 8rpx;
  text-align: center;
  line-height: 1.6;
}

.state-panel__action {
  margin-top: 24rpx;
  padding: 14rpx 36rpx;
  border-radius: var(--cf-radius-pill);
  background-color: var(--cf-blue);
}

.state-panel__action-text {
  color: var(--cf-text-1);
  font-size: 24rpx;
  font-weight: 500;
}
</style>
