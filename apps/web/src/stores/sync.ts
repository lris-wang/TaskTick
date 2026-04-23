/**
 * Offline-first sync queue store.
 *
 * Architecture:
 * - All mutations (task/project/tag upsert/delete) are pushed to a local queue first.
 * - If online, the queue is flushed immediately (debounced).
 * - If offline, mutations accumulate; flush resumes when coming back online.
 * - The server uses LWW (Last Write Wins) via `updatedAt` / `clientUpdatedAt`.
 * - Deduplication: for the same entityId, only the latest mutation is kept
 *   (upsert+upsert → latest wins; upsert+delete → delete wins and removes the upsert).
 */

import { defineStore } from "pinia";
import { useAuthStore } from "./auth";
import { syncPush } from "../api";

const QUEUE_KEY = "tasktick.sync.queue.v1";
const DEVICE_ID_KEY = "tasktick.device.id";
const FLUSH_DEBOUNCE_MS = 1_000; // 1 second debounce on flush
const RETRY_DELAY_MS = 5_000; // 5 second retry on failure

export interface QueuedMutation {
  entityType: "task" | "project" | "tag" | "note" | "project_group";
  entityId: string;
  clientMutationId: string;
  op: "upsert" | "delete";
  payload: Record<string, unknown> | null;
  clientUpdatedAt: string; // ISO 8601
}

/** Load queue from localStorage */
function loadQueue(): QueuedMutation[] {
  try {
    const raw = localStorage.getItem(QUEUE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(
      (m): m is QueuedMutation =>
        m !== null &&
        typeof m === "object" &&
        typeof m.entityType === "string" &&
        typeof m.entityId === "string" &&
        typeof m.clientMutationId === "string" &&
        (m.op === "upsert" || m.op === "delete") &&
        (typeof m.payload === "object" || m.payload === null) &&
        typeof m.clientUpdatedAt === "string",
    );
  } catch {
    return [];
  }
}

/** Persist queue to localStorage */
function persistQueue(queue: QueuedMutation[]): void {
  try {
    localStorage.setItem(QUEUE_KEY, JSON.stringify(queue));
  } catch {
    /* ignore */
  }
}

/** Get or create a device ID */
function getOrCreateDeviceId(): string {
  try {
    let id = localStorage.getItem(DEVICE_ID_KEY);
    if (!id) {
      // Use a random string compatible with UUID format
      id = crypto.randomUUID();
      localStorage.setItem(DEVICE_ID_KEY, id);
    }
    return id;
  } catch {
    return crypto.randomUUID();
  }
}

export const useSyncStore = defineStore("sync", {
  state: () => ({
    /** Pending mutations awaiting sync */
    queue: [] as QueuedMutation[],
    /** Whether we believe we are online */
    online: typeof navigator !== "undefined" ? navigator.onLine : true,
    /** Whether a flush is currently in progress */
    flushing: false,
    /** Flush timer handle */
    _flushTimer: null as ReturnType<typeof setTimeout> | null,
    /** Retry timer handle */
    _retryTimer: null as ReturnType<typeof setTimeout> | null,
    /** Device ID for this browser/client */
    deviceId: getOrCreateDeviceId(),
  }),
  getters: {
    pendingCount: (s): number => s.queue.length,
    hasPending: (s): boolean => s.queue.length > 0,
  },
  actions: {
    /** Initialize: load queue, start listening to network events */
    init() {
      this.queue = loadQueue();

      if (typeof window !== "undefined") {
        window.addEventListener("online", this._onOnline);
        window.addEventListener("offline", this._onOffline);
      }

      // Kick off a flush if we have pending and appear online
      if (this.online && this.queue.length > 0) {
        this._scheduleFlush(0);
      }
    },

    /** Cleanup event listeners */
    destroy() {
      if (typeof window !== "undefined") {
        window.removeEventListener("online", this._onOnline);
        window.removeEventListener("offline", this._onOffline);
      }
      if (this._flushTimer !== null) {
        clearTimeout(this._flushTimer);
        this._flushTimer = null;
      }
      if (this._retryTimer !== null) {
        clearTimeout(this._retryTimer);
        this._retryTimer = null;
      }
    },

    _onOnline() {
      this.online = true;
      if (this.queue.length > 0) {
        this._scheduleFlush(0);
      }
    },

    _onOffline() {
      this.online = false;
    },

    /**
     * Add a mutation to the queue.
     * - Upsert vs upsert for same entityId: keep the one with latest clientUpdatedAt.
     * - Upsert vs existing delete for same entityId: replace the delete.
     * - Delete vs existing upsert for same entityId: remove the upsert, add the delete.
     * - Delete vs existing delete for same entityId: skip (already queued for deletion).
     */
    enqueue(mutation: QueuedMutation): void {
      const { entityId, op } = mutation;
      const existingIdx = this.queue.findIndex((m) => m.entityId === entityId);

      if (existingIdx !== -1) {
        const existing = this.queue[existingIdx]!;

        if (op === "delete") {
          if (existing.op === "upsert") {
            // upsert → delete: remove the upsert, add the delete
            this.queue.splice(existingIdx, 1);
            this.queue.push(mutation);
          }
          // delete → delete: skip (already queued for deletion)
        } else {
          // upsert → upsert: keep the one with latest clientUpdatedAt
          if (new Date(mutation.clientUpdatedAt) >= new Date(existing.clientUpdatedAt)) {
            this.queue.splice(existingIdx, 1, mutation);
          }
          // else keep existing (it's newer)
        }
      } else {
        this.queue.push(mutation);
      }

      persistQueue(this.queue);

      // Trigger flush if online
      if (this.online) {
        this._scheduleFlush(FLUSH_DEBOUNCE_MS);
      }
    },

    /**
     * Build the syncPush payload from the current queue.
     * Mutations are sorted by clientUpdatedAt ascending (oldest first → LWW-safe).
     */
    _buildPayload() {
      const sorted = [...this.queue].sort(
        (a, b) => new Date(a.clientUpdatedAt).getTime() - new Date(b.clientUpdatedAt).getTime(),
      );
      return {
        deviceId: this.deviceId,
        mutations: sorted.map((m) => ({
          entityType: m.entityType,
          entityId: m.entityId,
          clientMutationId: m.clientMutationId,
          op: m.op,
          payload: m.payload,
          clientUpdatedAt: m.clientUpdatedAt,
        })),
      };
    },

    /**
     * Flush the queue to the server.
     * Sorts oldest-first (LWW-safe), sends all, clears on success.
     */
    async flush(): Promise<boolean> {
      if (this.flushing) return false;
      if (this.queue.length === 0) return true;

      const auth = useAuthStore();
      if (!auth.isLoggedIn) return false;

      this.flushing = true;

      const payload = this._buildPayload();

      try {
        const ok = await syncPush(payload);
        if (ok) {
          this.queue = [];
          persistQueue([]);
          this.flushing = false;
          return true;
        }
        // Network failure or server error → retry after delay
        this.flushing = false;
        this._scheduleRetry();
        return false;
      } catch {
        this.flushing = false;
        this._scheduleRetry();
        return false;
      }
    },

    _scheduleFlush(delayMs: number) {
      if (this._flushTimer !== null) {
        clearTimeout(this._flushTimer);
      }
      this._flushTimer = setTimeout(() => {
        this._flushTimer = null;
        void this.flush();
      }, delayMs);
    },

    _scheduleRetry() {
      if (this._retryTimer !== null) {
        clearTimeout(this._retryTimer);
      }
      if (!this.online) return; // Don't retry while offline
      this._retryTimer = setTimeout(() => {
        this._retryTimer = null;
        void this.flush();
      }, RETRY_DELAY_MS);
    },
  },
});
