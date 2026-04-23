/**
 * Tag Store
 *
 * Manages tags (labels) for tasks. Persisted to localStorage alongside tasks.
 * Reads/writes via the API client when available; falls back to localStorage.
 */

import { defineStore } from "pinia";
import type { Tag } from "@tasktick/shared";
import { newId } from "../utils/id";
import { isElectron, dbTagsGetAll, dbTagsUpsert, dbTagsSoftDelete } from "../utils/electron";
import { syncPull } from "../api";
import { useAuthStore } from "./auth";
import { useSyncStore } from "./sync";

const STORAGE_KEY = "tasktick.local.tags.v1";

function nowIso(): string {
  return new Date().toISOString();
}

function defaultTag(partial: Partial<Tag> & Pick<Tag, "name">): Tag {
  const now = nowIso();
  return {
    id: newId(),
    name: partial.name,
    color: partial.color ?? null,
    deletedAt: partial.deletedAt ?? null,
    createdAt: partial.createdAt ?? now,
    updatedAt: partial.updatedAt ?? now,
    teamId: partial.teamId ?? null,
  };
}

function normalizeTag(raw: unknown): Tag | null {
  if (!raw || typeof raw !== "object") return null;
  const o = raw as Record<string, unknown>;
  if (typeof o.id !== "string" || typeof o.name !== "string") return null;
  const now = nowIso();
  return {
    id: o.id,
    name: o.name,
    color: typeof o.color === "string" ? o.color : null,
    deletedAt: typeof o.deletedAt === "string" ? o.deletedAt : null,
    createdAt: typeof o.createdAt === "string" ? o.createdAt : now,
    updatedAt: typeof o.updatedAt === "string" ? o.updatedAt : now,
    teamId: typeof o.teamId === "string" ? o.teamId : null,
  };
}

const PRESET_COLORS = [
  "#ef4444", // red
  "#f97316", // orange
  "#eab308", // yellow
  "#22c55e", // green
  "#14b8a6", // teal
  "#3b82f6", // blue
  "#8b5cf6", // violet
  "#ec4899", // pink
  "#6b7280", // gray
];

export { PRESET_COLORS };

export const useTagStore = defineStore("tag", {
  state: () => ({
    tags: [] as Tag[],
    /** Currently selected tag IDs for filtering (multi-select) */
    selectedTagIds: [] as string[],
  }),

  getters: {
    /** Active (non-deleted) tags */
    activeTags(state): Tag[] {
      return state.tags.filter((t) => !t.deletedAt);
    },
  },

  actions: {
    persist(): boolean {
      try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(this.tags));
      } catch {
        /* ignore */
      }
      if (isElectron()) {
        void Promise.all(this.tags.map((t) => dbTagsUpsert(t)));
      }
      return true;
    },

    /**
     * Load tags from SQLite (Electron) first, fall back to localStorage.
     * When logged in, also sync with server via syncPull.
     */
    async hydrate(): Promise<void> {
      // Logged in: sync all data from server first
      const auth = useAuthStore();
      if (auth.isLoggedIn) {
        const syncData = await syncPull(null);
        if (syncData && syncData.tags.length > 0) {
          this.tags = syncData.tags.map((t) => ({
            id: t.id,
            name: t.name,
            color: t.color ?? null,
            deletedAt: t.deletedAt ?? null,
            createdAt: t.createdAt,
            updatedAt: t.updatedAt,
            teamId: t.teamId ?? null,
          }));
          this.persist();
          return;
        }
        // Fall through to local data if server returns empty
      }

      // Try SQLite first (Electron)
      if (isElectron()) {
        const rows = await dbTagsGetAll();
        if (rows && rows.length > 0) {
          this.tags = rows;
          void this.persist();
          return;
        }
      }

      // Fall back to localStorage
      this.hydrateFromStorage();
    },

    hydrateFromStorage(): void {
      try {
        const raw = localStorage.getItem(STORAGE_KEY);
        if (!raw) return;
        const parsed = JSON.parse(raw) as unknown;
        if (!Array.isArray(parsed)) return;
        const out: Tag[] = [];
        for (const item of parsed) {
          const t = normalizeTag(item);
          if (t) out.push(t);
        }
        this.tags = out;
      } catch {
        /* ignore */
      }
    },

    /** Merge remote tags: upsert by id, preserve local-only tags */
    mergeRemoteTags(remoteTags: Tag[]): void {
      const localMap = new Map(this.tags.map((t) => [t.id, t]));
      for (const rt of remoteTags) {
        const local = localMap.get(rt.id);
        if (!local) {
          this.tags.push(rt);
        } else {
          // Server wins on conflict (newer updatedAt)
          if (new Date(rt.updatedAt) > new Date(local.updatedAt)) {
            const idx = this.tags.findIndex((t) => t.id === rt.id);
            if (idx !== -1) this.tags[idx] = rt;
          }
        }
      }
      void this.persist();
    },

    async addTag(name: string, color?: string, teamId?: string | null): Promise<string | null> {
      const n = name.trim();
      if (!n) return null;

      // Always create locally first, then enqueue for sync
      const tag = defaultTag({ name: n, color: color ?? null, teamId: teamId ?? null });
      this.tags.push(tag);
      if (!this.persist()) {
        this.tags.pop();
        return null;
      }

      // Enqueue sync mutation
      const syncStore = useSyncStore();
      syncStore.enqueue({
        entityType: "tag",
        entityId: tag.id,
        clientMutationId: tag.id,
        op: "upsert",
        payload: { name: tag.name, color: tag.color, team_id: tag.teamId },
        clientUpdatedAt: tag.updatedAt,
      });

      return tag.id;
    },

    async updateTagName(id: string, name: string): Promise<boolean> {
      const n = name.trim();
      if (!n) return false;
      const idx = this.tags.findIndex((t) => t.id === id && !t.deletedAt);
      if (idx === -1) return false;

      // Always update locally first, then enqueue for sync
      const updated = { ...this.tags[idx]!, name: n, updatedAt: nowIso() };
      this.tags[idx] = updated;
      if (!this.persist()) {
        return false;
      }

      const syncStore = useSyncStore();
      syncStore.enqueue({
        entityType: "tag",
        entityId: id,
        clientMutationId: newId(),
        op: "upsert",
        payload: { name: updated.name, color: updated.color },
        clientUpdatedAt: updated.updatedAt,
      });

      return true;
    },

    async updateTagColor(id: string, color: string | null): Promise<boolean> {
      const idx = this.tags.findIndex((t) => t.id === id && !t.deletedAt);
      if (idx === -1) return false;

      const updated = { ...this.tags[idx]!, color, updatedAt: nowIso() };
      this.tags[idx] = updated;
      if (!this.persist()) {
        return false;
      }

      const syncStore = useSyncStore();
      syncStore.enqueue({
        entityType: "tag",
        entityId: id,
        clientMutationId: newId(),
        op: "upsert",
        payload: { name: updated.name, color: updated.color },
        clientUpdatedAt: updated.updatedAt,
      });

      return true;
    },

    async deleteTag(id: string): Promise<boolean> {
      const idx = this.tags.findIndex((t) => t.id === id);
      if (idx === -1) return false;
      const tag = this.tags[idx];
      if (!tag || tag.deletedAt) return false;

      // Always soft-delete locally first, then enqueue for sync
      const deletedAt = nowIso();
      this.tags[idx] = { ...tag, deletedAt };
      if (!this.persist()) {
        return false;
      }
      if (isElectron()) await dbTagsSoftDelete(id);

      const syncStore = useSyncStore();
      syncStore.enqueue({
        entityType: "tag",
        entityId: id,
        clientMutationId: newId(),
        op: "delete",
        payload: null,
        clientUpdatedAt: deletedAt,
      });

      return true;
    },

    toggleTagFilter(tagId: string) {
      const idx = this.selectedTagIds.indexOf(tagId);
      if (idx === -1) {
        this.selectedTagIds.push(tagId);
      } else {
        this.selectedTagIds.splice(idx, 1);
      }
    },

    clearTagFilter() {
      this.selectedTagIds = [];
    },

    /** Called by SSE event handler: upsert or remove tag from local state */
    upsertTag(remote: Tag) {
      const idx = this.tags.findIndex((t) => t.id === remote.id);
      if (remote.deletedAt) {
        if (idx !== -1) this.tags.splice(idx, 1);
      } else if (idx !== -1) {
        this.tags[idx] = remote;
      } else {
        this.tags.push(remote);
      }
      void this.persist();
    },
  },
});
