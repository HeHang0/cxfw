<script setup lang="ts">
/**
 * 车辆卡片里的插画（设计稿节点 2:72）。
 *
 * 设计稿由「渐变底 + 抽象色块 + 线稿摩托」三部分组成，这里用同样的几何比例
 * 以纯 CSS 还原：尺寸位置都按设计稿给的百分比换算，因此换个容器宽度也不会走形。
 * 后续如果需要换成设计稿导出的 SVG/PNG，只替换这个组件的内部实现即可。
 */

withDefaults(
  defineProps<{
    /**
     * card＝总览的车辆卡片（108px 高）；vehicle＝车辆页车辆卡片（132px 高，薄荷→蓝渐变）；
     * hero＝登录页大图（176px 高）；mini＝横幅左侧小图
     */
    variant?: 'card' | 'vehicle' | 'hero' | 'mini'
    /** 官方 vehicleTypeImageUrl：有官方车型图时优先展示，缺省才用 CSS 插画 */
    imageUrl?: string | null
    /** 是否在插画上叠加文案 */
    title?: string
    subtitle?: string
    compact?: boolean
  }>(),
  { variant: 'card', imageUrl: null, title: '', subtitle: '', compact: false },
)
</script>

<template>
  <view class="scene" :class="[`scene--${variant}`, { 'scene--compact': compact, 'scene--photo': !!imageUrl }]">
    <image
      v-if="imageUrl"
      :src="imageUrl"
      mode="aspectFit"
      class="scene__photo"
    />
    <template v-if="!imageUrl">
      <!-- 装饰色块 -->
      <view class="scene__blob scene__blob--right" />
      <view class="scene__blob scene__blob--left" />
      <view class="scene__bar" />
      <view class="scene__sun" />
      <view class="scene__cloud scene__cloud--a" />
      <view class="scene__cloud scene__cloud--b" />

      <!-- 线稿摩托 -->
      <view class="bike">
        <view class="bike__wheel bike__wheel--rear" />
        <view class="bike__wheel bike__wheel--front" />
        <view class="bike__body" />
        <view class="bike__tank" />
        <view class="bike__fork" />
        <view class="bike__bar" />
        <view class="bike__light" />
      </view>
    </template>

    <view v-if="title" class="scene__text">
      <text class="scene__title">{{ title }}</text>
      <text v-if="subtitle" class="scene__subtitle">{{ subtitle }}</text>
    </view>
  </view>
</template>

<style>
.scene {
  position: relative;
  width: 100%;
  height: 216rpx;
  border-radius: 36rpx;
  overflow: hidden;
  background-image: linear-gradient(135deg, #e9f5fe 0%, #fff6e3 100%);
}

.scene--photo {
  background-color: #f4f0e8;
}

/* 官方车型图本身四周留白较多，放大展示以填满车辆卡片。 */
.scene__photo {
  position: absolute;
  left: 0;
  top: 0;
  width: 100%;
  height: 100%;
  transform: scale(1.32);
}

.scene--compact .scene__photo {
  transform: scale(1.18);
}

.scene--hero {
  height: 352rpx;
  border-radius: var(--cf-radius-lg);
  background-image: linear-gradient(135deg, #dceffc 0%, #e6f7ee 100%);
}

/* 车辆页：渐变方向与总览相反（薄荷 → 蓝），摩托占比更大 */
.scene--vehicle {
  height: 264rpx;
  border-radius: 36rpx;
  background-image: linear-gradient(135deg, #e6f7ee 0%, #e7f4fd 100%);
}

.scene--vehicle .bike {
  left: 22.3%;
  top: 10.6%;
  width: 60.5%;
  height: 86.4%;
}

.scene--vehicle .scene__sun {
  left: 87%;
  top: 12%;
}

.scene--vehicle .scene__bar {
  left: 32%;
  top: 92%;
  width: 41%;
  height: 6rpx;
  background-color: #e9e2d2;
}

.scene--hero .bike {
  left: 18.1%;
  top: 10.2%;
  width: 61.4%;
  height: 71.6%;
}

.scene--hero .scene__sun {
  width: 56rpx;
  height: 56rpx;
  left: 83%;
  top: 10%;
}

.scene--hero .scene__blob--right {
  left: 55%;
  top: 61%;
  background-color: #e1f2ea;
}

.scene--hero .scene__blob--left {
  top: 70%;
  background-color: #d2ebdd;
}

.scene--hero .scene__bar {
  left: 17%;
  top: 83%;
  width: 60%;
  height: 8rpx;
  background-color: #eae3d0;
}

.scene--compact {
  width: 148rpx;
  height: 88rpx;
  border-radius: 24rpx;
}

.scene__blob {
  position: absolute;
  border-radius: 120rpx;
}

.scene__blob--right {
  left: 70%;
  top: 57%;
  width: 63%;
  height: 74%;
  background-color: #e4f1e8;
}

.scene__blob--left {
  left: -13%;
  top: 68%;
  width: 70%;
  height: 64%;
  border-radius: 104rpx;
  background-color: #d6ece0;
}

.scene__bar {
  position: absolute;
  left: 40%;
  top: 88%;
  width: 40%;
  height: 6rpx;
  border-radius: 999px;
  background-color: #f3e8d4;
}

.scene__sun {
  position: absolute;
  left: 90%;
  top: 15%;
  width: 52rpx;
  height: 52rpx;
  border-radius: 999px;
  background-color: var(--cf-cream);
}

.scene__cloud {
  position: absolute;
  border-radius: 999px;
  background-color: rgba(255, 255, 255, 0.75);
}

.scene__cloud--a {
  left: 5.1%;
  top: 11.1%;
  width: 8.3%;
  height: 24%;
}

.scene__cloud--b {
  left: 15.9%;
  top: 31.5%;
  width: 5.4%;
  height: 15.7%;
}

/* 摩托：位置与比例来自设计稿 2:81 子节点 */
.bike {
  position: absolute;
  left: 34.4%;
  top: 14.8%;
  width: 47.8%;
  height: 83.3%;
}

.bike__wheel {
  position: absolute;
  top: 58.3%;
  width: 23.1%;
  height: 38.5%;
  box-sizing: border-box;
  border: 3rpx solid var(--cf-blue-deep);
  border-radius: 999px;
}

.bike__wheel--rear {
  left: 12.5%;
}

.bike__wheel--front {
  left: 67.5%;
}

.bike__body {
  position: absolute;
  left: 25%;
  top: 54.2%;
  width: 52.5%;
  height: 18.8%;
  border-radius: 16rpx;
  background-color: var(--cf-blue);
}

.bike__tank {
  position: absolute;
  left: 28.8%;
  top: 31.3%;
  width: 30%;
  height: 15.6%;
  border-radius: 12rpx;
  background-color: var(--cf-mint);
}

.bike__fork {
  position: absolute;
  left: 65%;
  top: 39.6%;
  width: 15.7%;
  height: 36.5%;
  box-sizing: border-box;
  border-left: 3rpx solid var(--cf-mint-deep);
  transform: skewX(-18deg);
}

.bike__bar {
  position: absolute;
  left: 72.5%;
  top: 33.3%;
  width: 15.6%;
  height: 11.5%;
  box-sizing: border-box;
  border-top: 3rpx solid var(--cf-text-1);
  border-right: 3rpx solid var(--cf-text-1);
  border-top-right-radius: 12rpx;
}

.bike__light {
  position: absolute;
  left: 71.9%;
  top: 17.7%;
  width: 8.7%;
  height: 14.6%;
  border-radius: 999px;
  background-color: var(--cf-cream);
}

.scene__text {
  position: absolute;
  left: 5%;
  top: 22%;
  display: flex;
  flex-direction: column;
}

.scene__title {
  font-size: 26rpx;
  font-weight: 600;
  color: var(--cf-text-1);
}

.scene__subtitle {
  font-size: 22rpx;
  color: var(--cf-text-2);
  margin-top: 4rpx;
}
</style>
