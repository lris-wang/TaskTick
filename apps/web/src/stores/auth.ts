import { defineStore } from "pinia";
import { login as apiLogin } from "../api";
import { newId } from "../utils/id";

const STORAGE_KEY = "tasktick.auth.v1";
const DEVICE_ID_KEY = "tasktick.device.id";
/** 与首页「重点提醒」弹窗共用：登录后重新展示，关闭后本会话不再自动弹出 */
export const REMINDER_DISMISS_SESSION_KEY = "tasktick.reminder.dismissed";

export interface AuthPersisted {
  token: string;
  username: string;
  email?: string;
  avatarUrl?: string;
  /** 桌面通知总开关（默认 true），旧数据可能无此字段 */
  desktopNotifyEnabled?: boolean;
  /** 当前主题色系 ID（默认 "blue"） */
  themeAccentColor?: string;
  /** 主题模式："dark" | "light"（默认 "dark"） */
  themeMode?: "dark" | "light";
  /** 侧边栏模块顺序 */
  sidebarModuleOrder?: string[];
}

/** 获取或生成设备 ID */
function getOrCreateDeviceId(): string {
  try {
    let id = localStorage.getItem(DEVICE_ID_KEY);
    if (!id) {
      id = newId();
      localStorage.setItem(DEVICE_ID_KEY, id);
    }
    return id;
  } catch {
    return newId();
  }
}

export const deviceId = getOrCreateDeviceId();

function loadPersisted(): AuthPersisted | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    console.log("[auth] loadPersisted raw:", raw ? "exists" : "null");
    if (!raw) return null;
    const data = JSON.parse(raw) as unknown;
    if (!data || typeof data !== "object") return null;
    const o = data as Record<string, unknown>;
    if (typeof o.token !== "string" || !o.token) return null;
    if (typeof o.username !== "string") return null;
    return {
      token: o.token,
      username: o.username,
      email: o.email as string | undefined,
      avatarUrl: o.avatarUrl as string | undefined,
      desktopNotifyEnabled: o.desktopNotifyEnabled as boolean | undefined,
      themeAccentColor: o.themeAccentColor as string | undefined,
      themeMode: o.themeMode as "dark" | "light" | undefined,
      sidebarModuleOrder: o.sidebarModuleOrder as string[] | undefined,
    };
  } catch (err) {
    console.error("[auth] loadPersisted error:", err);
    return null;
  }
}

export const useAuthStore = defineStore("auth", {
  state: () => ({
    token: null as string | null,
    username: null as string | null,
    email: null as string | null,
    avatarUrl: null as string | null,
    /** 桌面通知总开关，默认 true */
    desktopNotifyEnabled: true,
    /** 当前主题色系 ID，默认 "blue" */
    themeAccentColor: "blue",
    /** 主题模式，默认 "dark" */
    themeMode: "dark" as "dark" | "light",
    /** 侧边栏模块顺序，默认 [list, pomodoro, stats, search, habits, notes] */
    sidebarModuleOrder: ["list", "pomodoro", "stats", "search", "habits", "notes"],
    /** 是否已完成 hydrate（防止 beforeEach 在 hydrate 前执行） */
    hydrated: false,
  }),
  getters: {
    isLoggedIn: (s): boolean => Boolean(s.token),
  },
  actions: {
    hydrate() {
      // 如果已经有 token（已登录），不再从 localStorage 覆盖
      if (this.token) {
        this.hydrated = true;
        return;
      }
      const p = loadPersisted();
      console.log("[auth] hydrate:", p ? `loaded token=${p.token.slice(0, 20)}...` : "null");
      if (!p) {
        this.hydrated = true;
        return;
      }
      this.token = p.token;
      this.username = p.username;
      this.email = p.email ?? null;
      this.avatarUrl = p.avatarUrl ?? null;
      this.desktopNotifyEnabled = p.desktopNotifyEnabled ?? true;
      this.themeAccentColor = p.themeAccentColor ?? "blue";
      this.themeMode = p.themeMode ?? "dark";
      this.sidebarModuleOrder = p.sidebarModuleOrder ?? ["list", "pomodoro", "stats", "search", "habits", "notes"];
      this.hydrated = true;
      console.log("[auth] hydrate done, isLoggedIn=", this.isLoggedIn);
    },
    persist() {
      try {
        if (!this.token) {
          console.log("[auth] persist: no token, removing");
          localStorage.removeItem(STORAGE_KEY);
          return;
        }
        const body: AuthPersisted = {
          token: this.token,
          username: this.username ?? "",
          email: this.email ?? undefined,
          avatarUrl: this.avatarUrl ?? undefined,
          desktopNotifyEnabled: this.desktopNotifyEnabled,
          themeAccentColor: this.themeAccentColor,
          themeMode: this.themeMode,
          sidebarModuleOrder: this.sidebarModuleOrder,
        };
        localStorage.setItem(STORAGE_KEY, JSON.stringify(body));
      } catch (err) {
        console.error("[auth] persist error:", err);
      }
    },
    /**
     * 本地演示登录；后续可改为请求 FastAPI `/auth/login` 并写入真实 token。
     */
    async login(email: string, password: string): Promise<{ ok: true } | { ok: false; message: string }> {
      const e = email.trim();
      if (!e) return { ok: false, message: "请输入邮箱" };
      if (password.length < 4) return { ok: false, message: "密码至少 4 位" };
      const data = await apiLogin(e, password);
      if ("error" in data) return { ok: false, message: data.error };

      const token = data.access_token;
      const username = data.username || data.email?.split("@")[0] || "user";
      const email_ = data.email;

      console.log("[auth] login setting token:", token?.slice(0, 20), "username:", username);
      this.token = token;
      this.username = username;
      this.email = email_;
      this.avatarUrl = data.avatar_url || null;

      const json = JSON.stringify({
        token: this.token,
        username: this.username,
        email: this.email,
        avatarUrl: this.avatarUrl,
        desktopNotifyEnabled: this.desktopNotifyEnabled,
        themeAccentColor: this.themeAccentColor,
        themeMode: this.themeMode,
        sidebarModuleOrder: this.sidebarModuleOrder,
      });
      console.log("[auth] login writing to localStorage:", json.slice(0, 80));
      localStorage.setItem(STORAGE_KEY, json);
      console.log("[auth] login localStorage set, reading back:", localStorage.getItem(STORAGE_KEY)?.slice(0, 80));
      this.persist();
      this.hydrated = true;

      try {
        sessionStorage.removeItem(REMINDER_DISMISS_SESSION_KEY);
      } catch {
        /* ignore */
      }
      return { ok: true };
    },
    async logout() {
      // Directly call logout API to blacklist token, avoiding circular import with api module
      const token = this.token;
      try {
        await fetch(`/api/v1/auth/logout`, {
          method: "POST",
          headers: token ? { Authorization: `Bearer ${token}` } : {},
        });
      } catch {
        /* ignore — logout must never block local cleanup */
      }
      this.token = null;
      this.username = null;
      this.email = null;
      this.avatarUrl = null;
      this.persist();
      try {
        sessionStorage.removeItem(REMINDER_DISMISS_SESSION_KEY);
      } catch {
        /* ignore */
      }
    },
    toggleDesktopNotify() {
      this.desktopNotifyEnabled = !this.desktopNotifyEnabled;
      this.persist();
    },
  },
});
