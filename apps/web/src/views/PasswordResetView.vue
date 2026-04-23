<script setup lang="ts">
import { NButton, NCard, NForm, NFormItem, NInput, NText } from "naive-ui";
import { ref } from "vue";
import { useRouter } from "vue-router";

import { resetPassword, sendResetCode } from "../api";

const router = useRouter();

/** 0 = enter email, 1 = enter code + new password, 2 = success */
const step = ref(0);

const email = ref("");
const codeDigits = ref(["", "", "", ""]);
const codeInputRefs = ref<HTMLInputElement[]>([]);
const password = ref("");
const confirmPassword = ref("");
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

async function onSendCode() {
  errorText.value = "";
  const e = email.value.trim();
  if (!e) { errorText.value = "请输入邮箱"; return; }
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e)) { errorText.value = "请输入有效邮箱"; return; }

  sendingCode.value = true;
  try {
    const ok = await sendResetCode(e);
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
  if (password.value !== confirmPassword.value) { errorText.value = "两次输入的密码不一致"; return; }

  loading.value = true;
  try {
    const e = email.value.trim();
    const ok = await resetPassword(e, code, password.value);
    if (!ok) {
      errorText.value = "验证码错误或已过期，请重新获取";
      return;
    }
    step.value = 2;
    setTimeout(() => router.push("/login"), 2000);
  } finally {
    loading.value = false;
  }
}
</script>

<template>
  <div class="reset-page">
    <NCard class="reset-card" :bordered="false" size="huge">
      <template #header>
        <div class="card-header">
          <NText strong style="font-size:18px">重置密码</NText>
          <NText depth="3" style="font-size:12px">想起密码了？<router-link to="/login" style="color:var(--tt-accent,#18a0ff);text-decoration:none">立即登录</router-link></NText>
        </div>
      </template>

      <!-- Step 0: Email -->
      <NForm v-if="step === 0" @submit.prevent="onSendCode">
        <NText depth="3" style="display:block;margin-bottom:16px;font-size:13px">
          输入您注册时使用的邮箱，我们将向您发送4位验证码。
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
        <NText v-if="errorText" type="error" class="reset-error">{{ errorText }}</NText>
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

      <!-- Step 1: Code + New Password -->
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

        <NFormItem label="新密码" style="margin-top:16px">
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

        <NText v-if="errorText" type="error" class="reset-error">{{ errorText }}</NText>
        <NButton
          type="primary"
          block
          size="large"
          :loading="loading"
          attr-type="submit"
        >
          重置密码
        </NButton>

        <div class="resend-row">
          <NButton text style="color:var(--tt-accent,#18a0ff);font-size:12px" :disabled="loading" @click="step = 0">
            ← 修改邮箱
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

      <!-- Step 2: Success -->
      <div v-else-if="step === 2" class="success-area">
        <div class="success-icon">✓</div>
        <NText strong style="font-size:16px;display:block;margin-bottom:8px">密码重置成功！</NText>
        <NText depth="3" style="font-size:13px">即将跳转到登录页面…</NText>
      </div>
    </NCard>
  </div>
</template>

<style scoped>
.reset-page {
  min-height: 100vh;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 24px;
  background: var(--tt-guest-bg, #0a0a0f);
}
.reset-card {
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

.reset-error {
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
</style>
