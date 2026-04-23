/**
 * ProjectGroup Store
 *
 * Manages project groups (folders for organizing projects).
 * Groups are synced with the server and persisted to localStorage.
 */

import { defineStore } from "pinia";
import type { ProjectGroup } from "@tasktick/shared";
import { newId } from "../utils/id";
import { useSyncStore } from "./sync";

const GROUPS_STORAGE_KEY = "tasktick.local.project_groups.v1";

function nowIso(): string {
  return new Date().toISOString();
}

export const useProjectGroupStore = defineStore("projectGroup", {
  state: () => ({
    groups: [] as ProjectGroup[],
  }),

  getters: {
    visibleGroups(state): ProjectGroup[] {
      return state.groups.filter((g) => !g.deletedAt);
    },

    groupById(state): (id: string) => ProjectGroup | undefined {
      return (id: string) => state.groups.find((g) => g.id === id);
    },

    ungroupedProjects(): string {
      return "__ungrouped__";
    },
  },

  actions: {
    persist(): boolean {
      try {
        localStorage.setItem(GROUPS_STORAGE_KEY, JSON.stringify(this.groups));
      } catch {
        /* ignore */
      }
      return true;
    },

    hydrate(): void {
      try {
        const raw = localStorage.getItem(GROUPS_STORAGE_KEY);
        if (raw) {
          this.groups = JSON.parse(raw);
        }
      } catch {
        /* ignore */
      }
    },

    setGroups(groups: ProjectGroup[]): void {
      this.groups = groups;
      this.persist();
    },

    upsertGroup(group: ProjectGroup): void {
      const idx = this.groups.findIndex((g) => g.id === group.id);
      if (idx !== -1) {
        this.groups[idx] = group;
      } else {
        this.groups.push(group);
      }
      this.persist();
    },

    removeGroup(id: string): void {
      this.groups = this.groups.filter((g) => g.id !== id);
      this.persist();
    },

    addGroup(name: string, color?: string | null): ProjectGroup {
      const group: ProjectGroup = {
        id: newId(),
        userId: "",
        name,
        color: color ?? null,
        order: this.visibleGroups.length,
        deletedAt: null,
        createdAt: nowIso(),
        updatedAt: nowIso(),
      };
      this.groups.push(group);
      this.persist();

      const syncStore = useSyncStore();
      syncStore.enqueue({
        entityType: "project_group",
        entityId: group.id,
        clientMutationId: newId(),
        op: "upsert",
        payload: { name, color, order: group.order },
        clientUpdatedAt: group.updatedAt,
      });

      return group;
    },

    updateGroup(id: string, updates: Partial<Pick<ProjectGroup, "name" | "color" | "order">>): boolean {
      const idx = this.groups.findIndex((g) => g.id === id && !g.deletedAt);
      if (idx === -1) return false;
      this.groups[idx] = { ...this.groups[idx]!, ...updates, updatedAt: nowIso() };
      this.persist();

      const syncStore = useSyncStore();
      syncStore.enqueue({
        entityType: "project_group",
        entityId: id,
        clientMutationId: newId(),
        op: "upsert",
        payload: updates,
        clientUpdatedAt: this.groups[idx]!.updatedAt,
      });

      return true;
    },

    deleteGroup(id: string): boolean {
      const idx = this.groups.findIndex((g) => g.id === id);
      if (idx === -1) return false;
      this.groups[idx] = { ...this.groups[idx]!, deletedAt: nowIso() };
      this.persist();

      const syncStore = useSyncStore();
      syncStore.enqueue({
        entityType: "project_group",
        entityId: id,
        clientMutationId: newId(),
        op: "delete",
        payload: null,
        clientUpdatedAt: this.groups[idx]!.deletedAt!,
      });

      return true;
    },
  },
});
