/**
 * Mobile utilities for Capacitor plugins
 * These functions are no-ops in browser/web environment.
 */

import type { Task } from "@tasktick/shared";

// Track if we're in Capacitor environment
let isCapacitor: boolean | null = null;

export async function isCapacitorApp(): Promise<boolean> {
  if (isCapacitor !== null) return isCapacitor;
  try {
    // @ts-expect-error Capacitor global
    isCapacitor = typeof window !== "undefined" && typeof window.Capacitor !== "undefined";
  } catch {
    isCapacitor = false;
  }
  return isCapacitor;
}

// ---------------------------------------------------------------------------
// Haptics
// ---------------------------------------------------------------------------

export async function hapticsImpact(style: "light" | "medium" | "heavy" = "medium"): Promise<void> {
  if (!(await isCapacitorApp())) return;
  try {
    // @ts-expect-error Capacitor plugins
    const { Haptics, ImpactStyle } = await import("@capacitor/haptics");
    const styleMap: Record<string, "Light" | "Medium" | "Heavy"> = {
      light: "Light",
      medium: "Medium",
      heavy: "Heavy",
    };
    await Haptics.impact({ style: styleMap[style] as "Light" | "Medium" | "Heavy" });
  } catch {
    // Ignore if haptics not available
  }
}

export async function hapticsNotification(type: "success" | "warning" | "error" = "success"): Promise<void> {
  if (!(await isCapacitorApp())) return;
  try {
    // @ts-expect-error Capacitor plugins
    const { Haptics, NotificationType } = await import("@capacitor/haptics");
    const typeMap: Record<string, "Success" | "Warning" | "Error"> = {
      success: "Success",
      warning: "Warning",
      error: "Error",
    };
    await Haptics.notification({ type: typeMap[type] as "Success" | "Warning" | "Error" });
  } catch {
    // Ignore if haptics not available
  }
}

// ---------------------------------------------------------------------------
// Status Bar
// ---------------------------------------------------------------------------

export async function setStatusBarStyle(dark: boolean): Promise<void> {
  if (!(await isCapacitorApp())) return;
  try {
    // @ts-expect-error Capacitor plugins
    const { StatusBar } = await import("@capacitor/status-bar");
    await StatusBar.setStyle({ style: dark ? "DARK" : "LIGHT" });
  } catch {
    // Ignore if status bar not available
  }
}

export async function setStatusBarBackground(color: string): Promise<void> {
  if (!(await isCapacitorApp())) return;
  try {
    // @ts-expect-error Capacitor plugins
    const { StatusBar } = await import("@capacitor/status-bar");
    await StatusBar.setBackgroundColor({ color });
  } catch {
    // Ignore if status bar not available
  }
}

// ---------------------------------------------------------------------------
// Splash Screen
// ---------------------------------------------------------------------------

export async function hideSplashScreen(): Promise<void> {
  if (!(await isCapacitorApp())) return;
  try {
    // @ts-expect-error Capacitor plugins
    const { SplashScreen } = await import("@capacitor/splash-screen");
    await SplashScreen.hide();
  } catch {
    // Ignore if splash screen not available
  }
}

// ---------------------------------------------------------------------------
// Local Notifications
// ---------------------------------------------------------------------------

export async function requestNotificationPermissions(): Promise<boolean> {
  if (!(await isCapacitorApp())) return false;
  try {
    // @ts-expect-error Capacitor plugins
    const { LocalNotifications } = await import("@capacitor/local-notifications");
    const result = await LocalNotifications.requestPermissions();
    return result.granted;
  } catch {
    return false;
  }
}

export async function scheduleTaskReminder(task: Task, fireTime: Date): Promise<string> {
  if (!(await isCapacitorApp())) return "";
  try {
    // @ts-expect-error Capacitor plugins
    const { LocalNotifications } = await import("@capacitor/local-notifications");
    const id = `task-${task.id}-${Date.now()}`;
    await LocalNotifications.schedule({
      notifications: [
        {
          id: id,
          title: "TaskTick 任务提醒",
          body: task.title,
          schedule: { at: fireTime },
        },
      ],
    });
    return id;
  } catch {
    return "";
  }
}

export async function cancelNotification(id: string): Promise<void> {
  if (!(await isCapacitorApp())) return;
  try {
    // @ts-expect-error Capacitor plugins
    const { LocalNotifications } = await import("@capacitor/local-notifications");
    await LocalNotifications.cancel({ notifications: [{ id }] });
  } catch {
    // Ignore if notifications not available
  }
}

// ---------------------------------------------------------------------------
// App Update
// ---------------------------------------------------------------------------

export async function checkForAppUpdate(): Promise<{ available: boolean; version?: string }> {
  if (!(await isCapacitorApp())) return { available: false };
  try {
    // @ts-expect-error Capacitor plugins
    const { Updater } = await import("@capacitor/updater");
    const update = await Updater.check();
    return { available: !!update, version: update.version };
  } catch {
    return { available: false };
  }
}

export async function downloadAndInstallUpdate(): Promise<void> {
  if (!(await isCapacitorApp())) return;
  try {
    // @ts-expect-error Capacitor plugins
    const { Updater } = await import("@capacitor/updater");
    await Updater.downloadUpdate();
    await Updater.installUpdate();
  } catch {
    // Ignore if updater not available
  }
}
