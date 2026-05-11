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
    <!-- 笑脸动画：0~2s 眨眼，然后消失 -->
    <div class="face-row">
      <div class="eye left-eye">●</div>
      <div class="mouth">ᴗ</div>
      <div class="eye right-eye">●</div>
    </div>

    <!-- Welcome TaskTick：2s后淡入，无边框 -->
    <div class="title-big">
      <span class="welcome-text">Welcome</span>
      <span class="app-name">TaskTick</span>
    </div>

    <!-- 长条登录选择区域 -->
    <div class="login-cards">
      <div class="login-card login-card--disabled">
        <div class="card-icon">💬</div>
        <div class="card-label">微信登录</div>
        <div class="card-soon">即将上线</div>
      </div>

      <div class="login-card login-card--disabled">
        <div class="card-icon">🐧</div>
        <div class="card-label">QQ 登录</div>
        <div class="card-soon">即将上线</div>
      </div>

      <div class="login-card" @click="goLogin(1)">
        <div class="card-icon">📱</div>
        <div class="card-label">手机登录</div>
      </div>

      <div class="login-card" @click="goLogin(0)">
        <div class="card-icon">📧</div>
        <div class="card-label">邮箱登录</div>
      </div>
    </div>

    <div class="divider">
      <span>其他方式</span>
    </div>

    <div class="other-links">
      <NButton text class="link-btn" @click="router.push('/register')">邮箱注册</NButton>
      <span class="link-sep">·</span>
      <NButton text class="link-btn" @click="router.push('/phone-register')">手机注册</NButton>
      <span class="link-sep">·</span>
      <NButton text class="link-btn" @click="router.push('/reset-password')">忘记密码</NButton>
    </div>

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
  gap: 32px;
}

/* 笑脸区域：2s 眨眼动画 */
.face-row {
  display: flex;
  align-items: center;
  gap: 20px;
  animation: faceDisappear 0.6s ease-out 2s forwards;
}

@keyframes faceDisappear {
  0% { opacity: 1; transform: scale(1); }
  100% { opacity: 0; transform: scale(0.6); }
}

/* 眼睛：左眼眨眼动画 */
.eye {
  font-size: 32px;
  color: var(--tt-guest-text, #374151);
  line-height: 1;
  user-select: none;
}

.right-eye {
  animation: oneWink 2s ease-in-out forwards;
}

@keyframes oneWink {
  0%, 44% { opacity: 1; transform: scaleY(1); }
  47% { opacity: 0; transform: scaleY(0.05); }
  50% { opacity: 1; transform: scaleY(1); }
  100% { opacity: 1; transform: scaleY(1); }
}

/* 嘴巴 */
.mouth {
  font-size: 26px;
  color: var(--tt-guest-text, #374151);
  line-height: 1;
  user-select: none;
  animation: mouthPop 0.4s cubic-bezier(0.34, 1.56, 0.64, 1) 2s both;
}

@keyframes mouthPop {
  0% { opacity: 0; transform: scale(0.4); }
  100% { opacity: 1; transform: scale(1); }
}

/* Welcome TaskTick 大文字：2s 后淡入，无边框 */
.title-big {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 2px;
  opacity: 0;
  animation: titleAppear 0.8s ease-out 2.2s forwards;
}

@keyframes titleAppear {
  from { opacity: 0; transform: translateY(16px); }
  to   { opacity: 1; transform: translateY(0); }
}

.welcome-text {
  font-size: 72px;
  font-weight: 300;
  font-style: italic;
  color: var(--tt-guest-text, #374151);
  letter-spacing: 8px;
  text-transform: uppercase;
  line-height: 1;
}

.app-name {
  font-size: 22px;
  font-weight: 600;
  color: var(--tt-accent, #18a0ff);
  letter-spacing: 14px;
  text-transform: uppercase;
}

/* 登录卡片 */
.login-cards {
  display: flex;
  gap: 14px;
  width: 100%;
  max-width: 620px;
  animation: fadeUp 0.7s ease-out 0.4s both;
}

@keyframes fadeUp {
  from { opacity: 0; transform: translateY(16px); }
  to   { opacity: 1; transform: translateY(0); }
}

.login-card {
  flex: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
  padding: 22px 12px;
  background: var(--tt-card-bg, #ffffff);
  border: 1.5px solid var(--tt-input-border, rgba(0,0,0,0.1));
  border-radius: 16px;
  cursor: pointer;
  transition: all 0.2s;
  min-height: 105px;
  box-shadow: 0 2px 10px rgba(0,0,0,0.05);
}

.login-card:hover:not(.login-card--disabled) {
  border-color: var(--tt-accent, #18a0ff);
  transform: translateY(-3px);
  box-shadow: 0 6px 20px rgba(0,0,0,0.1);
}

.login-card--disabled {
  opacity: 0.45;
  cursor: not-allowed;
}

.card-icon {
  font-size: 30px;
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
  margin-top: 3px;
}

/* 分割线 */
.divider {
  display: flex;
  align-items: center;
  gap: 16px;
  width: 100%;
  max-width: 620px;
  font-size: 12px;
  color: var(--tt-guest-text, #374151);
  opacity: 0.5;
  animation: fadeUp 0.7s ease-out 0.6s both;
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
  animation: fadeUp 0.7s ease-out 0.8s both;
}

.link-btn {
  color: var(--tt-guest-text, rgba(55,65,81,0.55)) !important;
  font-size: 13px;
}

.link-btn:hover {
  color: var(--tt-accent, #18a0ff) !important;
}

.link-sep {
  color: var(--tt-input-border, rgba(0,0,0,0.15));
}

/* Modal */
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