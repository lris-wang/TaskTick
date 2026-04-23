/**
 * Smart List Store
 *
 * Manages smart lists (saved filter criteria). Synced with the server.
 */

import { defineStore } from "pinia";
import type { SmartList, SmartListFilter } from "@tasktick/shared";
import {
  createSmartList as apiCreate,
  deleteSmartList as apiDelete,
  fetchSmartLists as apiFetch,
  updateSmartList as apiUpdate,
} from "../api";
import { useAuthStore } from "./auth";
import { useTaskStore } from "./task";
import { useTagStore } from "./tag";

const STORAGE_KEY = "tasktick.local.smart_lists.v1";

export const useSmartListStore = defineStore("smartList", {
  state: () => ({
    smartLists: [] as SmartList[],
    activeSmartListId: null as string | null,
  }),

  getters: {
    activeSmartList(state): SmartList | null {
      return state.smartLists.find((s) => s.id === state.activeSmartListId) ?? null;
    },
  },

  actions: {
    persist(): boolean {
      try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify({
          smartLists: this.smartLists,
          activeSmartListId: this.activeSmartListId,
        }));
      } catch {
        /* ignore */
      }
      return true;
    },

    hydrateFromStorage(): void {
      try {
        const raw = localStorage.getItem(STORAGE_KEY);
        if (!raw) return;
        const parsed = JSON.parse(raw) as unknown;
        if (!parsed || typeof parsed !== "object") return;
        const o = parsed as Record<string, unknown>;
        if (Array.isArray(o.smartLists)) {
          this.smartLists = o.smartLists as SmartList[];
        }
        if (typeof o.activeSmartListId === "string" || o.activeSmartListId === null) {
          this.activeSmartListId = o.activeSmartListId;
        }
      } catch {
        /* ignore */
      }
    },

    async hydrate(): Promise<void> {
      const auth = useAuthStore();
      if (!auth.isLoggedIn) {
        this.hydrateFromStorage();
        return;
      }
      const data = await apiFetch();
      if (data) {
        this.smartLists = data;
        this.persist();
      } else {
        this.hydrateFromStorage();
      }
    },

    async createSmartList(
      name: string,
      color: string | null,
      filter: SmartListFilter,
    ): Promise<SmartList | null> {
      const data = await apiCreate({ name, color, filter });
      if (!data) return null;
      this.smartLists.push(data);
      this.persist();
      return data;
    },

    async updateSmartList(
      id: string,
      patch: { name?: string; color?: string | null; filter?: SmartListFilter },
    ): Promise<boolean> {
      const data = await apiUpdate(id, patch);
      if (!data) return false;
      const idx = this.smartLists.findIndex((s) => s.id === id);
      if (idx !== -1) {
        this.smartLists[idx] = data;
        this.persist();
      }
      return true;
    },

    async deleteSmartList(id: string): Promise<boolean> {
      const ok = await apiDelete(id);
      if (!ok) return false;
      this.smartLists = this.smartLists.filter((s) => s.id !== id);
      if (this.activeSmartListId === id) {
        this.activeSmartListId = null;
      }
      this.persist();
      return true;
    },

    /**
     * Select a smart list and apply its filter to the task store.
     */
    selectSmartList(id: string): void {
      const sl = this.smartLists.find((s) => s.id === id);
      if (!sl) return;

      this.activeSmartListId = id;
      const taskStore = useTaskStore();
      const tagStore = useTagStore();
      const filter = sl.filter;

      if (filter.builtinView) {
        taskStore.activeBuiltinView = filter.builtinView;
      }
      if (filter.tagIds && filter.tagIds.length > 0) {
        tagStore.selectedTagIds = filter.tagIds;
      } else if (!filter.builtinView) {
        tagStore.selectedTagIds = [];
      }
      if (filter.projectIds !== undefined) {
        taskStore.selectedProjectId = filter.projectIds[0] ?? null;
      }
      this.persist();
    },

    /**
     * Clear smart list selection and reset to defaults.
     */
    clearSelection(): void {
      this.activeSmartListId = null;
      this.persist();
    },
  },
});
