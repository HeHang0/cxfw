<script setup lang="ts">
/**
 * 状态胶囊：一个圆点 + 一行小字。
 * 设计稿里出现在车辆卡片的「状态正常」（薄荷底 + 成功色文字）。
 * tone 变化时只换配色，结构保持一致。
 */

withDefaults(
  defineProps<{
    label: string
    /** neutral 是设计稿里的浅灰胶囊（#F2EFE9），用于"未设置/未知"这类中性状态 */
    tone?: 'mint' | 'blue' | 'cream' | 'neutral'
  }>(),
  { tone: 'mint' },
)
</script>

<template>
  <view class="chip" :class="`chip--${tone}`">
    <view class="chip__dot" />
    <text class="chip__label">{{ label }}</text>
  </view>
</template>

<style>
.chip {
  height: 52rpx;
  border-radius: var(--cf-radius-pill);
  display: flex;
  flex-direction: row;
  align-items: center;
  padding: 0 20rpx;
  box-sizing: border-box;
  flex-shrink: 0;
}

.chip--mint {
  background-color: var(--cf-mint-soft);
}

.chip--blue {
  background-color: var(--cf-blue-soft);
}

.chip--cream {
  background-color: var(--cf-cream-soft);
}

.chip--neutral {
  background-color: #f2efe9;
}

.chip__dot {
  width: 12rpx;
  height: 12rpx;
  border-radius: var(--cf-radius-pill);
  margin-right: 12rpx;
}

.chip--mint .chip__dot {
  background-color: var(--cf-mint-deep);
}

.chip--blue .chip__dot {
  background-color: var(--cf-blue-deep);
}

.chip--cream .chip__dot {
  background-color: var(--cf-warn);
}

.chip--neutral .chip__dot {
  background-color: var(--cf-text-3);
}

.chip__label {
  font-size: 22rpx;
  line-height: 1;
}

.chip--mint .chip__label {
  color: var(--cf-success);
}

.chip--blue .chip__label {
  color: var(--cf-blue-deep);
}

.chip--cream .chip__label {
  color: #b58b3a;
}

.chip--neutral .chip__label {
  color: var(--cf-text-2);
}
</style>
