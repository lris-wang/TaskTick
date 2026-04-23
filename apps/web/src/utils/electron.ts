/**
 * electron.ts — Renderer-side helpers for Electron IPC
 *
 * Detects whether we're running inside the TaskTick Electron shell
 * and provides typed wrappers around the exposed desktop API.
 * In a plain browser environment all functions are no-ops / return null.
 */

import type { Project, Task, Tag } from "@tasktick/shared";

// ---------------------------------------------------------------------------
// Global type declaration (matches preload.cjs)
// ---------------------------------------------------------------------------

declare global {
  interface Window {
    tasktickDesktop?: {
      platform: string;
      // Projects
      dbProjectsGetAll: () => Promise<Project[]>;
      dbProjectsUpsert: (project: Project) => Promise<Project>;
      dbProjectsSoftDelete: (id: string) => Promise<boolean>;
      // Tags
      dbTagsGetAll: () => Promise<Tag[]>;
      dbTagsUpsert: (tag: Tag) => Promise<Tag>;
      dbTagsSoftDelete: (id: string) => Promise<boolean>;
      // Tasks
      dbTasksGetAll: () => Promise<Task[]>;
      dbTasksUpsert: (task: Task) => Promise<Task>;
      dbTasksSoftDelete: (id: string) => Promise<boolean>;
      // Notifications
      notify: (title: string, body: string) => Promise<boolean>;
    };
  }
}

// ---------------------------------------------------------------------------
// Detect Electron
// ---------------------------------------------------------------------------

export function isElectron(): boolean {
  return typeof window !== "undefined" && window.tasktickDesktop != null;
}

// ---------------------------------------------------------------------------
// Projects
// ---------------------------------------------------------------------------

export async function dbProjectsGetAll(): Promise<Project[] | null> {
  if (!isElectron()) return null;
  return window.tasktickDesktop!.dbProjectsGetAll();
}

export async function dbProjectsUpsert(project: Project): Promise<Project | null> {
  if (!isElectron()) return null;
  return window.tasktickDesktop!.dbProjectsUpsert(project);
}

export async function dbProjectsSoftDelete(id: string): Promise<boolean> {
  if (!isElectron()) return false;
  return window.tasktickDesktop!.dbProjectsSoftDelete(id);
}

// ---------------------------------------------------------------------------
// Tags
// ---------------------------------------------------------------------------

export async function dbTagsGetAll(): Promise<Tag[] | null> {
  if (!isElectron()) return null;
  return window.tasktickDesktop!.dbTagsGetAll();
}

export async function dbTagsUpsert(tag: Tag): Promise<Tag | null> {
  if (!isElectron()) return null;
  return window.tasktickDesktop!.dbTagsUpsert(tag);
}

export async function dbTagsSoftDelete(id: string): Promise<boolean> {
  if (!isElectron()) return false;
  return window.tasktickDesktop!.dbTagsSoftDelete(id);
}

// ---------------------------------------------------------------------------
// Tasks
// ---------------------------------------------------------------------------

export async function dbTasksGetAll(): Promise<Task[] | null> {
  if (!isElectron()) return null;
  return window.tasktickDesktop!.dbTasksGetAll();
}

export async function dbTasksUpsert(task: Task): Promise<Task | null> {
  if (!isElectron()) return null;
  return window.tasktickDesktop!.dbTasksUpsert(task);
}

export async function dbTasksSoftDelete(id: string): Promise<boolean> {
  if (!isElectron()) return false;
  return window.tasktickDesktop!.dbTasksSoftDelete(id);
}

// ---------------------------------------------------------------------------
// Notifications
// ---------------------------------------------------------------------------

export async function notify(title: string, body: string): Promise<boolean> {
  if (isElectron()) {
    return window.tasktickDesktop!.notify(title, body);
  }
  // Browser: use OS Notification API
  if (!("Notification" in window)) return false;
  if (Notification.permission === "granted") {
    new Notification(title, { body });
    return true;
  }
  if (Notification.permission !== "denied") {
    const perm = await Notification.requestPermission();
    if (perm === "granted") {
      new Notification(title, { body });
      return true;
    }
  }
  return false;
}
