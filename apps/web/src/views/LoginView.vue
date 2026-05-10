<script setup lang="ts">
import { NButton, NCard, NForm, NFormItem, NInput, NText, NModal } from "naive-ui";
import { ref } from "vue";
import { useRoute, useRouter } from "vue-router";

import { useAuthStore } from "../stores/auth";
import { useTaskStore } from "../stores/task";
import { useTagStore } from "../stores/tag";
import { useTeamStore } from "../stores/team";

const router = useRouter();
const route = useRoute();
const auth = useAuthStore();
const taskStore = useTaskStore();
const tagStore = useTagStore();
const teamStore = useTeamStore();

/** 0 = email+password, 1 = phone */
const loginMethod = ref(Number(route.query.method ?? 0));
const showMethodModal = ref(false);

const email = ref("");
const password = ref("");
const phone = ref("");
const loading = ref(false);
const errorText = ref("");

function safeRedirectPath(raw: unknown): string {
  if (typeof raw !== "string" || !raw.startsWith("/") || raw.startsWith("//")) {
    return "/";
  }
  if (raw === "/login" || raw.startsWith("/login?")) {
    return "/";
  }
  return raw;
}

function selectMethod(method: number) {
  loginMethod.value = method;
  showMethodModal.value = false;
}

async function onSubmit() {
  errorText.value = "";
  loading.value = true;
  try {
    if (loginMethod.value === 0) {
      const res = await auth.login(email.value, password.value);
      if (!res.ok) {
        errorText.value = res.message;
        loading.value = false;
        return;
      }
    } else if (loginMethod.value === 1) {
      const res = await auth.phoneLogin(phone.value, password.value);
      if (!res.ok) {
        errorText.value = res.message;
        loading.value = false;
        return;
      }
    }
    await Promise.all([
      taskStore.hydrate(),
      tagStore.hydrate(),
      teamStore.hydrate(),
      teamStore.fetchTeams(),
    ]);
    const redirect = safeRedirectPath(route.query.redirect);
    await router.replace(redirect);
  } catch (err) {
    errorText.value = "数据加载失败，请刷新重试";
    console.error("[Login] hydrate error:", err);
  } finally {
    loading.value = false;
  }
}
</script>

<template>
  <div class="login-page">
    <NCard class="login-card" title="登录 TaskTick" :bordered="false" size="huge">
      <!-- Login method selector -->
      <div class="method-selector" @click="showMethodModal = true">
        <span class="method-icon">
          <template v-if="loginMethod === 0">📧</template>
          <template v-else>📱</template>
        </span>
        <span class="method-name">
          <template v-if="loginMethod === 0">邮箱密码登录</template>
          <template v-else>手机登录</template>
        </span>
        <span class="method-arrow">▼</span>
      </div>

      <NForm @submit.prevent="onSubmit">
        <NFormItem v-if="loginMethod !== 1" label="邮箱">
          <NInput
            v-model:value="email"
            placeholder="your@email.com"
            autocomplete="email"
            :disabled="loading"
          />
        </NFormItem>
        <NFormItem v-if="loginMethod === 0" label="密码">
          <NInput
            v-model:value="password"
            type="password"
            show-password-on="click"
            placeholder="至少 4 位"
            autocomplete="current-password"
            :disabled="loading"
          />
        </NFormItem>
        <NFormItem v-if="loginMethod === 1" label="手机号">
          <NInput
            v-model:value="phone"
            placeholder="请输入手机号"
            :disabled="loading"
          />
        </NFormItem>
        <NFormItem v-if="loginMethod === 1" label="密码">
          <NInput
            v-model:value="password"
            type="password"
            show-password-on="click"
            placeholder="至少 4 位"
            autocomplete="current-password"
            :disabled="loading"
          />
        </NFormItem>

        <NText v-if="errorText" type="error" class="login-error">{{ errorText }}</NText>
        <NButton type="primary" block size="large" :loading="loading" attr-type="submit">登录</NButton>
      </NForm>
      <template #footer>
        <NText depth="3" style="font-size: 12px; line-height: 1.5">
          <NButton v-if="loginMethod === 1" text style="color: var(--tt-accent, #18a0ff); font-size: 12px" @click="router.push('/welcome')">
            ← 返回
          </NButton>
          <span v-if="loginMethod === 1"> · </span>
          还没有账号？
          <router-link v-if="loginMethod === 0" to="/register" style="color: var(--tt-accent, #18a0ff); text-decoration: none">立即注册</router-link>
          <router-link v-else to="/phone-register" style="color: var(--tt-accent, #18a0ff); text-decoration: none">立即注册</router-link>
          &nbsp;·&nbsp;
          <router-link to="/reset-password" style="color: var(--tt-accent, #18a0ff); text-decoration: none">忘记密码</router-link>
        </NText>
      </template>
    </NCard>

    <!-- Method selection modal -->
    <NModal v-model:show="showMethodModal" preset="card" title="选择登录方式" style="width: 320px;" :bordered="false">
      <div class="method-grid">
        <div class="method-item" @click="selectMethod(0)">
          <span class="method-icon-lg">📧</span>
          <span class="method-label">邮箱密码登录</span>
        </div>
        <div class="method-item" @click="selectMethod(1)">
          <span class="method-icon-lg">📱</span>
          <span class="method-label">手机登录</span>
        </div>
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
.login-page {
  min-height: 100vh;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 24px;
  background: var(--tt-guest-bg, #0a0a0f);
}
.login-card {
  width: min(400px, 100%);
  border-radius: 14px;
  box-shadow: 0 12px 48px rgba(0, 0, 0, 0.45);
  background: var(--tt-card-bg, #18181c);
}
.login-error {
  display: block;
  margin-bottom: 12px;
  font-size: 13px;
}
.method-selector {
  display: flex;
  align-items: center;
  padding: 12px 16px;
  background: rgba(255, 255, 255, 0.05);
  border-radius: 10px;
  cursor: pointer;
  margin-bottom: 16px;
  transition: background 0.15s;
}
.method-selector:hover {
  background: rgba(255, 255, 255, 0.1);
}
.method-icon {
  font-size: 24px;
  margin-right: 12px;
}
.method-name {
  flex: 1;
  font-size: 14px;
  color: rgba(255, 255, 255, 0.8);
}
.method-arrow {
  font-size: 12px;
  color: rgba(255, 255, 255, 0.4);
}
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