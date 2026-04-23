/**
 * usePushNotification — manage Web Push subscription lifecycle.
 *
 * Call `subscribe()` to opt in (requests permission + subscribes with the SW).
 * Call `unsubscribe()` to opt out.
 * Call `init()` on app startup to restore subscription state.
 */

import { usePushSubscriptionStore } from "../stores/pushSubscription";

const PUSH_API_BASE = import.meta.env.VITE_API_BASE || "";

function isLoggedIn(): boolean {
  try {
    const raw = localStorage.getItem("tasktick.auth.v1");
    if (!raw) return false;
    const parsed = JSON.parse(raw);
    return Boolean(parsed.token);
  } catch {
    return false;
  }
}

function urlBase64ToUint8Array(base64: string): Uint8Array {
  const padding = "=".repeat((4 - (base64.length % 4)) % 4);
  const b64 = (base64 + padding).replace(/-/g, "+").replace(/_/g, "/");
  const raw = window.atob(b64);
  const output = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; ++i) {
    output[i] = raw.charCodeAt(i);
  }
  return output;
}

async function getVapidPublicKey(): Promise<string> {
  const res = await fetch(`${PUSH_API_BASE}/api/v1/push/vapid-key`);
  if (!res.ok) throw new Error("Failed to get VAPID key");
  const data = await res.json();
  return (data as { public_key: string }).public_key;
}

async function saveSubscription(subscription: PushSubscriptionJSON): Promise<void> {
  const res = await fetch(`${PUSH_API_BASE}/api/v1/push/subscribe`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${localStorage.getItem("tasktick.auth.v1") ? JSON.parse(localStorage.getItem("tasktick.auth.v1")!).token : ""}`,
    },
    body: JSON.stringify({
      endpoint: subscription.endpoint,
      p256dh: subscription.keys!.p256dh,
      auth: subscription.keys!.auth,
    }),
  });
  if (!res.ok) throw new Error("Failed to save subscription");
}

async function deleteSubscription(): Promise<void> {
  const res = await fetch(`${PUSH_API_BASE}/api/v1/push/unsubscribe`, {
    method: "DELETE",
    headers: {
      Authorization: `Bearer ${localStorage.getItem("tasktick.auth.v1") ? JSON.parse(localStorage.getItem("tasktick.auth.v1")!).token : ""}`,
    },
  });
  if (!res.ok) throw new Error("Failed to delete subscription");
}

export function usePushNotification() {
  const subStore = usePushSubscriptionStore();

  /** Restore subscription state from browser + localStorage on startup */
  async function init(): Promise<void> {
    subStore.hydrate();
    if (!("serviceWorker" in navigator) || !("PushManager" in window)) return;

    try {
      const reg = await navigator.serviceWorker.ready;
      const existing = await reg.pushManager.getSubscription();
      if (existing && isLoggedIn()) {
        subStore.setSubscribed(true);
      } else if (!existing) {
        subStore.setSubscribed(false);
      }
    } catch {
      /* SW not registered yet */
    }
  }

  /** Subscribe to Web Push notifications */
  async function subscribe(): Promise<boolean> {
    if (!("serviceWorker" in navigator) || !("PushManager" in window)) {
      return false;
    }

    const perm = await Notification.requestPermission();
    if (perm !== "granted") return false;

    try {
      const reg = await navigator.serviceWorker.ready;
      const existing = await reg.pushManager.getSubscription();
      if (existing) {
        await existing.unsubscribe();
      }

      const publicKey = await getVapidPublicKey();
      const sub = await reg.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(publicKey),
      });

      await saveSubscription(sub.toJSON());
      subStore.setSubscribed(true);
      return true;
    } catch (e) {
      console.error("[push] subscribe failed:", e);
      return false;
    }
  }

  /** Unsubscribe from Web Push */
  async function unsubscribe(): Promise<void> {
    if (!("serviceWorker" in navigator) || !("PushManager" in window)) return;

    try {
      const reg = await navigator.serviceWorker.ready;
      const sub = await reg.pushManager.getSubscription();
      if (sub) {
        await sub.unsubscribe();
      }
    } catch {
      /* ignore */
    }

    await deleteSubscription().catch(() => null);
    subStore.setSubscribed(false);
  }

  return { init, subscribe, unsubscribe, isSubscribed: subStore.isSubscribed };
}
