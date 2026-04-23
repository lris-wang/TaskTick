/**
 * Undo/Redo composable for task operations.
 *
 * Maintains an in-memory stack of operations with their inverse counterparts.
 * Does not persist across page reloads (typical for undo/redo).
 */

import { computed, ref } from "vue";
import type { Task } from "@tasktick/shared";
import { useTaskStore } from "../stores/task";

export type UndoOperationType =
  | "task:create"
  | "task:update"
  | "task:delete"
  | "task:toggleComplete"
  | "task:restore";

export interface UndoEntry {
  type: UndoOperationType;
  /** ID of the affected entity */
  id: string;
  /** Snapshot of state before the change */
  before: Task | null;
  /** Snapshot of state after the change */
  after: Task | null;
}

const MAX_STACK_SIZE = 50;

const undoStack = ref<UndoEntry[]>([]);
const redoStack = ref<UndoEntry[]>([]);

export function useUndoRedo() {
  const store = useTaskStore();

  const canUndo = computed(() => undoStack.value.length > 0);
  const canRedo = computed(() => redoStack.value.length > 0);

  function push(entry: UndoEntry): void {
    undoStack.value.push(entry);
    if (undoStack.value.length > MAX_STACK_SIZE) {
      undoStack.value.shift();
    }
    // Clear redo stack on new action
    redoStack.value = [];
  }

  /** Record a task creation */
  function recordCreate(task: Task): void {
    push({ type: "task:create", id: task.id, before: null, after: { ...task } });
  }

  /** Record a task update (before + after snapshots) */
  function recordUpdate(id: string, before: Task, after: Task): void {
    push({ type: "task:update", id, before: { ...before }, after: { ...after } });
  }

  /** Record a task deletion */
  function recordDelete(task: Task): void {
    push({ type: "task:delete", id: task.id, before: { ...task }, after: null });
  }

  /** Record a toggle complete action */
  function recordToggleComplete(task: Task): void {
    push({ type: "task:toggleComplete", id: task.id, before: { ...task }, after: { ...task } });
  }

  /** Record a task restore */
  function recordRestore(task: Task): void {
    push({ type: "task:restore", id: task.id, before: { ...task }, after: { ...task } });
  }

  /** Undo the last operation */
  async function undo(): Promise<void> {
    const entry = undoStack.value.pop();
    if (!entry) return;

    switch (entry.type) {
      case "task:create": {
        // Undo create = delete
        const task = store.tasks.find((t) => t.id === entry.id);
        if (task) {
          await store.deleteTask(entry.id);
          // Push to redo stack
          redoStack.value.push(entry);
        }
        break;
      }
      case "task:update": {
        // Undo update = restore previous state
        if (entry.before) {
          const current = store.tasks.find((t) => t.id === entry.id);
          if (current) {
            await store.updateTask(entry.id, {
              title: entry.before.title,
              description: entry.before.description,
              completed: entry.before.completed,
              dueAt: entry.before.dueAt,
              priority: entry.before.priority,
              projectIds: entry.before.projectIds,
              tagIds: entry.before.tagIds,
              isImportant: entry.before.isImportant,
              repeatRule: entry.before.repeatRule,
              notifyEnabled: entry.before.notifyEnabled,
              attachments: entry.before.attachments,
              parentId: entry.before.parentId,
              dependsOn: entry.before.dependsOn,
            });
            // Swap before/after for redo
            redoStack.value.push({ ...entry, before: current, after: entry.before });
          }
        }
        break;
      }
      case "task:delete": {
        // Undo delete = restore
        if (entry.before) {
          await store.restoreTask(entry.id);
          redoStack.value.push(entry);
        }
        break;
      }
      case "task:toggleComplete": {
        // Undo toggle = toggle again
        if (entry.before) {
          await store.toggleTaskComplete(entry.id);
          redoStack.value.push(entry);
        }
        break;
      }
      case "task:restore": {
        // Undo restore = delete again
        const task = store.tasks.find((t) => t.id === entry.id);
        if (task) {
          await store.deleteTask(entry.id);
          redoStack.value.push(entry);
        }
        break;
      }
    }
  }

  /** Redo the last undone operation */
  async function redo(): Promise<void> {
    const entry = redoStack.value.pop();
    if (!entry) return;

    switch (entry.type) {
      case "task:create": {
        // Redo create = create again (we only have the task object, recreate it)
        if (entry.after) {
          // The task was already hard-deleted from store, we need to re-add it
          // For simplicity, re-apply the create via the after snapshot
          const newTask = await store.addTask({
            title: entry.after.title,
            description: entry.after.description ?? null,
            startAt: entry.after.startAt ?? null,
            dueAt: entry.after.dueAt ?? null,
            priority: entry.after.priority,
            projectIds: entry.after.projectIds ?? [],
            tagIds: entry.after.tagIds ?? [],
            isImportant: entry.after.isImportant,
            repeatRule: entry.after.repeatRule ?? null,
            notifyEnabled: entry.after.notifyEnabled,
            attachments: entry.after.attachments ?? [],
            parentId: entry.after.parentId ?? null,
            dependsOn: entry.after.dependsOn ?? [],
          });
          if (newTask) {
            undoStack.value.push({ ...entry, after: entry.after });
          }
        }
        break;
      }
      case "task:update": {
        // Redo update = apply the after state
        if (entry.after) {
          await store.updateTask(entry.id, {
            title: entry.after.title,
            description: entry.after.description,
            completed: entry.after.completed,
            dueAt: entry.after.dueAt,
            priority: entry.after.priority,
            projectIds: entry.after.projectIds,
            tagIds: entry.after.tagIds,
            isImportant: entry.after.isImportant,
            repeatRule: entry.after.repeatRule,
            notifyEnabled: entry.after.notifyEnabled,
            attachments: entry.after.attachments,
            parentId: entry.after.parentId,
            dependsOn: entry.after.dependsOn,
          });
          undoStack.value.push(entry);
        }
        break;
      }
      case "task:delete": {
        // Redo delete = delete again
        await store.deleteTask(entry.id);
        undoStack.value.push(entry);
        break;
      }
      case "task:toggleComplete": {
        // Redo toggle = toggle again
        await store.toggleTaskComplete(entry.id);
        undoStack.value.push(entry);
        break;
      }
      case "task:restore": {
        // Redo restore = restore again
        await store.restoreTask(entry.id);
        undoStack.value.push(entry);
        break;
      }
    }
  }

  function clear(): void {
    undoStack.value = [];
    redoStack.value = [];
  }

  return {
    canUndo,
    canRedo,
    recordCreate,
    recordUpdate,
    recordDelete,
    recordToggleComplete,
    recordRestore,
    undo,
    redo,
    clear,
  };
}
