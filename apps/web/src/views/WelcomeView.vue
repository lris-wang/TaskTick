<script setup lang="ts">
import { NButton, NModal } from "naive-ui";
import { ref } from "vue";
import { useRouter } from "vue-router";

const router = useRouter();
const showMethodModal = ref(false);

function goLogin(method: number) {
  if (method === 0) {
    router.push("/email-login");
  } else if (method === 1) {
    router.push("/phone-login");
  } else {
    showMethodModal.value = true;
  }
}
</script>

<template>
  <div class="welcome-page">
    <!-- 整体入场动画容器 -->
    <div class="welcome-container">
      <!-- 笑脸 SVG -->
      <div class="face-container">
        <svg class="kawaii-face" viewBox="0 0 140 100" fill="none" xmlns="http://www.w3.org/2000/svg">
          <!-- 左眼 - 睁着 -->
          <g class="eye-left">
            <ellipse cx="42" cy="38" rx="7" ry="8" stroke="currentColor" stroke-width="2.5" fill="none"/>
            <circle cx="42" cy="38" r="3" fill="currentColor" class="pupil"/>
          </g>

          <!-- 右眼 - 眨眼动画 -->
          <g class="eye-right">
            <ellipse cx="98" cy="38" rx="7" ry="8" stroke="currentColor" stroke-width="2.5" fill="none" class="eye-open"/>
            <path d="M91 38 Q98 33 105 38" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" fill="none" class="eye-wink"/>
          </g>

          <!-- 嘴巴 - 微笑 -->
          <path class="mouth" d="M52 58 Q70 72 88 58" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" fill="none"/>

          <!-- 腮红左 -->
          <ellipse cx="22" cy="52" rx="8" ry="5" fill="rgba(255,130,150,0.35)"/>
          <!-- 腮红右 -->
          <ellipse cx="118" cy="52" rx="8" ry="5" fill="rgba(255,130,150,0.35)"/>

          <!-- 小星星装饰 -->
          <text x="8" y="20" font-size="10" fill="currentColor" opacity="0.4">✦</text>
          <text x="120" y="22" font-size="8" fill="currentColor" opacity="0.3">✦</text>
          <text x="65" y="10" font-size="7" fill="currentColor" opacity="0.3">✧</text>
        </svg>
      </div>

      <!-- Welcome TaskTick 文字卡片 -->
      <div class="title-card">
        <span class="welcome-text">Welcome</span>
        <span class="app-name">TaskTick</span>
      </div>
    </div>

    <!-- 长条登录选择区域 -->
    <div class="login-cards">
      <!-- 微信登录 -->
      <div class="login-card login-card--disabled" @click="showMethodModal = true">
        <div class="card-icon">💬</div>
        <div class="card-label">微信登录</div>
        <div class="card-soon">即将上线</div>
      </div>

      <!-- QQ 登录 -->
      <div class="login-card login-card--disabled" @click="showMethodModal = true">
        <div class="card-icon">🐧</div>
        <div class="card-label">QQ 登录</div>
        <div class="card-soon">即将上线</div>
      </div>

      <!-- 手机登录 -->
      <div class="login-card" @click="goLogin(1)">
        <div class="card-icon">📱</div>
        <div class="card-label">手机登录</div>
      </div>

      <!-- 邮箱登录 -->
      <div class="login-card" @click="goLogin(0)">
        <div class="card-icon">📧</div>
        <div class="card-label">邮箱登录</div>
      </div>
    </div>

    <!-- 分割线 -->
    <div class="divider">
      <span>其他方式</span>
    </div>

    <!-- 其他选项 -->
    <div class="other-links">
      <NButton text class="link-btn" @click="router.push('/register')">邮箱注册</NButton>
      <span class="link-sep">·</span>
      <NButton text class="link-btn" @click="router.push('/phone-register')">手机注册</NButton>
      <span class="link-sep">·</span>
      <NButton text class="link-btn" @click="router.push('/reset-password')">忘记密码</NButton>
    </div>

    <!-- Method selection modal -->
    <NModal v-model:show="showMethodModal" preset="card" title="更多登录方式" style="width: 320px;" :bordered="false">
      <div class="method-grid">
        <div class="method-item method-item--disabled">
          <span class="method-icon-lg">💬</span>
          <span class="method-label">微信登录</span>
          <span class="method-soon">即将上线</span>
        </div>
        <div class="method-item method-item--disabled">
          <span class="method-icon-lg">🐧</span>
          <span class="method-label">QQ登录</span>
          <span class="method-soon">即将上线</span>
        </div>
      </div>
    </NModal>
  </div>
</template>

<style scoped>
.welcome-page {
  min-height: 100vh;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding: 40px 24px;
  background: var(--tt-guest-bg, #f0f2f5);
  gap: 40px;
}

/* 整体入场容器 */
.welcome-container {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 0;
  animation: emergeFromBehind 1.2s cubic-bezier(0.16, 1, 0.3, 1) 0.2s both;
}

@keyframes emergeFromBehind {
  0% {
    opacity: 0;
    transform: translateY(60px) scale(0.85);
    filter: blur(12px);
  }
  100% {
    opacity: 1;
    transform: translateY(0) scale(1);
    filter: blur(0);
  }
}

/* 笑脸容器 */
.face-container {
  margin-bottom: -20px;
  z-index: 2;
}

.kawaii-face {
  width: 140px;
  height: 100px;
  color: var(--tt-guest-text, #374151);
  overflow: visible;
}

/* 左眼 */
.eye-left {
  animation: floatLeft 3s ease-in-out infinite;
}

/* 右眼眨眼 */
.eye-right .eye-open {
  animation: wink 2.5s ease-in-out infinite;
}
.eye-right .eye-wink {
  animation: wink 2.5s ease-in-out infinite;
}

/* 瞳孔闪烁 */
.pupil {
  animation: blinkPupil 2.5s ease-in-out infinite;
}

@keyframes blinkPupil {
  0%, 45%, 55%, 100% { transform: scale(1); }
  50% { transform: scale(0.6); }
}

/* 眨眼关键帧 */
@keyframes wink {
  0%, 40% {
    opacity: 1;
    transform: scaleY(1);
  }
  45%, 55% {
    opacity: 0;
    transform: scaleY(0.1);
  }
  60% {
    opacity: 1;
    transform: scaleY(1);
  }
  100% {
    opacity: 1;
    transform: scaleY(1);
  }
}

/* 左眼浮动 */
@keyframes floatLeft {
  0%, 100% { transform: translateY(0); }
  50% { transform: translateY(-2px); }
}

/* 嘴巴微动 */
.mouth {
  animation: smilePulse 3s ease-in-out infinite;
}

@keyframes smilePulse {
  0%, 100% { transform: scaleX(1); }
  50% { transform: scaleX(1.05); }
}

/* 文字卡片 */
.title-card {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 6px;
  position: relative;
  z-index: 1;
  margin-top: -10px;
}

.welcome-text {
  font-size: 52px;
  font-weight: 300;
  font-style: italic;
  color: var(--tt-guest-text, #374151);
  letter-spacing: 6px;
  text-transform: uppercase;
  line-height: 1;
}

.app-name {
  font-size: 18px;
  font-weight: 600;
  color: var(--tt-accent, #18a0ff);
  letter-spacing: 10px;
  text-transform: uppercase;
}

/* 长条登录卡片 */
.login-cards {
  display: flex;
  gap: 16px;
  width: 100%;
  max-width: 640px;
  animation: fadeSlideUp 0.8s ease-out 0.7s both;
}

@keyframes fadeSlideUp {
  from {
    opacity: 0;
    transform: translateY(24px);
  }
  to {
    opacity: 1;
    transform: translateY(0);
  }
}

.login-card {
  flex: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
  padding: 24px 12px;
  background: var(--tt-card-bg, #ffffff);
  border: 1.5px solid var(--tt-input-border, rgba(0,0,0,0.1));
  border-radius: 16px;
  cursor: pointer;
  transition: all 0.2s;
  min-height: 110px;
  box-shadow: 0 2px 12px rgba(0,0,0,0.06);
}

.login-card:hover:not(.login-card--disabled) {
  background: var(--tt-card-bg, #ffffff);
  border-color: var(--tt-accent, #18a0ff);
  transform: translateY(-3px);
  box-shadow: 0 6px 20px rgba(0,0,0,0.1);
}

.login-card--disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.card-icon {
  font-size: 32px;
  margin-bottom: 8px;
}

.card-label {
  font-size: 13px;
  color: var(--tt-guest-text, #374151);
  font-weight: 500;
}

.card-soon {
  font-size: 11px;
  color: var(--tt-accent, #18a0ff);
  margin-top: 4px;
}

/* 分割线 */
.divider {
  display: flex;
  align-items: center;
  gap: 16px;
  width: 100%;
  max-width: 640px;
  color: var(--tt-guest-text, #374151);
  font-size: 12px;
  animation: fadeSlideUp 0.8s ease-out 0.85s both;
}

.divider::before,
.divider::after {
  content: "";
  flex: 1;
  height: 1px;
  background: var(--tt-input-border, rgba(0,0,0,0.1));
}

/* 其他链接 */
.other-links {
  display: flex;
  align-items: center;
  gap: 12px;
  font-size: 13px;
  animation: fadeSlideUp 0.8s ease-out 1s both;
}

.link-btn {
  color: var(--tt-guest-text, rgba(55,65,81,0.6)) !important;
  font-size: 13px;
}

.link-btn:hover {
  color: var(--tt-accent, #18a0ff) !important;
}

.link-sep {
  color: var(--tt-input-border, rgba(0,0,0,0.2));
}

/* Method modal */
.method-grid {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 16px;
}

.method-item {
  display: flex;
  flex-direction: column;
  align-items: center;
  padding: 20px 12px;
  background: var(--tt-card-bg, #ffffff);
  border-radius: 12px;
  cursor: pointer;
  transition: background 0.15s;
}

.method-item:hover {
  background: rgba(0,0,0,0.04);
}

.method-icon-lg {
  font-size: 32px;
  margin-bottom: 8px;
}

.method-label {
  font-size: 13px;
  color: var(--tt-guest-text, #374151);
}

.method-item--disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.method-soon {
  font-size: 10px;
  color: var(--tt-accent, #18a0ff);
  margin-top: 4px;
}
</style>