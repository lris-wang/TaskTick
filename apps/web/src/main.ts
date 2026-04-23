import { createApp } from "vue";

import naive from "naive-ui";
import { i18n } from "./locales";

import App from "./App.vue";

const app = createApp(App);

// Initialize Sentry only if DSN is provided (package must be installed)
if (import.meta.env.VITE_SENTRY_DSN) {
  // @ts-ignore Sentry is optional — package in package.json, install with: pnpm add @sentry/vue
  const Sentry = await import("@sentry/vue");
  Sentry.init({
    app,
    dsn: import.meta.env.VITE_SENTRY_DSN,
    integrations: [
      Sentry.browserTracingIntegration(),
      Sentry.replayIntegration({ maskAllText: false, blockAllMedia: false }),
    ],
    tracePropagationTargets: [import.meta.env.VITE_API_URL],
  });
  app.config.errorHandler = (err, instance, info) => {
    Sentry.captureException(err, { extra: { componentName: instance?.$options?.name, info } });
  };
  window.addEventListener("unhandledrejection", (event) => {
    Sentry.captureException(event.reason);
  });
}

import { pinia } from "./pinia";
import { router } from "./router";
import { useAuthStore } from "./stores/auth";
import { useTaskStore } from "./stores/task";
import { useTagStore } from "./stores/tag";
import { useSyncStore } from "./stores/sync";
import { useTeamStore } from "./stores/team";
import { usePomodoroStore } from "./stores/pomodoro";
import { useNoteStore } from "./stores/note";
import { useProjectGroupStore } from "./stores/projectGroup";
import { useSmartListStore } from "./stores/smartList";
import { onSSEEvent, useSSE } from "./composables/useSSE";
import { useTheme } from "./composables/useTheme";
import { useGeofence } from "./composables/useGeofence";
import { usePushNotification } from "./composables/usePushNotification";
import { taskFromApi, projectFromApi, tagFromApi, noteFromApi, projectGroupFromApi } from "./api";

app.use(pinia);
useAuthStore().hydrate();
const auth = useAuthStore();
// Initialize theme — applies CSS vars to document root before first render
useTheme();
const taskStore = useTaskStore();
const tagStore = useTagStore();
const teamStore = useTeamStore();
const pomodoroStore = usePomodoroStore();
const noteStore = useNoteStore();
const groupStore = useProjectGroupStore();
const smartListStore = useSmartListStore();

// Register Service Worker for background push notifications
if ("serviceWorker" in navigator) {
  navigator.serviceWorker.register("/sw.js").catch((err) => {
    console.warn("[SW] registration failed:", err);
  });
}

// Hydrate data - sync with server if logged in
(async () => {
  try {
    // Hydrate auth FIRST so isLoggedIn reflects actual state
    auth.hydrate();
    pomodoroStore.hydrate();
    noteStore.hydrate();
    groupStore.hydrate();
    if (auth.isLoggedIn) {
      await taskStore.syncAll();
      await teamStore.hydrate();
      await teamStore.fetchTeams();
      await pomodoroStore.fetchSessions();
      await pomodoroStore.fetchStats();
      await noteStore.fetchNotes();
      await smartListStore.hydrate();
      // Start geofence monitoring for location reminders
      useGeofence().startMonitoring();
      // Init push notification subscription state
      usePushNotification().init();
    } else {
      // Offline or not logged in: use local hydration
      await taskStore.hydrateProjects();
      await tagStore.hydrate();
    }
    // Initialize offline sync queue after data is ready
    useSyncStore().init();
  } catch (err) {
    console.error("[init] hydration error:", err);
    // Attempt local hydration on error to avoid blank screen
    try {
      await taskStore.hydrateProjects();
      await tagStore.hydrate();
    } catch {
      // ignore
    }
  }
})();

// Register SSE handlers BEFORE useSSE() starts the connection
// to avoid missing events fired during registration.
onSSEEvent("task_created", (data) => {
  try {
    if (!data?.id) return;
    taskStore.upsertTask(taskFromApi(data as Record<string, unknown>));
  } catch (err) {
    console.error("[SSE] task_created error:", err);
  }
});
onSSEEvent("task_updated", (data) => {
  try {
    if (!data?.id) return;
    taskStore.upsertTask(taskFromApi(data as Record<string, unknown>));
  } catch (err) {
    console.error("[SSE] task_updated error:", err);
  }
});
onSSEEvent("task_deleted", (data) => {
  try {
    if (!data?.id) return;
    const t = taskFromApi(data as Record<string, unknown>);
    t.deletedAt = new Date().toISOString();
    taskStore.upsertTask(t);
  } catch (err) {
    console.error("[SSE] task_deleted error:", err);
  }
});
onSSEEvent("project_created", (data) => {
  try {
    if (!data?.id) return;
    taskStore.upsertProject(projectFromApi(data as Record<string, unknown>));
  } catch (err) {
    console.error("[SSE] project_created error:", err);
  }
});
onSSEEvent("project_updated", (data) => {
  try {
    if (!data?.id) return;
    taskStore.upsertProject(projectFromApi(data as Record<string, unknown>));
  } catch (err) {
    console.error("[SSE] project_updated error:", err);
  }
});
onSSEEvent("project_deleted", (data) => {
  try {
    if (!data?.id) return;
    const p = projectFromApi(data as Record<string, unknown>);
    p.deletedAt = new Date().toISOString();
    taskStore.upsertProject(p);
  } catch (err) {
    console.error("[SSE] project_deleted error:", err);
  }
});
onSSEEvent("tag_created", (data) => {
  try {
    if (!data?.id) return;
    tagStore.upsertTag(tagFromApi(data as Record<string, unknown>));
  } catch (err) {
    console.error("[SSE] tag_created error:", err);
  }
});
onSSEEvent("tag_updated", (data) => {
  try {
    if (!data?.id) return;
    tagStore.upsertTag(tagFromApi(data as Record<string, unknown>));
  } catch (err) {
    console.error("[SSE] tag_updated error:", err);
  }
});
onSSEEvent("tag_deleted", (data) => {
  try {
    if (!data?.id) return;
    const t = tagFromApi(data as Record<string, unknown>);
    t.deletedAt = new Date().toISOString();
    tagStore.upsertTag(t);
  } catch (err) {
    console.error("[SSE] tag_deleted error:", err);
  }
});
onSSEEvent("note_created", (data) => {
  try {
    if (!data?.id) return;
    noteStore.upsertNote(noteFromApi(data as Record<string, unknown>));
  } catch (err) {
    console.error("[SSE] note_created error:", err);
  }
});
onSSEEvent("note_updated", (data) => {
  try {
    if (!data?.id) return;
    noteStore.upsertNote(noteFromApi(data as Record<string, unknown>));
  } catch (err) {
    console.error("[SSE] note_updated error:", err);
  }
});
onSSEEvent("note_deleted", (data) => {
  try {
    if (!data?.id) return;
    noteStore.removeNote((data as Record<string, unknown>).id as string);
  } catch (err) {
    console.error("[SSE] note_deleted error:", err);
  }
});
onSSEEvent("project_group_created", (data) => {
  groupStore.upsertGroup(projectGroupFromApi(data as Record<string, unknown>));
});
onSSEEvent("project_group_updated", (data) => {
  groupStore.upsertGroup(projectGroupFromApi(data as Record<string, unknown>));
});
onSSEEvent("project_group_deleted", (data) => {
  groupStore.removeGroup((data as Record<string, unknown>).id as string);
});

// Now start the SSE connection — uses { immediate: true }, token already hydrated
useSSE();

app.use(router);
app.use(naive);
app.use(i18n);

app.mount("#app");
