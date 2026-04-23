/**
 * useSSE — 前端 SSE（Server-Sent Events）实时推送 hook。
 *
 * 用法：
 *   const { isConnected, on, off } = useSSE()
 *
 * 事件类型（对应后端）：
 *   task_created / task_updated / task_deleted
 *   project_created / project_updated / project_deleted
 *   tag_created / tag_updated / tag_deleted
 *   notify          — 桌面提醒（前端负责弹窗）
 *
 * 示例：
 *   on('task_created', (data) => taskStore.upsertTask(data))
 *   on('notify', ({ title, body }) => new Notification(title, { body }))
 *
 * 连接在 token 变化时自动重连，未登录时自动断开。
 */

import { ref, watch } from "vue";
import { storeToRefs } from "pinia";

import { useAuthStore } from "../stores/auth";

const BASE = import.meta.env.VITE_API_URL ?? "http://127.0.0.1:8000";

// Desktop notification permission request
function ensureNotificationPermission(): void {
  if (typeof Notification === "undefined") return;
  if (Notification.permission === "default") {
    Notification.requestPermission();
  }
}

// 事件总线（模块级，供 off 使用）
type EventHandler = (data: Record<string, unknown>) => void;
const _handlers: Map<string, Set<EventHandler>> = new Map();
let _es: EventSource | null = null;
let _reconnectTimer: ReturnType<typeof setTimeout> | null = null;
let _manualClose = false;

const isConnected = ref(false);

function _dispatch(eventName: string, data: Record<string, unknown>) {
  _handlers.get(eventName)?.forEach((fn) => fn(data));
  _handlers.get("*")?.forEach((fn) => fn({ event: eventName, ...data }));
}

function _connect(token: string) {
  _manualClose = false;
  _close();

  // 请求桌面通知权限
  ensureNotificationPermission();

  const url = `${BASE}/api/v1/events?token=${encodeURIComponent(token)}`;
  const es = new EventSource(url);
  _es = es;

  es.addEventListener("open", () => {
    isConnected.value = true;
    console.debug("[SSE] connected");
  });

  // 通用的 message 兜底（部分客户端把数据放在 e.data 而非按事件名分派）
  es.addEventListener("message", (e) => {
    try {
      const msg = JSON.parse(e.data) as { event?: string; data?: Record<string, unknown> };
      if (msg.event) _dispatch(msg.event, msg.data ?? {});
    } catch {
      /* ignore parse errors */
    }
  });

  // 具名事件
  const eventNames = [
    "task_created", "task_updated", "task_deleted",
    "project_created", "project_updated", "project_deleted",
    "tag_created", "tag_updated", "tag_deleted",
    "notify",
  ];
  for (const name of eventNames) {
    es.addEventListener(name, (e) => {
      try {
        const data = JSON.parse((e as MessageEvent).data) as Record<string, unknown>;
        _dispatch(name, data);
      } catch {
        _dispatch(name, {});
      }
    });
  }

  es.addEventListener("error", () => {
    isConnected.value = false;
    es.close();
    _es = null;
    if (!_manualClose && token) {
      // 指数退避重连，最长 30s
      _reconnectTimer = setTimeout(() => {
        if (!isConnected.value) _connect(token);
      }, Math.min(5000, 1000));
    }
  });
}

function _close() {
  _manualClose = true;
  if (_reconnectTimer) {
    clearTimeout(_reconnectTimer);
    _reconnectTimer = null;
  }
  if (_es) {
    _es.close();
    _es = null;
  }
  isConnected.value = false;
}

/**
 * 订阅 SSE 事件。
 * @param event 事件名，或 "*" 监听所有事件
 * @param handler 回调，接收事件 data payload
 */
export function onSSEEvent(
  event: string,
  handler: EventHandler,
) {
  if (!_handlers.has(event)) {
    _handlers.set(event, new Set());
  }
  _handlers.get(event)!.add(handler);
  return () => offSSEEvent(event, handler);
}

/**
 * 取消订阅。
 */
export function offSSEEvent(event: string, handler: EventHandler) {
  _handlers.get(event)?.delete(handler);
}

export function useSSE() {
  const auth = useAuthStore();
  const { token } = storeToRefs(auth);

  // token 变化时重连
  watch(
    token,
    (newToken) => {
      if (newToken) {
        _connect(newToken);
      } else {
        _close();
      }
    },
    { immediate: true },
  );

  // 全局处理 notify 事件 → OS 桌面通知
  onSSEEvent("notify", (data) => {
    if (typeof Notification === "undefined") return;
    if (Notification.permission !== "granted") return;
    const title = (data.title as string) ?? "TaskTick 提醒";
    const body = (data.body as string) ?? "";
    new Notification(title, { body });
  });

  return {
    isConnected,
    on: onSSEEvent,
    off: offSSEEvent,
    /** 手动断开（不自动重连） */
    disconnect: _close,
  };
}
