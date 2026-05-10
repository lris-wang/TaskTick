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
    <!-- 花体 welcome -->
    <div class="welcome-title">
      <span class="welcome-text">Welcome</span>
      <span class="app-name">TaskTick</span>
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
      <NButton text class="link-btn" @click="router.push('/register')">
        邮箱注册
      </NButton>
      <span class="link-sep">·</span>
      <NButton text class="link-btn" @click="router.push('/phone-register')">
        手机注册
      </NButton>
      <span class="link-sep">·</span>
      <NButton text class="link-btn" @click="router.push('/reset-password')">
        忘记密码
      </NButton>
    </div>

    <!-- Method selection modal -->
    <NModal v-model:show="showMethodModal" preset="card" title="更多登录方式" style="width: 320px;" :bordered="false">
      <div class="method-grid">
        <div class="method-item method-item--disabled" @click="showMethodModal = false">
          <span class="method-icon-lg">💬</span>
          <span class="method-label">微信登录</span>
          <span class="method-soon">即将上线</span>
        </div>
        <div class="method-item method-item--disabled" @click="showMethodModal = false">
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
  background: var(--tt-guest-bg, #0a0a0f);
  gap: 40px;
}

/* 花体 welcome */
.welcome-title {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 8px;
}

.welcome-text {
  font-size: 56px;
  font-weight: 300;
  font-style: italic;
  color: rgba(255, 255, 255, 0.85);
  letter-spacing: 8px;
  text-transform: uppercase;
}

.app-name {
  font-size: 20px;
  font-weight: 600;
  color: var(--tt-accent, #18a0ff);
  letter-spacing: 12px;
}

/* 长条登录卡片 */
.login-cards {
  display: flex;
  gap: 16px;
  width: 100%;
  max-width: 640px;
}

.login-card {
  flex: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
  padding: 28px 16px;
  background: rgba(255, 255, 255, 0.06);
  border: 1.5px solid rgba(255, 255, 255, 0.08);
  border-radius: 16px;
  cursor: pointer;
  transition: all 0.2s;
  min-height: 120px;
}

.login-card:hover:not(.login-card--disabled) {
  background: rgba(255, 255, 255, 0.1);
  border-color: rgba(255, 255, 255, 0.2);
  transform: translateY(-2px);
}

.login-card--disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.card-icon {
  font-size: 36px;
  margin-bottom: 10px;
}

.card-label {
  font-size: 14px;
  color: rgba(255, 255, 255, 0.8);
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
  color: rgba(255, 255, 255, 0.25);
  font-size: 12px;
}

.divider::before,
.divider::after {
  content: "";
  flex: 1;
  height: 1px;
  background: rgba(255, 255, 255, 0.1);
}

/* 其他链接 */
.other-links {
  display: flex;
  align-items: center;
  gap: 12px;
  font-size: 13px;
}

.link-btn {
  color: rgba(255, 255, 255, 0.5) !important;
  font-size: 13px;
}

.link-btn:hover {
  color: var(--tt-accent, #18a0ff) !important;
}

.link-sep {
  color: rgba(255, 255, 255, 0.2);
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
  background: rgba(255, 255, 255, 0.05);
  border-radius: 12px;
  cursor: pointer;
  transition: background 0.15s;
}

.method-item:hover {
  background: rgba(255, 255, 255, 0.1);
}

.method-icon-lg {
  font-size: 32px;
  margin-bottom: 8px;
}

.method-label {
  font-size: 13px;
  color: rgba(255, 255, 255, 0.7);
}

.method-item--disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.method-item--disabled:hover {
  background: rgba(255, 255, 255, 0.05);
}

.method-soon {
  font-size: 10px;
  color: var(--tt-accent, #18a0ff);
  margin-top: 4px;
}
</style>