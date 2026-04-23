<script setup lang="ts">
import { NButton, NCard, NForm, NFormItem, NInput, NText, NSpin } from "naive-ui";
import { ref, watch } from "vue";
import { useRouter } from "vue-router";

import { registerWithCode, sendVerifyCode, uploadAvatar } from "../api";

const router = useRouter();

/** 0 = enter email, 1 = enter code+password, 2 = success */
const step = ref(0);

const email = ref("");
const username = ref("");
const password = ref("");
const confirmPassword = ref("");
const avatarUrl = ref(""); // presigned URL from backend
const avatarPreview = ref(""); // local blob URL for preview
const uploadingAvatar = ref(false);
const codeDigits = ref(["", "", "", ""]);
const codeInputRefs = ref<HTMLInputElement[]>([]);
const loading = ref(false);
const sendingCode = ref(false);
const errorText = ref("");

/** Countdown timer for resend */
const countdown = ref(0);
let countdownTimer: ReturnType<typeof setInterval> | null = null;

function startCountdown() {
  countdown.value = 60;
  if (countdownTimer) clearInterval(countdownTimer);
  countdownTimer = setInterval(() => {
    countdown.value--;
    if (countdown.value <= 0) {
      clearInterval(countdownTimer!);
      countdownTimer = null;
    }
  }, 1000);
}

watch(countdown, (v) => {
  if (v === 0 && countdownTimer) {
    clearInterval(countdownTimer);
    countdownTimer = null;
  }
});

watch(step, (s) => {
  if (s === 0) {
    email.value = "";
    username.value = "";
    password.value = "";
    confirmPassword.value = "";
    codeDigits.value = ["", "", "", ""];
    errorText.value = "";
    avatarUrl.value = "";
    avatarPreview.value = "";
    if (countdownTimer) { clearInterval(countdownTimer); countdownTimer = null; }
    countdown.value = 0;
  }
});

async function onAvatarChange(e: Event) {
  const file = (e.target as HTMLInputElement).files?.[0];
  if (!file) return;
  uploadingAvatar.value = true;
  try {
    const url = await uploadAvatar(file);
    if (url) {
      avatarUrl.value = url;
      avatarPreview.value = URL.createObjectURL(file);
    }
  } finally {
    uploadingAvatar.value = false;
  }
}

function triggerAvatarUpload() {
  document.getElementById("avatar-upload-input")?.click();
}

async function onSendCode() {
  errorText.value = "";
  const e = email.value.trim();
  if (!e) { errorText.value = "请输入邮箱"; return; }
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e)) { errorText.value = "请输入有效邮箱"; return; }

  sendingCode.value = true;
  try {
    const ok = await sendVerifyCode(e);
    if (!ok) {
      errorText.value = "发送失败，请稍后重试";
      return;
    }
    step.value = 1;
    startCountdown();
  } finally {
    sendingCode.value = false;
  }
}

function onCodeInput(index: number, e: Event) {
  const target = e.target as HTMLInputElement;
  const val = target.value.replace(/\D/g, "").slice(-1);
  codeDigits.value[index] = val;
  if (val && index < 3) {
    codeInputRefs.value[index + 1]?.focus();
  }
}

function onCodeKeydown(index: number, e: KeyboardEvent) {
  if (e.key === "Backspace" && !codeDigits.value[index] && index > 0) {
    codeInputRefs.value[index - 1]?.focus();
  }
}

function onCodePaste(e: ClipboardEvent) {
  e.preventDefault();
  const pasted = e.clipboardData?.getData("text").replace(/\D/g, "").slice(0, 4) ?? "";
  for (let i = 0; i < 4; i++) {
    codeDigits.value[i] = pasted[i] ?? "";
  }
  if (pasted.length >= 4) {
    const lastFilledIndex = Math.min(pasted.length - 1, 3);
    codeInputRefs.value[lastFilledIndex]?.focus();
  }
}

async function onSubmit() {
  errorText.value = "";
  const code = codeDigits.value.join("");
  if (code.length < 4) { errorText.value = "请输入完整的4位验证码"; return; }
  if (password.value.length < 4) { errorText.value = "密码至少4位"; return; }

  // Validate that email still matches (in case user changed it)
  const e = email.value.trim();
  if (!e || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e)) {
    errorText.value = "请输入有效邮箱";
    step.value = 0;
    return;
  }

  // Store email in session for confirm step
  step.value = 2;
}

async function onConfirmPassword() {
  errorText.value = "";
  if (password.value !== confirmPassword.value) {
    errorText.value = "两次输入的密码不一致";
    return;
  }

  loading.value = true;
  try {
    const e = email.value.trim();
    const code = codeDigits.value.join("");
    const data = await registerWithCode(e, code, password.value, username.value.trim(), avatarUrl.value);
    if ("error" in data) {
      errorText.value = data.error;
      step.value = 1;
      return;
    }
    step.value = 3;
    setTimeout(() => router.push("/login"), 2000);
  } catch (err) {
    errorText.value = err instanceof Error ? err.message : "注册失败";
  } finally {
    loading.value = false;
  }
}
</script>

<template>
  <div class="register-page">
    <NCard class="register-card" :bordered="false" size="huge">
      <template #header>
        <div class="card-header">
          <NText strong style="font-size:18px">注册 TaskTick</NText>
          <NText depth="3" style="font-size:12px">已有账号？<router-link to="/login" style="color:var(--tt-accent,#18a0ff);text-decoration:none">立即登录</router-link></NText>
        </div>
      </template>

      <!-- Step indicators -->
      <div class="step-indicator">
        <div class="step-dot" :class="{ active: step >= 0, done: step > 0 }">
          <span v-if="step === 0">1</span>
          <span v-else>✓</span>
        </div>
        <div class="step-line" :class="{ active: step >= 1 }" />
        <div class="step-dot" :class="{ active: step >= 1, done: step > 1 }">
          <span v-if="step === 1">2</span>
          <span v-else>✓</span>
        </div>
        <div class="step-line" :class="{ active: step >= 2 }" />
        <div class="step-dot" :class="{ active: step >= 2, done: step > 2 }">
          <span v-if="step === 2">3</span>
          <span v-else>✓</span>
        </div>
        <div class="step-line" :class="{ active: step >= 3 }" />
        <div class="step-dot" :class="{ active: step >= 3, done: step > 3 }">
          <span v-if="step === 3">4</span>
          <span v-else>✓</span>
        </div>
      </div>

      <!-- Step 0: Email -->
      <NForm v-if="step === 0" @submit.prevent="onSendCode">
        <!-- Avatar upload -->
        <div class="avatar-upload-area">
          <input
            id="avatar-upload-input"
            type="file"
            accept="image/*"
            style="display:none"
            @change="onAvatarChange"
          />
          <NSpin :show="uploadingAvatar">
            <div class="avatar-circle" :class="{ 'has-avatar': !!avatarPreview }" @click="triggerAvatarUpload">
              <img v-if="avatarPreview" :src="avatarPreview" alt="avatar" class="avatar-img" />
              <span v-else class="avatar-placeholder">+</span>
            </div>
          </NSpin>
          <NText depth="3" style="font-size:11px;margin-top:6px;display:block">点击上传头像</NText>
        </div>

        <NText depth="3" style="display:block;margin-bottom:16px;font-size:13px">
          输入邮箱后，我们将向您发送4位验证码。
        </NText>
        <NFormItem label="邮箱">
          <NInput
            v-model:value="email"
            placeholder="your@email.com"
            autocomplete="email"
            :disabled="sendingCode"
            size="large"
          />
        </NFormItem>
        <NText v-if="errorText" type="error" class="register-error">{{ errorText }}</NText>
        <NButton
          type="primary"
          block
          size="large"
          :loading="sendingCode"
          attr-type="submit"
        >
          {{ sendingCode ? "发送中…" : "发送验证码" }}
        </NButton>
      </NForm>

      <!-- Step 1: Code + Password -->
      <NForm v-else-if="step === 1" @submit.prevent="onSubmit">
        <NText depth="3" style="display:block;margin-bottom:16px;font-size:13px">
          验证码已发送至 <strong>{{ email }}</strong>，请查收。
        </NText>

        <!-- 4-digit code input -->
        <div class="code-inputs" @paste="onCodePaste">
          <input
            v-for="(_, i) in codeDigits"
            :key="i"
            ref="codeInputRefs"
            type="text"
            inputmode="numeric"
            maxlength="1"
            class="code-digit"
            :value="codeDigits[i]"
            :disabled="loading"
            autocomplete="one-time-code"
            @input="onCodeInput(i, $event)"
            @keydown="onCodeKeydown(i, $event)"
          />
        </div>

        <NFormItem label="密码" style="margin-top:16px">
          <NInput
            v-model:value="password"
            type="password"
            show-password-on="click"
            placeholder="至少4位"
            autocomplete="new-password"
            :disabled="loading"
            size="large"
          />
        </NFormItem>
        <NFormItem label="用户名（可选）">
          <NInput
            v-model:value="username"
            placeholder="显示名称"
            autocomplete="username"
            :disabled="loading"
            size="large"
          />
        </NFormItem>

        <NText v-if="errorText" type="error" class="register-error">{{ errorText }}</NText>
        <NButton
          type="primary"
          block
          size="large"
          :loading="loading"
          attr-type="submit"
        >
          下一步
        </NButton>

        <div class="resend-row">
          <NButton text style="color:var(--tt-accent,#18a0ff);font-size:12px" :disabled="loading" @click="step = 0">
            ← 返回修改邮箱
          </NButton>
        </div>

        <div class="resend-row">
          <NText depth="3" style="font-size:12px">
            <template v-if="countdown > 0">
              {{ countdown }}秒后可重新获取
            </template>
            <template v-else>
              没收到验证码？
              <NButton text style="color:var(--tt-accent,#18a0ff);font-size:12px" :disabled="sendingCode" @click="onSendCode">
                重新获取
              </NButton>
            </template>
          </NText>
        </div>
      </NForm>

      <!-- Step 2: Confirm Password -->
      <NForm v-else-if="step === 2" @submit.prevent="onConfirmPassword">
        <NText depth="3" style="display:block;margin-bottom:16px;font-size:13px">
          请再次输入密码以确认。
        </NText>

        <NFormItem label="确认密码">
          <NInput
            v-model:value="confirmPassword"
            type="password"
            show-password-on="click"
            placeholder="再次输入密码"
            autocomplete="new-password"
            :disabled="loading"
            size="large"
          />
        </NFormItem>

        <NText v-if="errorText" type="error" class="register-error">{{ errorText }}</NText>
        <NButton
          type="primary"
          block
          size="large"
          :loading="loading"
          attr-type="submit"
        >
          完成注册
        </NButton>

        <div class="resend-row">
          <NButton text style="color:var(--tt-accent,#18a0ff);font-size:12px" :disabled="loading" @click="step = 1">
            ← 返回修改密码
          </NButton>
        </div>
      </NForm>

      <!-- Step 3: Success -->
      <div v-else-if="step === 3" class="success-area">
        <div class="success-icon">✓</div>
        <NText strong style="font-size:16px;display:block;margin-bottom:8px">注册成功！</NText>
        <NText depth="3" style="font-size:13px">即将跳转到登录页面…</NText>
      </div>
    </NCard>
  </div>
</template>

<style scoped>
.register-page {
  min-height: 100vh;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 24px;
  background: var(--tt-guest-bg, #0a0a0f);
}
.register-card {
  width: min(420px, 100%);
  border-radius: 14px;
  box-shadow: 0 12px 48px rgba(0, 0, 0, 0.45);
  background: var(--tt-card-bg, #18181c);
}
.card-header {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
}

/* Step indicator */
.step-indicator {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 0;
  margin-bottom: 24px;
}
.step-dot {
  width: 28px;
  height: 28px;
  border-radius: 50%;
  border: 2px solid rgba(255, 255, 255, 0.15);
  background: rgba(255, 255, 255, 0.05);
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 12px;
  color: var(--tt-guest-text, rgba(255, 255, 255, 0.35));
  flex-shrink: 0;
  transition: all 0.2s;
}
.step-dot.active {
  border-color: var(--tt-accent, #18a0ff);
  color: var(--tt-accent, #18a0ff);
  background: color-mix(in srgb, var(--tt-accent, #18a0ff) 10%, transparent);
}
.step-dot.done {
  border-color: #22c55e;
  background: rgba(34, 197, 94, 0.1);
  color: #22c55e;
}
.step-line {
  flex: 1;
  height: 2px;
  background: rgba(255, 255, 255, 0.1);
  max-width: 60px;
  transition: background 0.2s;
}
.step-line.active {
  background: color-mix(in srgb, var(--tt-accent, #18a0ff) 40%, transparent);
}

/* Code input */
.code-inputs {
  display: flex;
  gap: 10px;
  justify-content: center;
  margin-bottom: 4px;
}
.code-digit {
  width: 52px;
  height: 56px;
  border-radius: 10px;
  border: 1.5px solid rgba(255, 255, 255, 0.15);
  background: rgba(255, 255, 255, 0.05);
  color: var(--tt-guest-text, #fff);
  font-size: 24px;
  font-weight: 700;
  text-align: center;
  outline: none;
  transition: border-color 0.15s;
  caret-color: var(--tt-accent, #18a0ff);
}
.code-digit:focus {
  border-color: var(--tt-accent, #18a0ff);
  background: color-mix(in srgb, var(--tt-accent, #18a0ff) 6%, transparent);
}

.register-error {
  display: block;
  margin-bottom: 12px;
  font-size: 13px;
}

.resend-row {
  text-align: center;
  margin-top: 12px;
}

.success-area {
  text-align: center;
  padding: 24px 0;
}
.success-icon {
  width: 56px;
  height: 56px;
  border-radius: 50%;
  background: rgba(34, 197, 94, 0.12);
  border: 2px solid #22c55e;
  color: #22c55e;
  font-size: 28px;
  display: flex;
  align-items: center;
  justify-content: center;
  margin: 0 auto 16px;
}

/* Avatar upload */
.avatar-upload-area {
  display: flex;
  flex-direction: column;
  align-items: center;
  margin-bottom: 20px;
}
.avatar-circle {
  width: 72px;
  height: 72px;
  border-radius: 50%;
  border: 2px dashed rgba(255, 255, 255, 0.2);
  background: rgba(255, 255, 255, 0.05);
  display: flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  overflow: hidden;
  transition: border-color 0.15s;
}
.avatar-circle:hover {
  border-color: var(--tt-accent, #18a0ff);
}
.avatar-circle.has-avatar {
  border-style: solid;
  border-color: transparent;
}
.avatar-img {
  width: 100%;
  height: 100%;
  object-fit: cover;
}
.avatar-placeholder {
  font-size: 28px;
  color: rgba(255, 255, 255, 0.3);
  line-height: 1;
}
</style>
