<script setup lang="ts">
import { NButton, NCard, NForm, NFormItem, NInput, NText } from "naive-ui";
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

const email = ref("");
const password = ref("");
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

async function onSubmit() {
  errorText.value = "";
  loading.value = true;
  try {
    const res = await auth.login(email.value, password.value);
    if (!res.ok) {
      errorText.value = res.message;
      return;
    }
    // Hydrate tasks, projects, tags, and teams after successful login
    await Promise.all([
      taskStore.hydrate(),
      tagStore.hydrate(),
      teamStore.hydrate(),
      teamStore.fetchTeams(),
    ]);
    const redirect = safeRedirectPath(route.query.redirect);
    await router.replace(redirect);
  } catch (err) {
    // Hydration/network errors: show message but keep user logged in
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
      <NForm @submit.prevent="onSubmit">
        <NFormItem label="邮箱">
          <NInput
            v-model:value="email"
            placeholder="your@email.com"
            autocomplete="email"
            :disabled="loading"
            @keyup.enter="onSubmit"
          />
        </NFormItem>
        <NFormItem label="密码">
          <NInput
            v-model:value="password"
            type="password"
            show-password-on="click"
            placeholder="至少 4 位"
            autocomplete="current-password"
            :disabled="loading"
            @keyup.enter="onSubmit"
          />
        </NFormItem>
        <NText v-if="errorText" type="error" class="login-error">{{ errorText }}</NText>
        <NButton type="primary" block size="large" :loading="loading" attr-type="submit">登录</NButton>
      </NForm>
      <template #footer>
        <NText depth="3" style="font-size: 12px; line-height: 1.5">
          还没有账号？
          <router-link to="/register" style="color: var(--tt-accent, #18a0ff); text-decoration: none">立即注册</router-link>
          &nbsp;·&nbsp;
          <router-link to="/reset-password" style="color: var(--tt-accent, #18a0ff); text-decoration: none">忘记密码</router-link>
        </NText>
      </template>
    </NCard>
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
</style>
