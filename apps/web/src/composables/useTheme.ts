/**
 * Theme / Color scheme management.
 *
 * Two dimensions:
 * - themeMode: "dark" | "light"  (overall background tone)
 * - accentColor: color scheme ID  (sidebar / accent color)
 *
 * Both are persisted in the auth store and applied as CSS variables
 * on the document root so all components can consume them.
 */

import { computed, watch } from "vue";
import { useAuthStore } from "../stores/auth";

export type ThemeMode = "dark" | "light";

export interface ColorSchemeColors {
  /** Sidebar background */
  sidebarBg: string;
  /** Sidebar border color */
  sidebarBorder: string;
  /** Text on sidebar */
  sidebarText: string;
  /** Muted text on sidebar */
  sidebarTextMuted: string;
  /** Active item background */
  sidebarActiveBg: string;
  /** Active item text / accent */
  sidebarActiveText: string;
  /** Overall app background */
  appBg: string;
  /** Card background */
  cardBg: string;
  /** Primary accent color */
  accent: string;
  /** Accent hover color */
  accentHover: string;
  /** Guest page background (login/register/password reset) */
  guestBg: string;
  /** Guest page text color */
  guestText: string;
  /** Input background */
  inputBg: string;
  /** Input border */
  inputBorder: string;
  /** Input text color */
  inputText: string;
  /** Subtle background (e.g. row bg, hover bg) */
  subtleBg: string;
  /** Subtle border */
  subtleBorder: string;
  /** Hover border */
  hoverBorder: string;
  /** Task row border */
  rowBorder: string;
  /** Task row background */
  rowBg: string;
  /** Task row hover background */
  rowHoverBg: string;
  /** Task row hover border */
  rowHoverBorder: string;
  /** Accent background (batch bar, etc) */
  accentBg: string;
  /** Accent border */
  accentBorder: string;
  /** Modal background */
  modalBg: string;
  /** Code block background */
  codeBg: string;
}

export interface ColorScheme {
  id: string;
  name: string;
  dark: ColorSchemeColors;
  light: ColorSchemeColors;
}

export const COLOR_SCHEMES: ColorScheme[] = [
  {
    id: "blue",
    name: "深邃蓝",
    dark: {
      sidebarBg: "linear-gradient(160deg, #0f1923 0%, #162032 100%)",
      sidebarBorder: "rgba(24, 160, 255, 0.15)",
      sidebarText: "#e8edf4",
      sidebarTextMuted: "#7a8fa8",
      sidebarActiveBg: "rgba(24, 160, 255, 0.18)",
      sidebarActiveText: "#18a0ff",
      appBg: "#0a0a0f",
      cardBg: "#18181c",
      accent: "#18a0ff",
      accentHover: "#4db8ff",
      guestBg: "#0a0a0f",
      guestText: "#e8edf4",
      inputBg: "rgba(255, 255, 255, 0.06)",
      inputBorder: "rgba(255, 255, 255, 0.12)",
      inputText: "#e8edf4",
      subtleBg: "rgba(255, 255, 255, 0.04)",
      subtleBorder: "rgba(255, 255, 255, 0.08)",
      hoverBorder: "rgba(24, 160, 255, 0.4)",
      rowBorder: "rgba(255, 255, 255, 0.1)",
      rowBg: "linear-gradient(145deg, rgba(255, 255, 255, 0.05) 0%, rgba(255, 255, 255, 0.02) 100%)",
      rowHoverBg: "rgba(255, 255, 255, 0.06)",
      rowHoverBorder: "rgba(24, 160, 255, 0.35)",
      accentBg: "rgba(24, 160, 255, 0.12)",
      accentBorder: "rgba(24, 160, 255, 0.3)",
      modalBg: "#18181c",
      codeBg: "rgba(0, 0, 0, 0.3)",
    },
    light: {
      sidebarBg: "linear-gradient(160deg, #e8f4ff 0%, #d0e8ff 100%)",
      sidebarBorder: "rgba(24, 160, 255, 0.2)",
      sidebarText: "#1a2a3a",
      sidebarTextMuted: "#5a7a9a",
      sidebarActiveBg: "rgba(24, 160, 255, 0.15)",
      sidebarActiveText: "#0066cc",
      appBg: "#f5f7fa",
      cardBg: "#ffffff",
      accent: "#0066cc",
      accentHover: "#18a0ff",
      guestBg: "#f0f2f5",
      guestText: "#374151",
      inputBg: "#ffffff",
      inputBorder: "rgba(0, 0, 0, 0.12)",
      inputText: "#1a2a3a",
      subtleBg: "rgba(0, 0, 0, 0.03)",
      subtleBorder: "rgba(0, 0, 0, 0.08)",
      hoverBorder: "rgba(0, 102, 204, 0.4)",
      rowBorder: "rgba(0, 0, 0, 0.1)",
      rowBg: "linear-gradient(145deg, rgba(255, 255, 255, 0.96) 0%, rgba(255, 255, 255, 0.88) 100%)",
      rowHoverBg: "rgba(0, 0, 0, 0.04)",
      rowHoverBorder: "rgba(0, 102, 204, 0.35)",
      accentBg: "rgba(0, 102, 204, 0.1)",
      accentBorder: "rgba(0, 102, 204, 0.25)",
      modalBg: "#ffffff",
      codeBg: "rgba(0, 0, 0, 0.06)",
    },
  },
  {
    id: "purple",
    name: "星夜紫",
    dark: {
      sidebarBg: "linear-gradient(160deg, #1a0f2e 0%, #2d1b4e 100%)",
      sidebarBorder: "rgba(168, 85, 247, 0.15)",
      sidebarText: "#e8e0f4",
      sidebarTextMuted: "#8a7aa8",
      sidebarActiveBg: "rgba(168, 85, 247, 0.18)",
      sidebarActiveText: "#a855f7",
      appBg: "#0a0a0f",
      cardBg: "#18181c",
      accent: "#a855f7",
      accentHover: "#c084fc",
      guestBg: "#0a0a0f",
      guestText: "#e8e0f4",
      inputBg: "rgba(255, 255, 255, 0.06)",
      inputBorder: "rgba(255, 255, 255, 0.12)",
      inputText: "#e8e0f4",
      subtleBg: "rgba(255, 255, 255, 0.04)",
      subtleBorder: "rgba(255, 255, 255, 0.08)",
      hoverBorder: "rgba(168, 85, 247, 0.4)",
      rowBorder: "rgba(255, 255, 255, 0.1)",
      rowBg: "linear-gradient(145deg, rgba(255, 255, 255, 0.05) 0%, rgba(255, 255, 255, 0.02) 100%)",
      rowHoverBg: "rgba(255, 255, 255, 0.06)",
      rowHoverBorder: "rgba(168, 85, 247, 0.35)",
      accentBg: "rgba(168, 85, 247, 0.12)",
      accentBorder: "rgba(168, 85, 247, 0.3)",
      modalBg: "#18181c",
      codeBg: "rgba(0, 0, 0, 0.3)",
    },
    light: {
      sidebarBg: "linear-gradient(160deg, #f3e8ff 0%, #e8d0ff 100%)",
      sidebarBorder: "rgba(168, 85, 247, 0.2)",
      sidebarText: "#2a1a3a",
      sidebarTextMuted: "#7a5a9a",
      sidebarActiveBg: "rgba(168, 85, 247, 0.15)",
      sidebarActiveText: "#7c3aed",
      appBg: "#f5f7fa",
      cardBg: "#ffffff",
      accent: "#7c3aed",
      accentHover: "#a855f7",
      guestBg: "#f0f2f5",
      guestText: "#374151",
      inputBg: "#ffffff",
      inputBorder: "rgba(0, 0, 0, 0.12)",
      inputText: "#2a1a3a",
      subtleBg: "rgba(0, 0, 0, 0.03)",
      subtleBorder: "rgba(0, 0, 0, 0.08)",
      hoverBorder: "rgba(124, 58, 237, 0.4)",
      rowBorder: "rgba(0, 0, 0, 0.1)",
      rowBg: "linear-gradient(145deg, rgba(255, 255, 255, 0.96) 0%, rgba(255, 255, 255, 0.88) 100%)",
      rowHoverBg: "rgba(0, 0, 0, 0.04)",
      rowHoverBorder: "rgba(124, 58, 237, 0.35)",
      accentBg: "rgba(124, 58, 237, 0.1)",
      accentBorder: "rgba(124, 58, 237, 0.25)",
      modalBg: "#ffffff",
      codeBg: "rgba(0, 0, 0, 0.06)",
    },
  },
  {
    id: "green",
    name: "森林绿",
    dark: {
      sidebarBg: "linear-gradient(160deg, #0a1f14 0%, #0f3020 100%)",
      sidebarBorder: "rgba(34, 197, 94, 0.15)",
      sidebarText: "#d4f0e0",
      sidebarTextMuted: "#6a9a7a",
      sidebarActiveBg: "rgba(34, 197, 94, 0.18)",
      sidebarActiveText: "#22c55e",
      appBg: "#0a0a0f",
      cardBg: "#18181c",
      accent: "#22c55e",
      accentHover: "#4ade80",
      guestBg: "#0a0a0f",
      guestText: "#d4f0e0",
      inputBg: "rgba(255, 255, 255, 0.06)",
      inputBorder: "rgba(255, 255, 255, 0.12)",
      inputText: "#d4f0e0",
      subtleBg: "rgba(255, 255, 255, 0.04)",
      subtleBorder: "rgba(255, 255, 255, 0.08)",
      hoverBorder: "rgba(34, 197, 94, 0.4)",
      rowBorder: "rgba(255, 255, 255, 0.1)",
      rowBg: "linear-gradient(145deg, rgba(255, 255, 255, 0.05) 0%, rgba(255, 255, 255, 0.02) 100%)",
      rowHoverBg: "rgba(255, 255, 255, 0.06)",
      rowHoverBorder: "rgba(34, 197, 94, 0.35)",
      accentBg: "rgba(34, 197, 94, 0.12)",
      accentBorder: "rgba(34, 197, 94, 0.3)",
      modalBg: "#18181c",
      codeBg: "rgba(0, 0, 0, 0.3)",
    },
    light: {
      sidebarBg: "linear-gradient(160deg, #e8fff0 0%, #d0ffe0 100%)",
      sidebarBorder: "rgba(34, 197, 94, 0.2)",
      sidebarText: "#1a2a1a",
      sidebarTextMuted: "#5a8a5a",
      sidebarActiveBg: "rgba(34, 197, 94, 0.15)",
      sidebarActiveText: "#15803d",
      appBg: "#f5f7fa",
      cardBg: "#ffffff",
      accent: "#15803d",
      accentHover: "#22c55e",
      guestBg: "#f0f2f5",
      guestText: "#374151",
      inputBg: "#ffffff",
      inputBorder: "rgba(0, 0, 0, 0.12)",
      inputText: "#1a2a1a",
      subtleBg: "rgba(0, 0, 0, 0.03)",
      subtleBorder: "rgba(0, 0, 0, 0.08)",
      hoverBorder: "rgba(21, 128, 61, 0.4)",
      rowBorder: "rgba(0, 0, 0, 0.1)",
      rowBg: "linear-gradient(145deg, rgba(255, 255, 255, 0.96) 0%, rgba(255, 255, 255, 0.88) 100%)",
      rowHoverBg: "rgba(0, 0, 0, 0.04)",
      rowHoverBorder: "rgba(21, 128, 61, 0.35)",
      accentBg: "rgba(21, 128, 61, 0.1)",
      accentBorder: "rgba(21, 128, 61, 0.25)",
      modalBg: "#ffffff",
      codeBg: "rgba(0, 0, 0, 0.06)",
    },
  },
  {
    id: "orange",
    name: "落日橙",
    dark: {
      sidebarBg: "linear-gradient(160deg, #1f140a 0%, #302010 100%)",
      sidebarBorder: "rgba(249, 115, 22, 0.15)",
      sidebarText: "#f4e8d4",
      sidebarTextMuted: "#a8886a",
      sidebarActiveBg: "rgba(249, 115, 22, 0.18)",
      sidebarActiveText: "#f97316",
      appBg: "#0a0a0f",
      cardBg: "#18181c",
      accent: "#f97316",
      accentHover: "#fb923c",
      guestBg: "#0a0a0f",
      guestText: "#f4e8d4",
      inputBg: "rgba(255, 255, 255, 0.06)",
      inputBorder: "rgba(255, 255, 255, 0.12)",
      inputText: "#f4e8d4",
      subtleBg: "rgba(255, 255, 255, 0.04)",
      subtleBorder: "rgba(255, 255, 255, 0.08)",
      hoverBorder: "rgba(249, 115, 22, 0.4)",
      rowBorder: "rgba(255, 255, 255, 0.1)",
      rowBg: "linear-gradient(145deg, rgba(255, 255, 255, 0.05) 0%, rgba(255, 255, 255, 0.02) 100%)",
      rowHoverBg: "rgba(255, 255, 255, 0.06)",
      rowHoverBorder: "rgba(249, 115, 22, 0.35)",
      accentBg: "rgba(249, 115, 22, 0.12)",
      accentBorder: "rgba(249, 115, 22, 0.3)",
      modalBg: "#18181c",
      codeBg: "rgba(0, 0, 0, 0.3)",
    },
    light: {
      sidebarBg: "linear-gradient(160deg, #fff4e8 0%, #ffe8d0 100%)",
      sidebarBorder: "rgba(249, 115, 22, 0.2)",
      sidebarText: "#2a1a0a",
      sidebarTextMuted: "#9a6a3a",
      sidebarActiveBg: "rgba(249, 115, 22, 0.15)",
      sidebarActiveText: "#c2410c",
      appBg: "#f5f7fa",
      cardBg: "#ffffff",
      accent: "#c2410c",
      accentHover: "#f97316",
      guestBg: "#f0f2f5",
      guestText: "#374151",
      inputBg: "#ffffff",
      inputBorder: "rgba(0, 0, 0, 0.12)",
      inputText: "#2a1a0a",
      subtleBg: "rgba(0, 0, 0, 0.03)",
      subtleBorder: "rgba(0, 0, 0, 0.08)",
      hoverBorder: "rgba(194, 65, 12, 0.4)",
      rowBorder: "rgba(0, 0, 0, 0.1)",
      rowBg: "linear-gradient(145deg, rgba(255, 255, 255, 0.96) 0%, rgba(255, 255, 255, 0.88) 100%)",
      rowHoverBg: "rgba(0, 0, 0, 0.04)",
      rowHoverBorder: "rgba(194, 65, 12, 0.35)",
      accentBg: "rgba(194, 65, 12, 0.1)",
      accentBorder: "rgba(194, 65, 12, 0.25)",
      modalBg: "#ffffff",
      codeBg: "rgba(0, 0, 0, 0.06)",
    },
  },
  {
    id: "rose",
    name: "玫瑰粉",
    dark: {
      sidebarBg: "linear-gradient(160deg, #1f0f18 0%, #321525 100%)",
      sidebarBorder: "rgba(236, 72, 153, 0.15)",
      sidebarText: "#f4e0e8",
      sidebarTextMuted: "#a87a8a",
      sidebarActiveBg: "rgba(236, 72, 153, 0.18)",
      sidebarActiveText: "#ec4899",
      appBg: "#0a0a0f",
      cardBg: "#18181c",
      accent: "#ec4899",
      accentHover: "#f472b6",
      guestBg: "#0a0a0f",
      guestText: "#f4e0e8",
      inputBg: "rgba(255, 255, 255, 0.06)",
      inputBorder: "rgba(255, 255, 255, 0.12)",
      inputText: "#f4e0e8",
      subtleBg: "rgba(255, 255, 255, 0.04)",
      subtleBorder: "rgba(255, 255, 255, 0.08)",
      hoverBorder: "rgba(236, 72, 153, 0.4)",
      rowBorder: "rgba(255, 255, 255, 0.1)",
      rowBg: "linear-gradient(145deg, rgba(255, 255, 255, 0.05) 0%, rgba(255, 255, 255, 0.02) 100%)",
      rowHoverBg: "rgba(255, 255, 255, 0.06)",
      rowHoverBorder: "rgba(236, 72, 153, 0.35)",
      accentBg: "rgba(236, 72, 153, 0.12)",
      accentBorder: "rgba(236, 72, 153, 0.3)",
      modalBg: "#18181c",
      codeBg: "rgba(0, 0, 0, 0.3)",
    },
    light: {
      sidebarBg: "linear-gradient(160deg, #fff0f4 0%, #ffe0ec 100%)",
      sidebarBorder: "rgba(236, 72, 153, 0.2)",
      sidebarText: "#2a1a1a",
      sidebarTextMuted: "#9a5a7a",
      sidebarActiveBg: "rgba(236, 72, 153, 0.15)",
      sidebarActiveText: "#be185d",
      appBg: "#f5f7fa",
      cardBg: "#ffffff",
      accent: "#be185d",
      accentHover: "#ec4899",
      guestBg: "#f0f2f5",
      guestText: "#374151",
      inputBg: "#ffffff",
      inputBorder: "rgba(0, 0, 0, 0.12)",
      inputText: "#2a1a1a",
      subtleBg: "rgba(0, 0, 0, 0.03)",
      subtleBorder: "rgba(0, 0, 0, 0.08)",
      hoverBorder: "rgba(190, 24, 93, 0.4)",
      rowBorder: "rgba(0, 0, 0, 0.1)",
      rowBg: "linear-gradient(145deg, rgba(255, 255, 255, 0.96) 0%, rgba(255, 255, 255, 0.88) 100%)",
      rowHoverBg: "rgba(0, 0, 0, 0.04)",
      rowHoverBorder: "rgba(190, 24, 93, 0.35)",
      accentBg: "rgba(190, 24, 93, 0.1)",
      accentBorder: "rgba(190, 24, 93, 0.25)",
      modalBg: "#ffffff",
      codeBg: "rgba(0, 0, 0, 0.06)",
    },
  },
  {
    id: "teal",
    name: "冰川青",
    dark: {
      sidebarBg: "linear-gradient(160deg, #0a1f1f 0%, #0f3030 100%)",
      sidebarBorder: "rgba(20, 184, 166, 0.15)",
      sidebarText: "#d4f0f0",
      sidebarTextMuted: "#6a9a9a",
      sidebarActiveBg: "rgba(20, 184, 166, 0.18)",
      sidebarActiveText: "#14b8a6",
      appBg: "#0a0a0f",
      cardBg: "#18181c",
      accent: "#14b8a6",
      accentHover: "#2dd4bf",
      guestBg: "#0a0a0f",
      guestText: "#d4f0f0",
      inputBg: "rgba(255, 255, 255, 0.06)",
      inputBorder: "rgba(255, 255, 255, 0.12)",
      inputText: "#d4f0f0",
      subtleBg: "rgba(255, 255, 255, 0.04)",
      subtleBorder: "rgba(255, 255, 255, 0.08)",
      hoverBorder: "rgba(20, 184, 166, 0.4)",
      rowBorder: "rgba(255, 255, 255, 0.1)",
      rowBg: "linear-gradient(145deg, rgba(255, 255, 255, 0.05) 0%, rgba(255, 255, 255, 0.02) 100%)",
      rowHoverBg: "rgba(255, 255, 255, 0.06)",
      rowHoverBorder: "rgba(20, 184, 166, 0.35)",
      accentBg: "rgba(20, 184, 166, 0.12)",
      accentBorder: "rgba(20, 184, 166, 0.3)",
      modalBg: "#18181c",
      codeBg: "rgba(0, 0, 0, 0.3)",
    },
    light: {
      sidebarBg: "linear-gradient(160deg, #e8fffe 0%, #d0fff8 100%)",
      sidebarBorder: "rgba(20, 184, 166, 0.2)",
      sidebarText: "#1a2a2a",
      sidebarTextMuted: "#5a8a8a",
      sidebarActiveBg: "rgba(20, 184, 166, 0.15)",
      sidebarActiveText: "#0f766e",
      appBg: "#f5f7fa",
      cardBg: "#ffffff",
      accent: "#0f766e",
      accentHover: "#14b8a6",
      guestBg: "#f0f2f5",
      guestText: "#374151",
      inputBg: "#ffffff",
      inputBorder: "rgba(0, 0, 0, 0.12)",
      inputText: "#1a2a2a",
      subtleBg: "rgba(0, 0, 0, 0.03)",
      subtleBorder: "rgba(0, 0, 0, 0.08)",
      hoverBorder: "rgba(15, 118, 110, 0.4)",
      rowBorder: "rgba(0, 0, 0, 0.1)",
      rowBg: "linear-gradient(145deg, rgba(255, 255, 255, 0.96) 0%, rgba(255, 255, 255, 0.88) 100%)",
      rowHoverBg: "rgba(0, 0, 0, 0.04)",
      rowHoverBorder: "rgba(15, 118, 110, 0.35)",
      accentBg: "rgba(15, 118, 110, 0.1)",
      accentBorder: "rgba(15, 118, 110, 0.25)",
      modalBg: "#ffffff",
      codeBg: "rgba(0, 0, 0, 0.06)",
    },
  },
];

const CSS_VAR_PREFIX = "--tt-";

function applyToRoot(_mode: ThemeMode, colors: ColorSchemeColors) {
  const root = document.documentElement;
  root.style.setProperty(`${CSS_VAR_PREFIX}sidebar-bg`, colors.sidebarBg);
  root.style.setProperty(`${CSS_VAR_PREFIX}sidebar-border`, colors.sidebarBorder);
  root.style.setProperty(`${CSS_VAR_PREFIX}sidebar-text`, colors.sidebarText);
  root.style.setProperty(`${CSS_VAR_PREFIX}sidebar-text-muted`, colors.sidebarTextMuted);
  root.style.setProperty(`${CSS_VAR_PREFIX}sidebar-active-bg`, colors.sidebarActiveBg);
  root.style.setProperty(`${CSS_VAR_PREFIX}sidebar-active-text`, colors.sidebarActiveText);
  root.style.setProperty(`${CSS_VAR_PREFIX}app-bg`, colors.appBg);
  root.style.setProperty(`${CSS_VAR_PREFIX}card-bg`, colors.cardBg);
  root.style.setProperty(`${CSS_VAR_PREFIX}accent`, colors.accent);
  root.style.setProperty(`${CSS_VAR_PREFIX}accent-hover`, colors.accentHover);
  root.style.setProperty(`${CSS_VAR_PREFIX}guest-bg`, colors.guestBg);
  root.style.setProperty(`${CSS_VAR_PREFIX}guest-text`, colors.guestText);
  root.style.setProperty(`${CSS_VAR_PREFIX}input-bg`, colors.inputBg);
  root.style.setProperty(`${CSS_VAR_PREFIX}input-border`, colors.inputBorder);
  root.style.setProperty(`${CSS_VAR_PREFIX}input-text`, colors.inputText);
  root.style.setProperty(`${CSS_VAR_PREFIX}subtle-bg`, colors.subtleBg);
  root.style.setProperty(`${CSS_VAR_PREFIX}subtle-border`, colors.subtleBorder);
  root.style.setProperty(`${CSS_VAR_PREFIX}hover-border`, colors.hoverBorder);
  root.style.setProperty(`${CSS_VAR_PREFIX}row-border`, colors.rowBorder);
  root.style.setProperty(`${CSS_VAR_PREFIX}row-bg`, colors.rowBg);
  root.style.setProperty(`${CSS_VAR_PREFIX}row-hover-bg`, colors.rowHoverBg);
  root.style.setProperty(`${CSS_VAR_PREFIX}row-hover-border`, colors.rowHoverBorder);
  root.style.setProperty(`${CSS_VAR_PREFIX}accent-bg`, colors.accentBg);
  root.style.setProperty(`${CSS_VAR_PREFIX}accent-border`, colors.accentBorder);
  root.style.setProperty(`${CSS_VAR_PREFIX}modal-bg`, colors.modalBg);
  root.style.setProperty(`${CSS_VAR_PREFIX}code-bg`, colors.codeBg);
}

export function useTheme() {
  const auth = useAuthStore();

  const themeMode = computed({
    get: () => (auth.themeMode as ThemeMode) ?? "dark",
    set: (val: ThemeMode) => {
      auth.themeMode = val;
    },
  });

  const activeSchemeId = computed({
    get: () => auth.themeAccentColor ?? "blue",
    set: (val: string) => {
      auth.themeAccentColor = val;
    },
  });

  const activeScheme = computed(
    () => COLOR_SCHEMES.find((s) => s.id === activeSchemeId.value) ?? COLOR_SCHEMES[0]!,
  );

  const activeColors = computed(() =>
    themeMode.value === "light" ? activeScheme.value.light : activeScheme.value.dark,
  );

  /** Apply theme to CSS variables whenever mode or scheme changes */
  watch(
    [themeMode, activeColors],
    ([mode, colors]) => {
      applyToRoot(mode, colors);
    },
    { immediate: true },
  );

  return {
    themeMode,
    activeSchemeId,
    activeScheme,
    activeColors,
    COLOR_SCHEMES,
  };
}
