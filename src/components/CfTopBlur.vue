<script setup lang="ts">
import { useSafeArea } from '@/composables/useSafeArea'

const safeArea = useSafeArea()
</script>

<template>
  <view
    class="top-blur"
    :style="{ '--cf-top-blur-height': `${safeArea.statusBarHeight}px` }"
  />
</template>

<style>
.top-blur {
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  z-index: 1000;
  height: var(--cf-top-blur-height);
  height: max(var(--cf-top-blur-height), env(safe-area-inset-top, 0px));
  pointer-events: none;
  background: linear-gradient(
    180deg,
    rgba(255, 249, 242, 0.88) 0%,
    rgba(255, 249, 242, 0.62) 55%,
    rgba(255, 249, 242, 0) 100%
  );
  -webkit-backdrop-filter: blur(20px) saturate(150%);
  backdrop-filter: blur(20px) saturate(150%);
  -webkit-mask-image: linear-gradient(to bottom, #000 0%, #000 55%, transparent 100%);
  mask-image: linear-gradient(to bottom, #000 0%, #000 55%, transparent 100%);
}
</style>
