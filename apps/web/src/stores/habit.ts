/**
 * Habit Store
 *
 * Manages habits for tracking. Persisted to localStorage alongside tasks.
 */

import { defineStore } from "pinia";
import type { Habit, HabitLog } from "@tasktick/shared";
import { newId } from "../utils/id";

const HABITS_STORAGE_KEY = "tasktick.local.habits.v1";
const HABIT_LOGS_STORAGE_KEY = "tasktick.local.habit_logs.v1";

function nowIso(): string {
  return new Date().toISOString();
}

function todayKey(): string {
  return new Date().toISOString().slice(0, 10);
}

export const useHabitStore = defineStore("habit", {
  state: () => ({
    habits: [] as Habit[],
    habitLogs: [] as HabitLog[],
  }),

  getters: {
    /** Active (non-deleted) habits */
    activeHabits(state): Habit[] {
      return state.habits.filter((h) => !h.deletedAt);
    },

    /** Get habit by ID */
    habitById(state): (id: string) => Habit | undefined {
      return (id: string) => state.habits.find((h) => h.id === id);
    },

    /** Get logs for a specific habit */
    logsByHabitId(): (habitId: string) => HabitLog[] {
      return (habitId: string) => this.habitLogs.filter((l) => l.habitId === habitId);
    },

    /** Check if habit is completed today */
    isCompletedToday(): (habitId: string) => boolean {
      const today = todayKey();
      return (habitId: string) => this.habitLogs.some((l) => l.habitId === habitId && l.date === today);
    },

    /** Get completion streaks for habits */
    streakByHabitId(): (habitId: string) => number {
      return (habitId: string) => {
        const logs = this.habitLogs
          .filter((l) => l.habitId === habitId)
          .sort((a, b) => b.date.localeCompare(a.date));
        if (logs.length === 0) return 0;

        let streak = 0;
        const today = todayKey();
        let checkDate = today;

        for (const log of logs) {
          if (log.date === checkDate) {
            streak++;
            const d = new Date(checkDate);
            d.setDate(d.getDate() - 1);
            checkDate = d.toISOString().slice(0, 10);
          } else if (log.date < checkDate) {
            break;
          }
        }
        return streak;
      };
    },
  },

  actions: {
    persist(): boolean {
      try {
        localStorage.setItem(HABITS_STORAGE_KEY, JSON.stringify(this.habits));
        localStorage.setItem(HABIT_LOGS_STORAGE_KEY, JSON.stringify(this.habitLogs));
      } catch {
        /* ignore */
      }
      return true;
    },

    async hydrate(): Promise<void> {
      this.hydrateFromStorage();
    },

    hydrateFromStorage(): void {
      try {
        const rawHabits = localStorage.getItem(HABITS_STORAGE_KEY);
        if (rawHabits) {
          this.habits = JSON.parse(rawHabits);
        }
        const rawLogs = localStorage.getItem(HABIT_LOGS_STORAGE_KEY);
        if (rawLogs) {
          this.habitLogs = JSON.parse(rawLogs);
        }
      } catch {
        /* ignore */
      }
    },

    async addHabit(name: string, frequency: Habit["frequency"] = "daily", color?: string): Promise<string | null> {
      const n = name.trim();
      if (!n) return null;

      const habit: Habit = {
        id: newId(),
        name: n,
        description: null,
        color: color ?? null,
        frequency,
        weekDays: undefined,
        reminderTime: null,
        createdAt: nowIso(),
        updatedAt: nowIso(),
        deletedAt: null,
      };

      this.habits.push(habit);
      if (!this.persist()) {
        this.habits.pop();
        return null;
      }

      return habit.id;
    },

    async updateHabit(id: string, updates: Partial<Pick<Habit, "name" | "description" | "color" | "frequency" | "weekDays" | "reminderTime">>): Promise<boolean> {
      const idx = this.habits.findIndex((h) => h.id === id && !h.deletedAt);
      if (idx === -1) return false;

      const updated: Habit = {
        ...this.habits[idx]!,
        ...updates,
        updatedAt: nowIso(),
      };
      this.habits[idx] = updated;
      if (!this.persist()) return false;

      return true;
    },

    async deleteHabit(id: string): Promise<boolean> {
      const idx = this.habits.findIndex((h) => h.id === id);
      if (idx === -1) return false;
      const habit = this.habits[idx];
      if (!habit || habit.deletedAt) return false;

      const deletedAt = nowIso();
      this.habits[idx] = { ...habit, deletedAt };
      if (!this.persist()) return false;

      return true;
    },

    /** Toggle habit completion for today */
    async toggleToday(habitId: string, note?: string): Promise<boolean> {
      const habit = this.habits.find((h) => h.id === habitId && !h.deletedAt);
      if (!habit) return false;

      const today = todayKey();
      const existingIdx = this.habitLogs.findIndex((l) => l.habitId === habitId && l.date === today);

      if (existingIdx !== -1) {
        // Uncomplete - remove log
        this.habitLogs.splice(existingIdx, 1);
      } else {
        // Complete - add log
        const log: HabitLog = {
          id: newId(),
          habitId,
          date: today,
          completedAt: nowIso(),
          note: note ?? null,
        };
        this.habitLogs.push(log);
      }

      return this.persist();
    },

    /** Check if habit should show today based on frequency */
    shouldShowToday(habit: Habit): boolean {
      if (habit.frequency === "daily") return true;
      if (habit.frequency === "weekly" && habit.weekDays) {
        const today = new Date();
        const dayOfWeek = (today.getDay() + 6) % 7; // Convert Sunday=0 to Monday=0
        return habit.weekDays.includes(dayOfWeek);
      }
      return true;
    },
  },
});
