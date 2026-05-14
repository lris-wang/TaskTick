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
  type ThemeCommonVars,
} from "naive-ui";
import { computed } from "vue";
import { RouterView } from "vue-router";
import { useAuthStore } from "./stores/auth";
import { COLOR_SCHEMES } from "./composables/useTheme";

const auth = useAuthStore();

const activeScheme = computed(() =>
  COLOR_SCHEMES.find((s) => s.id === auth.themeAccentColor) ?? COLOR_SCHEMES[0]!,
);

const naiveTheme = computed<GlobalTheme | undefined>(() =>
  auth.themeMode === "light" ? lightTheme : darkTheme,
);

const themeOverrides = computed(() => {
  const accent = activeScheme.value[auth.themeMode === "light" ? "light" : "dark"].accent;
  const accentBg = activeScheme.value[auth.themeMode === "light" ? "light" : "dark"].accentBg;
  return {
    common: {
      primaryColor: accent,
      primaryColorHover: accent,
      primaryColorPressed: accent,
      primaryColorSuppl: accent,
    } as Partial<ThemeCommonVars>,
    Switch: {
      railColor: "rgba(255,255,255,0.12)",
      railColorHover: "rgba(255,255,255,0.18)",
      railColorActive: accent,
      buttonColor: "#fff",
    },
  };
});
</script>

<template>
  <NConfigProvider :locale="zhCN" :date-locale="dateZhCN" :theme="naiveTheme" :theme-overrides="themeOverrides">
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

/* NSwitch rail always shows accent color ring */
.n-switch {
  border: 1px solid var(--tt-accent) !important;
}
</style>
