<script setup lang="ts">
import {
  darkTheme,
  lightTheme,
  dateZhCN,
  NConfigProvider,
  NGlobalStyle,
  NMessageProvider,
  zhCN,
  type GlobalTheme,
} from "naive-ui";
import { computed } from "vue";
import { RouterView } from "vue-router";
import { useAuthStore } from "./stores/auth";

const auth = useAuthStore();

const naiveTheme = computed<GlobalTheme | undefined>(() => {
  return auth.themeMode === "light" ? lightTheme : darkTheme;
});
</script>

<template>
  <NConfigProvider :locale="zhCN" :date-locale="dateZhCN" :theme="naiveTheme">
    <NMessageProvider>
      <NGlobalStyle />
      <RouterView />
    </NMessageProvider>
  </NConfigProvider>
</template>

<style>
.n-input:focus,
.n-input:focus-within {
  border-color: var(--tt-accent) !important;
  box-shadow: 0 0 0 2px var(--tt-accent-bg) !important;
}
.n-input.n-input--focused {
  border-color: var(--tt-accent) !important;
  box-shadow: 0 0 0 2px var(--tt-accent-bg) !important;
}
</style>
