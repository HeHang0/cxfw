<script setup lang="ts">
import { computed, ref } from 'vue';
import { onShow } from '@dcloudio/uni-app';
import CfIcon from '@/components/CfIcon.vue';
import StatePanel from '@/components/StatePanel.vue';
import { useAuthStore } from '@/stores/auth';
import { useVehicleStore } from '@/stores/vehicle';
import { isPreviewCredentials } from '@/core/domain/preview';
import { useSafeArea } from '@/composables/useSafeArea';
import { goToTab, ROUTES, showToast } from '@/utils/navigation';
import { readInputValue } from '@/utils/uni-events';

/**
 * 登录页（设计稿 Frame「05 登录」，节点 2:775）。
 *
 * 版式：透明 Logo + 标题 → 插画卡 → 欢迎语 → 表单卡（登录方式切换 / 手机号 / 验证码 / 登录按钮 / 协议）
 * → 底部帮助行。短信验证码登录是 api.yaml 给出的主路径，密码登录接口未实测。
 */

const auth = useAuthStore();
const vehicle = useVehicleStore();
const safeArea = useSafeArea();

const phone = ref('');
const verifyCode = ref('');
const password = ref('');
const passwordVisible = ref(false);
const usePassword = ref(false);
const agreed = ref(true);
const localError = ref<string | null>(null);

const phoneValid = computed(() => /^1[3-9]\d{9}$/.test(phone.value.trim()));
const previewLogin = computed(() =>
  isPreviewCredentials(phone.value, password.value)
);
const canSubmit = computed(() =>
  usePassword.value
    ? previewLogin.value || (phoneValid.value && password.value.length > 0)
    : phoneValid.value && verifyCode.value.trim().length >= 4
);
const sendButtonText = computed(() =>
  auth.canSendCode
    ? auth.sendingCode
      ? '发送中…'
      : '获取验证码'
    : `${auth.countdown}s`
);
const errorText = computed(() => auth.errorMessage ?? localError.value);

onShow(() => {
  if (auth.isLoggedIn) goToTab(ROUTES.overview);
});

function onPhoneInput(event: unknown): void {
  phone.value = readInputValue(event);
}

function onCodeInput(event: unknown): void {
  verifyCode.value = readInputValue(event);
}

function onPasswordInput(event: unknown): void {
  password.value = readInputValue(event);
}

function togglePasswordVisible(): void {
  passwordVisible.value = !passwordVisible.value;
}

function switchMode(next: 'code' | 'password'): void {
  usePassword.value = next === 'password';
  localError.value = null;
  auth.clearError();
}

async function onSendCode(): Promise<void> {
  localError.value = null;
  if (!phoneValid.value) {
    localError.value = '请输入正确的手机号';
    return;
  }
  const ok = await auth.sendCode(phone.value.trim());
  if (ok) showToast('验证码已发送', 'success');
}

async function onSubmit(): Promise<void> {
  localError.value = null;
  if (!agreed.value) {
    localError.value = '请先阅读并同意用户协议与隐私政策';
    return;
  }
  if (!canSubmit.value) {
    localError.value = usePassword.value
      ? '请填写手机号与密码'
      : '请填写手机号与验证码';
    return;
  }
  const ok = usePassword.value
    ? await auth.loginByPassword(phone.value.trim(), password.value)
    : await auth.loginByVerifyCode(phone.value.trim(), verifyCode.value.trim());
  if (ok) {
    // 登录会话可能从真实账号切到 test 预览账号，清掉页面内的旧车辆快照。
    vehicle.resetForSession();
    goToTab(ROUTES.overview);
  }
}

function onToggleAgree(): void {
  agreed.value = !agreed.value;
}
</script>

<template>
  <view class="cf-page cf-login">
    <view class="cf-login__content">
      <!-- 品牌区 -->
      <view
        class="brand"
        :style="{
          marginTop: `${safeArea.statusBarHeight}px`
        }">
        <view class="brand__logo">
          <image
            class="brand__logo-image"
            src="/static/assets/login-logo.png"
            mode="aspectFit" />
        </view>
        <view class="brand__copy">
          <text class="brand__name">春序风物</text>
          <text class="brand__slogan">春有序，行有迹，风有物</text>
        </view>
      </view>

      <!-- 插画 -->
      <view class="hero-card">
        <image
          class="hero-card__image"
          src="/static/assets/login-hero.png"
          mode="widthFix" />
      </view>

      <!-- 欢迎语 -->
      <view class="welcome">
        <text class="welcome__title">欢迎回来</text>
        <text class="welcome__desc">登录后即可查看车辆状态与骑行数据</text>
      </view>

      <!-- 表单卡 -->
      <view class="form-card">
        <!-- 登录方式切换 -->
        <view class="segment">
          <view
            class="segment__item"
            :class="{ 'segment__item--active': !usePassword }"
            @tap="switchMode('code')">
            <text
              class="segment__text"
              :class="{ 'segment__text--active': !usePassword }"
              >验证码登录</text
            >
          </view>
          <view
            class="segment__item"
            :class="{ 'segment__item--active': usePassword }"
            @tap="switchMode('password')">
            <text
              class="segment__text"
              :class="{ 'segment__text--active': usePassword }"
              >密码登录</text
            >
          </view>
        </view>

        <!-- 手机号 -->
        <view class="field">
          <text class="field__label">手机号</text>
          <view class="field__box">
            <text class="field__prefix">+86</text>
            <view class="field__divider" />
            <input
              class="field__input"
              :type="usePassword ? 'text' : 'number'"
              :value="phone"
              placeholder="请输入手机号"
              placeholder-class="field__placeholder"
              @input="onPhoneInput" />
          </view>
        </view>

        <!-- 验证码 / 密码 -->
        <view class="field">
          <text class="field__label">{{
            usePassword ? '密码' : '验证码'
          }}</text>
          <view class="field__row">
            <view class="field__box field__box--flex">
              <input
                v-if="!usePassword"
                class="field__input"
                type="number"
                :value="verifyCode"
                placeholder="请输入 6 位验证码"
                placeholder-class="field__placeholder"
                @input="onCodeInput" />
              <input
                v-else
                class="field__input"
                :password="!passwordVisible"
                :value="password"
                placeholder="请输入密码"
                placeholder-class="field__placeholder"
                @input="onPasswordInput" />
              <view
                v-if="usePassword"
                class="field__eye"
                @tap="togglePasswordVisible">
                <image
                  class="field__eye-image"
                  :src="
                    passwordVisible
                      ? '/static/assets/eye-off.svg'
                      : '/static/assets/eye-open.svg'
                  "
                  mode="aspectFit" />
              </view>
            </view>
            <view
              v-if="!usePassword"
              class="field__button"
              :class="{ 'field__button--disabled': !auth.canSendCode }"
              @tap="onSendCode">
              <text class="field__button-text">{{ sendButtonText }}</text>
            </view>
          </view>
        </view>

        <StatePanel
          v-if="errorText"
          status="error"
          :message="errorText"
          retry-text="知道了"
          @retry="auth.clearError" />
        <StatePanel
          v-else-if="auth.warning"
          status="partial"
          :message="auth.warning"
          retry-text="知道了"
          @retry="auth.clearError" />

        <view
          class="submit"
          :class="{ 'submit--disabled': !canSubmit }"
          @tap="onSubmit">
          <text class="submit__text">{{
            auth.loggingIn ? '登录中…' : '登录'
          }}</text>
        </view>

        <view class="agree">
          <view
            class="agree__box"
            :class="{ 'agree__box--on': agreed }"
            @tap="onToggleAgree">
            <CfIcon v-if="agreed" name="check-white" :size="18" />
          </view>
          <text class="agree__text" @tap="onToggleAgree"
            >已阅读并同意《用户协议》与《隐私政策》</text
          >
        </view>
      </view>

      <!-- 帮助行 -->
      <view class="help">
        <text class="help__text">遇到登录问题？</text>
        <text class="help__link" @tap="showToast('请联系春风客服处理账号问题')"
          >联系客服</text
        >
      </view>
    </view>
  </view>
</template>

<style>
.cf-login {
  padding: 0;
}

.cf-login__content {
  display: flex;
  flex-direction: column;
  gap: 28rpx;
  /* 设计稿：padding 8 / 24 / 20 + 底部指示条 22px */
  padding: 0 48rpx 64rpx;
}

.brand {
  display: flex;
  flex-direction: row;
  align-items: center;
  gap: 24rpx;
}

.brand__logo {
  width: 136rpx;
  height: 144rpx;
  flex-shrink: 0;
}

.brand__logo-image {
  width: 136rpx;
  height: 144rpx;
}

.brand__copy {
  display: flex;
  flex-direction: column;
  gap: 8rpx;
  min-width: 0;
}

.brand__name {
  font-size: 48rpx;
  font-weight: 700;
  line-height: 1.2;
  color: var(--cf-text-1);
}

.brand__slogan {
  font-size: 22rpx;
  line-height: 1.35;
  color: var(--cf-text-2);
}

.hero-card {
  width: 100%;
  border-radius: 36rpx;
  overflow: hidden;
  background-color: #dff2ff;
}

.hero-card__image {
  display: block;
  width: 100%;
}

.welcome {
  display: flex;
  flex-direction: column;
  gap: 12rpx;
}

.welcome__title {
  font-size: 48rpx;
  font-weight: 700;
  line-height: 1.3;
  color: var(--cf-text-1);
}

.welcome__desc {
  font-size: 24rpx;
  line-height: 1.4;
  color: var(--cf-text-2);
}

.form-card {
  background-color: var(--cf-bg-card);
  border-radius: var(--cf-radius-lg);
  box-shadow: 0 12rpx 32rpx var(--cf-shadow);
  padding: 36rpx;
  display: flex;
  flex-direction: column;
  gap: 32rpx;
}

/* 登录方式切换 */
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
  font-size: 26rpx;
  color: var(--cf-text-2);
}

.segment__text--active {
  font-weight: 600;
  color: var(--cf-text-1);
}

/* 输入项 */
.field {
  display: flex;
  flex-direction: column;
  gap: 16rpx;
}

.field__label {
  font-size: 22rpx;
  font-weight: 500;
  line-height: 1.3;
  color: var(--cf-text-2);
}

.field__row {
  display: flex;
  flex-direction: row;
  align-items: center;
  gap: 20rpx;
}

.field__box {
  height: 100rpx;
  border-radius: 28rpx;
  background-color: var(--cf-bg-soft);
  padding: 0 28rpx;
  box-sizing: border-box;
  display: flex;
  flex-direction: row;
  align-items: center;
  gap: 20rpx;
}

.field__box--flex {
  flex: 1;
  min-width: 0;
}

.field__prefix {
  font-size: 26rpx;
  font-weight: 500;
  color: var(--cf-text-1);
}

.field__divider {
  width: 2rpx;
  height: 32rpx;
  background-color: var(--cf-line);
}

.field__input {
  flex: 1;
  min-width: 0;
  height: 100rpx;
  font-size: 26rpx;
  color: var(--cf-text-1);
}

.field__eye {
  width: 48rpx;
  height: 48rpx;
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
}

.field__eye-image {
  width: 34rpx;
  height: 34rpx;
}

.field__placeholder {
  color: var(--cf-text-3);
  font-size: 26rpx;
}

.field__button {
  height: 100rpx;
  border-radius: 28rpx;
  background-color: var(--cf-blue-soft);
  padding: 0 28rpx;
  box-sizing: border-box;
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
}

.field__button--disabled {
  opacity: 0.6;
}

.field__button-text {
  font-size: 24rpx;
  font-weight: 600;
  color: var(--cf-blue-deep);
}

.submit {
  height: 100rpx;
  border-radius: 32rpx;
  background-color: var(--cf-blue-deep);
  display: flex;
  align-items: center;
  justify-content: center;
}

.submit--disabled {
  opacity: 0.7;
}

.submit__text {
  font-size: 30rpx;
  font-weight: 700;
  color: #ffffff;
}

.agree {
  display: flex;
  flex-direction: row;
  align-items: center;
  gap: 14rpx;
}

.agree__box {
  width: 28rpx;
  height: 28rpx;
  border-radius: 8rpx;
  box-sizing: border-box;
  border: 2rpx solid var(--cf-text-3);
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
}

.agree__box--on {
  background-color: var(--cf-blue-deep);
  border-color: var(--cf-blue-deep);
}

.agree__text {
  font-size: 20rpx;
  line-height: 1.3;
  color: var(--cf-text-2);
}

.source-note {
  font-size: 22rpx;
  line-height: 1.6;
  color: var(--cf-text-3);
}

.help {
  display: flex;
  flex-direction: row;
  align-items: center;
  justify-content: center;
  gap: 10rpx;
}

.help__text {
  font-size: 22rpx;
  color: var(--cf-text-2);
}

.help__link {
  font-size: 22rpx;
  font-weight: 600;
  color: var(--cf-blue-deep);
}
</style>
