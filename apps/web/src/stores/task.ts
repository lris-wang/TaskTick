/**
 * Task Store
 *
 * Manages tasks and projects. Offline-first: reads/writes via the sync queue
 * when online, falls back to localStorage / Electron SQLite when offline.
 */

import { defineStore } from "pinia";
import type { Project, ReminderSettings, Task, TaskPriority } from "@tasktick/shared";
import { syncPull, fetchDeletedTasks, restoreTask as restoreTaskApi, permanentDeleteTask as permanentDeleteTaskApi } from "../api";
import { newId } from "../utils/id";
import { localDateKey, dueCalendarKey } from "../utils/date";
import { isElectron, dbTasksGetAll, dbTasksUpsert, dbTasksSoftDelete } from "../utils/electron";
import { useAuthStore } from "./auth";
import { useSyncStore } from "./sync";

const STORAGE_KEY = "tasktick.local.tasks.v1";
const STORAGE_KEY_PROJECTS = "tasktick.local.projects.v1";
const STORAGE_KEY_BUILTIN_VIEW = "tasktick.local.builtinView.v1";
const STORAGE_KEY_SELECTED_PROJECT = "tasktick.local.selectedProject.v1";

function getInitialBuiltinView(): BuiltinView {
  try {
    const saved = localStorage.getItem(STORAGE_KEY_BUILTIN_VIEW);
    if (saved && ["today", "planned", "engaged", "next", "all", "completed", "inbox"].includes(saved)) {
      return saved as BuiltinView;
    }
  } catch { /* ignore */ }
  return "all";
}

function getInitialSelectedProject(): string | null {
  try {
    return localStorage.getItem(STORAGE_KEY_SELECTED_PROJECT);
  } catch { /* ignore */ }
  return null;
}

function nowIso(): string {
  return new Date().toISOString();
}

/** Legacy built-in project IDs (used in migration) */
const LEGACY_DEFAULT_PROJECTS = ["inbox", "work", "personal"];

function migrateLegacyProjectBuiltinFlags(projects: Project[]): void {
  for (const p of projects) {
    if (p.builtIn === undefined) {
      p.builtIn = LEGACY_DEFAULT_PROJECTS.includes(p.name.toLowerCase());
    }
  }
}

/**
 * Calculate a pin/priority score for a task.
 * Higher scores = more important = pinned to top.
 * Returns > 0 for tasks that should be pinned.
 */
export function taskPinScore(t: Task, today: string): number {
  let score = 0;
  if (t.deletedAt) return 0;
  if (t.completed) return 0;
  if (t.isImportant) score += 4;
  const dk = dueCalendarKey(t.dueAt);
  if (dk !== null) {
    if (dk < today) score += 3; // overdue
    if (dk === today) score += 2; // due today
  }
  if (t.priority >= 2) score += t.priority; // medium or high priority
  return score;
}

export type BuiltinView = "today" | "planned" | "engaged" | "next" | "all" | "completed" | "inbox";

export const useTaskStore = defineStore("task", {
  state: () => ({
    tasks: [] as Task[],
    projects: [] as Project[],
    /** Currently selected project ID (null = All Tasks) */
    selectedProjectId: getInitialSelectedProject() as string | null,
    /** Search query for filtering tasks */
    searchText: "",
    /** Active built-in view */
    activeBuiltinView: getInitialBuiltinView(),
  }),

  getters: {
    /** Active (non-deleted) tasks */
    activeTasks(state): Task[] {
      return state.tasks.filter((t) => !t.deletedAt);
    },

    /** Tasks grouped by completion status */
    incompleteTasks(state): Task[] {
      return state.tasks.filter((t) => !t.deletedAt && !t.completed);
    },

    completedTasks(state): Task[] {
      return state.tasks.filter((t) => !t.deletedAt && t.completed);
    },

    /** Deleted tasks (soft-deleted, in recycle bin) */
    deletedTasks(state): Task[] {
      return state.tasks.filter((t) => !!t.deletedAt);
    },

    /** Tasks for the selected project (or all if null) */
    tasksForSelectedProject(state): Task[] {
      if (!state.selectedProjectId) return this.activeTasks;
      return state.tasks.filter(
        (t) => !t.deletedAt && t.projectIds.includes(state.selectedProjectId!),
      );
    },

    /** Project by ID */
    projectById(state): (id: string) => Project | undefined {
      return (id: string) => state.projects.find((p) => p.id === id);
    },

    /** Active (non-deleted, non-archived) projects */
    activeProjects(state): Project[] {
      return state.projects.filter((p) => !p.deletedAt && !p.archived);
    },

    /** Important tasks (flagged and not completed) */
    importantTasks(state): Task[] {
      return state.tasks.filter((t) => !t.deletedAt && !t.completed && t.isImportant);
    },

    /**
     * Visible tasks filtered by the active built-in view.
     * "all": all active tasks
     * "today": active tasks due today or overdue
     * "planned": active tasks with a due date
     * "engaged": active tasks in progress (have subtasks or are repeating)
     * "next": active tasks due within 7 days
     * "completed": completed tasks
     * "inbox": active tasks with no due date and no project
     */
    visibleTasks(state): Task[] {
      const today = localDateKey(new Date());
      const sevenDaysLater = new Date();
      sevenDaysLater.setDate(sevenDaysLater.getDate() + 7);
      const sevenDaysKey = localDateKey(sevenDaysLater);

      return state.tasks.filter((t) => {
        if (t.deletedAt) return false;

        switch (state.activeBuiltinView) {
          case "today": {
            if (t.completed) return false;
            const dk = dueCalendarKey(t.dueAt);
            return dk !== null && dk <= today;
          }
          case "planned": {
            if (t.completed) return false;
            return dueCalendarKey(t.dueAt) !== null;
          }
          case "engaged": {
            return !t.completed;
          }
          case "next": {
            if (t.completed) return false;
            const dk = dueCalendarKey(t.dueAt);
            return dk !== null && dk <= sevenDaysKey;
          }
          case "completed":
            return t.completed;
          case "inbox":
            return !t.completed && !t.dueAt && t.projectIds.length === 0;
          case "all":
          default:
            return true;
        }
      });
    },

    /** Get subtasks (child tasks) for a given parent task ID */
    subtasksOf(state): (parentId: string) => Task[] {
      return (parentId: string) =>
        state.tasks.filter((t) => !t.deletedAt && t.parentId === parentId);
    },
  },

  actions: {
    persist(): boolean {
      try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(this.tasks));
      } catch {
        /* ignore */
      }
      if (isElectron()) {
        void Promise.all(this.tasks.map((t) => dbTasksUpsert(t)));
      }
      return true;
    },

    persistProjects(): boolean {
      try {
        localStorage.setItem(STORAGE_KEY_PROJECTS, JSON.stringify(this.projects));
      } catch {
        /* ignore */
      }
      return true;
    },

    /**
     * Hydrate tasks from SQLite (Electron) first, fall back to localStorage.
     * When logged in, also sync with server via syncAll.
     */
    async hydrate(): Promise<void> {
      const auth = useAuthStore();
      if (auth.isLoggedIn) {
        try {
          const ok = await this.syncAll();
          if (ok) return;
        } catch (err) {
          console.error("[taskStore] hydrate syncAll error:", err);
          // Fall through to local data
        }
      }

      // Try SQLite first (Electron)
      if (isElectron()) {
        const rows = await dbTasksGetAll();
        if (rows && rows.length > 0) {
          this.tasks = rows;
          void this.persist();
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
        this.tasks = parsed as Task[];
      } catch {
        /* ignore */
      }

      try {
        const rawProjects = localStorage.getItem(STORAGE_KEY_PROJECTS);
        if (!rawProjects) return;
        const parsed = JSON.parse(rawProjects) as unknown;
        if (!Array.isArray(parsed)) return;
        this.projects = parsed as Project[];
      } catch {
        /* ignore */
      }
    },

    /** Separate hydrate for projects only */
    async hydrateProjects(): Promise<void> {
      const auth = useAuthStore();
      if (auth.isLoggedIn) {
        try {
          const syncStore = useSyncStore();
          const hasPendingProjects = syncStore.queue.some(
            (m) => m.entityType === "project" && m.op === "upsert",
          );
          const syncData = await syncPull(null);
          if (syncData && syncData.projects.length > 0) {
            this.projects = syncData.projects.map((p) => ({
              id: p.id,
              name: p.name,
              color: p.color ?? null,
              deletedAt: p.deletedAt ?? null,
              createdAt: p.createdAt,
              updatedAt: p.updatedAt,
              builtIn: Boolean(p.builtIn),
              teamId: p.teamId ?? null,
            }));
            migrateLegacyProjectBuiltinFlags(this.projects);
          } else if (!hasPendingProjects) {
            this.seedDefaultProjects();
          }
          this.persistProjects();
          return;
        } catch (err) {
          console.error("[taskStore] hydrateProjects error:", err);
        }
      }
      this.hydrateFromStorage();
    },

    /** Select a built-in view */
    selectBuiltinView(view: BuiltinView): void {
      this.activeBuiltinView = view;
      this.selectedProjectId = null;
      try {
        localStorage.setItem(STORAGE_KEY_BUILTIN_VIEW, view);
      } catch { /* ignore */ }
    },

    /** Toggle task completion (alias for toggleTaskComplete) */
    async toggleComplete(id: string): Promise<boolean> {
      return this.toggleTaskComplete(id);
    },

    /** Soft-delete a task (alias for deleteTask) */
    async softDelete(id: string): Promise<boolean> {
      return this.deleteTask(id);
    },

    /**
     * Reorder projects by moving a project from one index to another.
     */
    reorderProjects(fromIndex: number, toIndex: number): void {
      const active = this.activeProjects;
      if (fromIndex < 0 || fromIndex >= active.length) return;
      if (toIndex < 0 || toIndex >= active.length) return;
      const [moved] = active.splice(fromIndex, 1);
      active.splice(toIndex, 0, moved);
      // Persist the new order
      for (let i = 0; i < this.projects.length; i++) {
        const p = this.projects[i]!;
        const idx = active.findIndex((ap) => ap.id === p.id);
        if (idx !== -1) {
          this.projects[i] = { ...p, updatedAt: nowIso() };
        }
      }
      void this.persistProjects();
    },

    /**
     * Full sync from server: push pending mutations first, then pull all tasks, projects, tags.
     */
    async syncAll(): Promise<boolean> {
      const auth = useAuthStore();
      if (!auth.isLoggedIn) return false;

      // Flush any pending mutations before pulling to avoid losing locally-created data
      const syncStore = useSyncStore();
      if (syncStore.queue.length > 0) {
        await syncStore.flush();
      }

      try {
        const syncData = await syncPull(null);
        if (!syncData) return false;

        this.tasks = syncData.tasks.map((t) => ({
          id: t.id,
          title: t.title,
          description: t.description ?? null,
          completed: t.completed,
          startAt: t.startAt ?? null,
          dueAt: t.dueAt ?? null,
          priority: t.priority ?? 0,
          projectIds: t.projectIds ?? [],
          tagIds: t.tagIds ?? [],
          deletedAt: t.deletedAt ?? null,
          clientMutationId: t.clientMutationId ?? null,
          isImportant: Boolean(t.isImportant),
          repeatRule: typeof t.repeatRule === "string" ? t.repeatRule : null,
          notifyEnabled: Boolean(t.notifyEnabled),
          attachments: t.attachments ?? [],
          parentId: t.parentId ?? null,
          sortOrder: t.sortOrder ?? null,
          dependsOn: t.dependsOn ?? [],
          assigneeId: t.assigneeId ?? null,
          locationReminders: t.locationReminders ?? [],
          createdAt: t.createdAt,
          updatedAt: t.updatedAt,
        }));
        void this.persist();

        if (syncData.projects.length > 0) {
          this.projects = syncData.projects.map((p) => ({
            id: p.id,
            name: p.name,
            color: p.color ?? null,
            deletedAt: p.deletedAt ?? null,
            createdAt: p.createdAt,
            updatedAt: p.updatedAt,
            builtIn: Boolean(p.builtIn),
            teamId: p.teamId ?? null,
            groupId: (p as unknown as Record<string, unknown>).groupId as string | null ?? null,
          }));
          migrateLegacyProjectBuiltinFlags(this.projects);
        } else {
          this.seedDefaultProjects();
        }
        void this.persistProjects();

        const { useTagStore } = await import("./tag");
        const tagStore = useTagStore();
        if (syncData.tags.length > 0) {
          tagStore.tags = syncData.tags.map((t) => ({
            id: t.id,
            name: t.name,
            color: t.color ?? null,
            deletedAt: t.deletedAt ?? null,
            createdAt: t.createdAt,
            updatedAt: t.updatedAt,
            teamId: t.teamId ?? null,
          }));
        }
        void tagStore.persist();

        // Sync project groups
        const { useProjectGroupStore } = await import("./projectGroup");
        const groupStore = useProjectGroupStore();
        if (syncData.projectGroups && syncData.projectGroups.length > 0) {
          groupStore.setGroups(syncData.projectGroups.map((g) => ({
            id: g.id,
            userId: g.userId,
            name: g.name,
            color: g.color ?? null,
            order: g.order ?? 0,
            deletedAt: g.deletedAt ?? null,
            createdAt: g.createdAt,
            updatedAt: g.updatedAt,
          })));
        }

        this.migrateTaskProjectAssignments();
        this.ensureSelectedProject();
        return true;
      } catch (err) {
        console.error("[taskStore] syncAll error:", err);
        return false;
      }
    },

    /**
     * Create default projects if none exist.
     */
    seedDefaultProjects(): void {
      if (this.projects.length > 0) return;
      const now = nowIso();
      this.projects = [
        {
          id: newId(),
          name: "工作",
          color: "#3b82f6",
          deletedAt: null,
          createdAt: now,
          updatedAt: now,
          builtIn: true,
          teamId: null,
        },
        {
          id: newId(),
          name: "个人",
          color: "#22c55e",
          deletedAt: null,
          createdAt: now,
          updatedAt: now,
          builtIn: true,
          teamId: null,
        },
      ];
    },

    /**
     * Migrate legacy tasks that may have used a single `project` field
     * instead of `projectIds[]`. No-op if already migrated.
     */
    migrateTaskProjectAssignments(): void {
      let migrated = false;
      for (const task of this.tasks) {
        if (task.projectIds.length === 0 && (task as Record<string, unknown>).project) {
          const legacy = (task as Record<string, unknown>).project as string;
          if (legacy) {
            task.projectIds = [legacy];
            migrated = true;
          }
        }
      }
      if (migrated) void this.persist();
    },

    /** Ensure selectedProjectId points to a valid project */
    ensureSelectedProject(): void {
      if (!this.selectedProjectId) return;
      const exists = this.projects.some((p) => p.id === this.selectedProjectId && !p.deletedAt);
      if (!exists) {
        this.selectedProjectId = null;
      }
    },

    /** Select a project (null = All Tasks) */
    selectProject(id: string | null): void {
      this.selectedProjectId = id;
      try {
        if (id) {
          localStorage.setItem(STORAGE_KEY_SELECTED_PROJECT, id);
        } else {
          localStorage.removeItem(STORAGE_KEY_SELECTED_PROJECT);
        }
      } catch { /* ignore */ }
    },

    /**
     * Add a new task (optimistic local create, enqueued for sync).
     */
    async addTask(payload: {
      title: string;
      description?: string | null;
      startAt?: string | null;
      dueAt?: string | null;
      priority?: Task["priority"];
      projectIds?: string[];
      tagIds?: string[];
      isImportant?: boolean;
      repeatRule?: string | null;
      notifyEnabled?: boolean;
      reminderSettings?: ReminderSettings | null;
      attachments?: Task["attachments"];
      parentId?: string | null;
      dependsOn?: string[];
      assigneeId?: string | null;
      locationReminders?: Task["locationReminders"];
    }): Promise<Task | null> {
      const title = payload.title.trim();
      if (!title) return null;

      const now = nowIso();
      const task: Task = {
        id: newId(),
        title,
        description: payload.description ?? null,
        completed: false,
        startAt: payload.startAt ?? null,
        dueAt: payload.dueAt ?? null,
        priority: payload.priority ?? 0,
        projectIds: payload.projectIds ?? [],
        tagIds: payload.tagIds ?? [],
        deletedAt: null,
        clientMutationId: null,
        isImportant: payload.isImportant ?? false,
        repeatRule: payload.repeatRule ?? null,
        notifyEnabled: payload.notifyEnabled ?? false,
        reminderSettings: payload.reminderSettings ?? null,
        attachments: payload.attachments ?? [],
        parentId: payload.parentId ?? null,
        sortOrder: null,
        dependsOn: payload.dependsOn ?? [],
        assigneeId: payload.assigneeId ?? null,
        locationReminders: payload.locationReminders ?? [],
        createdAt: now,
        updatedAt: now,
      };

      // Optimistic local add
      this.tasks.unshift(task);
      if (!this.persist()) {
        this.tasks.shift();
        return null;
      }

      // Enqueue sync mutation
      const syncStore = useSyncStore();
      syncStore.enqueue({
        entityType: "task",
        entityId: task.id,
        clientMutationId: task.id,
        op: "upsert",
        payload: {
          title: task.title,
          description: task.description,
          completed: task.completed,
          start_at: task.startAt,
          due_at: task.dueAt,
          priority: task.priority,
          project_ids: task.projectIds,
          tag_ids: task.tagIds,
          is_important: task.isImportant,
          repeat_rule: task.repeatRule,
          notify_enabled: task.notifyEnabled,
          reminder_settings: task.reminderSettings,
          parent_id: task.parentId,
          depends_on: task.dependsOn,
          assignee_id: task.assigneeId,
          attachments: task.attachments,
        },
        clientUpdatedAt: task.updatedAt,
      });

      return task;
    },

    /**
     * Update an existing task (optimistic local update, enqueued for sync).
     */
    async updateTask(
      id: string,
      updates: Partial<
        Pick<
          Task,
          | "title"
          | "description"
          | "completed"
          | "startAt"
          | "dueAt"
          | "priority"
          | "projectIds"
          | "tagIds"
          | "isImportant"
          | "repeatRule"
          | "notifyEnabled"
          | "reminderSettings"
          | "attachments"
          | "parentId"
          | "dependsOn"
          | "assigneeId"
        >
      >,
    ): Promise<boolean> {
      const idx = this.tasks.findIndex((t) => t.id === id && !t.deletedAt);
      if (idx === -1) return false;

      const updated: Task = {
        ...this.tasks[idx]!,
        ...updates,
        updatedAt: nowIso(),
      };
      this.tasks[idx] = updated;
      if (!this.persist()) {
        return false;
      }

      // Enqueue sync mutation
      const syncStore = useSyncStore();
      const payload: Record<string, unknown> = {};
      if (updates.title !== undefined) payload.title = updates.title;
      if (updates.description !== undefined) payload.description = updates.description;
      if (updates.completed !== undefined) payload.completed = updates.completed;
      if (updates.startAt !== undefined) payload.start_at = updates.startAt;
      if (updates.dueAt !== undefined) payload.due_at = updates.dueAt;
      if (updates.priority !== undefined) payload.priority = updates.priority;
      if (updates.projectIds !== undefined) payload.project_ids = updates.projectIds;
      if (updates.tagIds !== undefined) payload.tag_ids = updates.tagIds;
      if (updates.isImportant !== undefined) payload.is_important = updates.isImportant;
      if (updates.repeatRule !== undefined) payload.repeat_rule = updates.repeatRule;
      if (updates.notifyEnabled !== undefined) payload.notify_enabled = updates.notifyEnabled;
      if (updates.reminderSettings !== undefined) payload.reminder_settings = updates.reminderSettings;
      if (updates.attachments !== undefined) payload.attachments = updates.attachments;
      if (updates.parentId !== undefined) payload.parent_id = updates.parentId;
      if (updates.dependsOn !== undefined) payload.depends_on = updates.dependsOn;

      syncStore.enqueue({
        entityType: "task",
        entityId: id,
        clientMutationId: newId(),
        op: "upsert",
        payload,
        clientUpdatedAt: updated.updatedAt,
      });

      return true;
    },

    /**
     * Soft-delete a task (optimistic local delete, enqueued for sync).
     */
    async deleteTask(id: string): Promise<boolean> {
      const idx = this.tasks.findIndex((t) => t.id === id);
      if (idx === -1) return false;
      const task = this.tasks[idx];
      if (!task || task.deletedAt) return false;

      const deletedAt = nowIso();
      this.tasks[idx] = { ...task, deletedAt };
      if (!this.persist()) {
        return false;
      }
      if (isElectron()) await dbTasksSoftDelete(id);

      const syncStore = useSyncStore();
      syncStore.enqueue({
        entityType: "task",
        entityId: id,
        clientMutationId: newId(),
        op: "delete",
        payload: null,
        clientUpdatedAt: deletedAt,
      });

      return true;
    },

    /**
     * Batch soft-delete tasks.
     */
    async batchDeleteTasks(ids: string[]): Promise<void> {
      const deletedAt = nowIso();
      for (const id of ids) {
        const idx = this.tasks.findIndex((t) => t.id === id && !t.deletedAt);
        if (idx === -1) continue;
        this.tasks[idx] = { ...this.tasks[idx]!, deletedAt };
        if (isElectron()) await dbTasksSoftDelete(id);
      }
      this.persist();
      const syncStore = useSyncStore();
      for (const id of ids) {
        syncStore.enqueue({
          entityType: "task",
          entityId: id,
          clientMutationId: newId(),
          op: "delete",
          payload: null,
          clientUpdatedAt: deletedAt,
        });
      }
    },

    /**
     * Restore a soft-deleted task (clear deletedAt).
     */
    async restoreTask(id: string): Promise<boolean> {
      const idx = this.tasks.findIndex((t) => t.id === id && !!t.deletedAt);
      if (idx === -1) return false;
      const task = this.tasks[idx]!;

      // Try API restore first
      const restored = await restoreTaskApi(id);
      if (restored) {
        // Update local with server response
        this.tasks[idx] = { ...restored };
        this.persist();
        if (isElectron()) await dbTasksUpsert(restored);
      } else {
        // Optimistic local restore
        const updatedAt = nowIso();
        this.tasks[idx] = { ...task, deletedAt: null, updatedAt };
        this.persist();
        if (isElectron()) await dbTasksUpsert(this.tasks[idx]!);
        const syncStore = useSyncStore();
        syncStore.enqueue({
          entityType: "task",
          entityId: id,
          clientMutationId: newId(),
          op: "upsert",
          payload: { deleted_at: null },
          clientUpdatedAt: updatedAt,
        });
      }
      return true;
    },

    /**
     * Permanently delete a task (cannot be restored).
     */
    async permanentDeleteTask(id: string): Promise<boolean> {
      const idx = this.tasks.findIndex((t) => t.id === id && !!t.deletedAt);
      if (idx === -1) return false;

      // Try API delete first
      await permanentDeleteTaskApi(id);

      // Always remove locally
      this.tasks.splice(idx, 1);
      this.persist();

      return true;
    },

    /**
     * Refresh deleted tasks from server (for cross-device sync).
     */
    async refreshDeletedTasks(): Promise<void> {
      const deleted = await fetchDeletedTasks();
      if (!deleted) return;
      for (const t of deleted) {
        const idx = this.tasks.findIndex((x) => x.id === t.id);
        if (idx !== -1) {
          this.tasks[idx] = t;
        } else {
          this.tasks.push(t);
        }
      }
      this.persist();
    },

    /**
     * Batch restore tasks.
     */
    async batchRestoreTasks(ids: string[]): Promise<void> {
      for (const id of ids) {
        await this.restoreTask(id);
      }
    },

    /**
     * Batch permanently delete tasks.
     */
    async batchPermanentDeleteTasks(ids: string[]): Promise<void> {
      for (const id of ids) {
        await this.permanentDeleteTask(id);
      }
    },

    /**
     * Batch update tasks (project_ids, tag_ids, priority, is_important, completed).
     */
    async batchUpdateTasks(
      ids: string[],
      patch: {
        projectIds?: string[];
        tagIds?: string[];
        priority?: TaskPriority;
        isImportant?: boolean;
        completed?: boolean;
      },
    ): Promise<void> {
      const updatedAt = nowIso();
      for (const id of ids) {
        const idx = this.tasks.findIndex((t) => t.id === id && !t.deletedAt);
        if (idx === -1) continue;
        const task = this.tasks[idx]!;
        if (patch.projectIds !== undefined) task.projectIds = patch.projectIds;
        if (patch.tagIds !== undefined) task.tagIds = patch.tagIds;
        if (patch.priority !== undefined) task.priority = patch.priority as TaskPriority;
        if (patch.isImportant !== undefined) task.isImportant = patch.isImportant;
        if (patch.completed !== undefined) task.completed = patch.completed;
        task.updatedAt = updatedAt;
        this.tasks[idx] = task;
      }
      this.persist();
      const syncStore = useSyncStore();
      const payload: Record<string, unknown> = {};
      if (patch.projectIds !== undefined) payload.project_ids = patch.projectIds;
      if (patch.tagIds !== undefined) payload.tag_ids = patch.tagIds;
      if (patch.priority !== undefined) payload.priority = patch.priority;
      if (patch.isImportant !== undefined) payload.is_important = patch.isImportant;
      if (patch.completed !== undefined) payload.completed = patch.completed;
      for (const id of ids) {
        syncStore.enqueue({
          entityType: "task",
          entityId: id,
          clientMutationId: newId(),
          op: "upsert",
          payload,
          clientUpdatedAt: updatedAt,
        });
      }
    },

    /**
     * Reorder a task by updating its sortOrder field.
     * @param taskId - ID of the task to move
     * @param beforeTaskId - ID of the task that should come BEFORE this task after move (null = move to start)
     * @param afterTaskId - ID of the task that should come AFTER this task after move (null = move to end)
     */
    async reorderTask(
      taskId: string,
      beforeTaskId: string | null,
      afterTaskId: string | null,
    ): Promise<boolean> {
      const idx = this.tasks.findIndex((t) => t.id === taskId && !t.deletedAt);
      if (idx === -1) return false;

      const allTasks = this.tasks.filter((t) => !t.deletedAt && !t.completed);

      let newSortOrder: number;

      if (beforeTaskId === null && afterTaskId === null) {
        // Move to end: set sortOrder after all existing
        const maxSortOrder = allTasks.reduce((max, t) => {
          if (t.sortOrder != null && t.id !== taskId) return Math.max(max, t.sortOrder);
          return max;
        }, 0);
        newSortOrder = maxSortOrder + 1000;
      } else if (beforeTaskId === null) {
        // Move to beginning before a specific task
        const afterTask = this.tasks.find((t) => t.id === afterTaskId && !t.deletedAt);
        if (!afterTask) return false;
        const allBefore = allTasks.filter((t) => t.id !== taskId && t.sortOrder != null && t.sortOrder < afterTask.sortOrder!);
        const maxBefore = allBefore.reduce((max, t) => Math.max(max, t.sortOrder!), 0);
        newSortOrder = maxBefore > -Infinity ? (maxBefore + (afterTask.sortOrder ?? 0)) / 2 : (afterTask.sortOrder ?? 0) / 2;
      } else if (afterTaskId === null) {
        // Move to end after a specific task
        const beforeTask = this.tasks.find((t) => t.id === beforeTaskId && !t.deletedAt);
        if (!beforeTask) return false;
        const allAfter = allTasks.filter((t) => t.id !== taskId && t.sortOrder != null && t.sortOrder > beforeTask.sortOrder!);
        const minAfter = allAfter.reduce((min, t) => Math.min(min, t.sortOrder!), Infinity);
        newSortOrder = minAfter !== Infinity ? (beforeTask.sortOrder! + minAfter) / 2 : beforeTask.sortOrder! + 1000;
      } else {
        // Move between two tasks
        const beforeTask = this.tasks.find((t) => t.id === beforeTaskId && !t.deletedAt);
        const afterTask = this.tasks.find((t) => t.id === afterTaskId && !t.deletedAt);
        if (!beforeTask || !afterTask) return false;
        newSortOrder = ((beforeTask.sortOrder ?? 0) + (afterTask.sortOrder ?? 0)) / 2;
      }

      if (newSortOrder === undefined || !isFinite(newSortOrder)) {
        newSortOrder = (beforeTaskId ? (this.tasks.find((t) => t.id === beforeTaskId)?.sortOrder ?? 0) : 0) + 1000;
      }

      // Clamp: if newSortOrder is too close to an existing value, renormalize
      const EPSILON = 0.0001;
      const hasCollision = allTasks.some((t) => t.id !== taskId && t.sortOrder != null && Math.abs(t.sortOrder - newSortOrder) < EPSILON);
      if (hasCollision) {
        // Renormalize all tasks: reassign sortOrder 1000, 2000, 3000...
        const tasksToSort = [...allTasks].sort((a, b) => {
          const sa = a.sortOrder ?? 0;
          const sb = b.sortOrder ?? 0;
          return sa - sb;
        });
        let order = 1000;
        for (const t of tasksToSort) {
          if (t.id === taskId) continue;
          const tIdx = this.tasks.findIndex((x) => x.id === t.id);
          if (tIdx !== -1) {
            this.tasks[tIdx] = { ...this.tasks[tIdx]!, sortOrder: order };
            order += 1000;
          }
        }
        const taskIdx = this.tasks.findIndex((t) => t.id === taskId);
        if (taskIdx !== -1) {
          this.tasks[taskIdx] = { ...this.tasks[taskIdx]!, sortOrder: newSortOrder };
        }
      } else {
        const taskIdx = this.tasks.findIndex((t) => t.id === taskId);
        if (taskIdx !== -1) {
          this.tasks[taskIdx] = { ...this.tasks[taskIdx]!, sortOrder: newSortOrder };
        }
      }

      void this.persist();

      // Enqueue sync mutation
      const syncStore = useSyncStore();
      syncStore.enqueue({
        entityType: "task",
        entityId: taskId,
        clientMutationId: newId(),
        op: "upsert",
        payload: { sort_order: newSortOrder },
        clientUpdatedAt: nowIso(),
      });

      return true;
    },

    /**
     * Toggle task completion.
     */
    async toggleTaskComplete(id: string): Promise<boolean> {
      const task = this.tasks.find((t) => t.id === id && !t.deletedAt);
      if (!task) return false;
      return this.updateTask(id, { completed: !task.completed });
    },

    /**
     * Upsert a task from SSE event or sync response.
     */
    upsertTask(task: Task): void {
      const idx = this.tasks.findIndex((t) => t.id === task.id);
      if (task.deletedAt) {
        if (idx !== -1) this.tasks.splice(idx, 1);
      } else if (idx !== -1) {
        this.tasks[idx] = task;
      } else {
        this.tasks.unshift(task);
      }
      void this.persist();
    },

    /**
     * Upsert a project from SSE event or sync response.
     */
    upsertProject(project: Project): void {
      const idx = this.projects.findIndex((p) => p.id === project.id);
      if (project.deletedAt) {
        if (idx !== -1) this.projects.splice(idx, 1);
      } else if (idx !== -1) {
        this.projects[idx] = project;
      } else {
        this.projects.push(project);
      }
      migrateLegacyProjectBuiltinFlags(this.projects);
      void this.persistProjects();
    },

    /**
     * Create a new project (optimistic local create, enqueued for sync).
     */
    async addProject(name: string, color?: string | null, teamId?: string | null, groupId?: string | null): Promise<string | null> {
      const n = name.trim();
      if (!n) return null;

      const now = nowIso();
      const project: Project = {
        id: newId(),
        name: n,
        color: color ?? null,
        deletedAt: null,
        createdAt: now,
        updatedAt: now,
        builtIn: false,
        teamId: teamId ?? null,
        groupId: groupId ?? null,
      };

      this.projects.push(project);
      if (!this.persistProjects()) {
        this.projects.pop();
        return null;
      }

      const syncStore = useSyncStore();
      syncStore.enqueue({
        entityType: "project",
        entityId: project.id,
        clientMutationId: project.id,
        op: "upsert",
        payload: { name: project.name, color: project.color, team_id: project.teamId, group_id: project.groupId },
        clientUpdatedAt: project.updatedAt,
      });

      return project.id;
    },

    /**
     * Update a project (optimistic local update, enqueued for sync).
     */
    async updateProject(
      id: string,
      updates: Partial<Pick<Project, "name" | "color" | "archived" | "muted" | "groupId">>,
    ): Promise<boolean> {
      const idx = this.projects.findIndex((p) => p.id === id && !p.deletedAt);
      if (idx === -1) return false;

      const updated: Project = {
        ...this.projects[idx]!,
        ...updates,
        updatedAt: nowIso(),
      };
      this.projects[idx] = updated;
      if (!this.persistProjects()) {
        return false;
      }

      const syncStore = useSyncStore();
      const payload: Record<string, unknown> = {};
      if (updates.name !== undefined) payload.name = updates.name;
      if (updates.color !== undefined) payload.color = updates.color;
      if (updates.archived !== undefined) payload.archived = updates.archived;
      if (updates.muted !== undefined) payload.muted = updates.muted;
      if (updates.groupId !== undefined) payload.group_id = updates.groupId;

      syncStore.enqueue({
        entityType: "project",
        entityId: id,
        clientMutationId: newId(),
        op: "upsert",
        payload,
        clientUpdatedAt: updated.updatedAt,
      });

      return true;
    },

    /**
     * Archive a project (soft-delete from active view).
     */
    async archiveProject(id: string): Promise<boolean> {
      return this.updateProject(id, { archived: true });
    },

    /**
     * Soft-delete a project.
     */
    async deleteProject(id: string): Promise<"ok" | "notfound" | "already" | "builtin" | "persist"> {
      const idx = this.projects.findIndex((p) => p.id === id);
      if (idx === -1) return "notfound";
      const project = this.projects[idx];
      if (!project) return "notfound";
      if (project.deletedAt) return "already";
      if (project.builtIn) return "builtin";

      const deletedAt = nowIso();
      this.projects[idx] = { ...project, deletedAt };
      if (!this.persistProjects()) {
        return "persist";
      }

      const syncStore = useSyncStore();
      syncStore.enqueue({
        entityType: "project",
        entityId: id,
        clientMutationId: newId(),
        op: "delete",
        payload: null,
        clientUpdatedAt: deletedAt,
      });

      return "ok";
    },

    /** Get task by ID */
    taskById(id: string): Task | undefined {
      return this.tasks.find((t) => t.id === id);
    },
  },
});
