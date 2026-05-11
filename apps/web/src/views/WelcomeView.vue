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
    <!-- 标题卡片 -->
    <div class="title-card">
      <span class="welcome-text">Welcome</span>
      <span class="app-name">TaskTick</span>
    </div>

    <!-- 长条登录选择区域 -->
    <div class="login-cards">
      <!-- 微信登录 -->
      <div class="login-card login-card--disabled">
        <div class="card-icon">💬</div>
        <div class="card-label">微信登录</div>
        <div class="card-soon">即将上线</div>
      </div>

      <!-- QQ 登录 -->
      <div class="login-card login-card--disabled">
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
  gap: 36px;
}

/* 标题卡片：干净文字 */
.title-card {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 4px;
  background: var(--tt-card-bg, #ffffff);
  border-radius: 20px;
  padding: 24px 48px 20px;
  box-shadow: 0 8px 32px rgba(0,0,0,0.08);
  border: 1.5px solid var(--tt-input-border, rgba(0,0,0,0.08));
  animation: emergeIn 0.9s cubic-bezier(0.16, 1, 0.3, 1) 0.1s both;
}

@keyframes emergeIn {
  0% {
    opacity: 0;
    transform: translateY(40px) scale(0.92);
    filter: blur(8px);
  }
  100% {
    opacity: 1;
    transform: translateY(0) scale(1);
    filter: blur(0);
  }
}

.welcome-text {
  font-size: 48px;
  font-weight: 300;
  font-style: italic;
  color: var(--tt-guest-text, #374151);
  letter-spacing: 5px;
  text-transform: uppercase;
  line-height: 1;
}

.app-name {
  font-size: 17px;
  font-weight: 600;
  color: var(--tt-accent, #18a0ff);
  letter-spacing: 10px;
  text-transform: uppercase;
}

/* 长条登录卡片 */
.login-cards {
  display: flex;
  gap: 14px;
  width: 100%;
  max-width: 620px;
  animation: fadeUp 0.7s ease-out 0.5s both;
}

@keyframes fadeUp {
  from { opacity: 0; transform: translateY(20px); }
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
  animation: fadeUp 0.7s ease-out 0.7s both;
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
  animation: fadeUp 0.7s ease-out 0.9s both;
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