/**
 * Schedule Store
 *
 * Manages calendar schedules. Synced with the backend API.
 * Persisted to localStorage as fallback.
 */

import { defineStore } from "pinia";
import type { Schedule } from "@tasktick/shared";
import {
  createSchedule as apiCreateSchedule,
  deleteSchedule as apiDeleteSchedule,
  fetchSchedules as apiFetchSchedules,
  updateSchedule as apiUpdateSchedule,
} from "../api";
import { useAuthStore } from "./auth";

const STORAGE_KEY = "tasktick.local.schedules.v1";

function localDateKey(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

export const useScheduleStore = defineStore("schedule", {
  state: () => ({
    schedules: [] as Schedule[],
  }),

  getters: {
    /** Get schedule by ID */
    scheduleById(state): (id: string) => Schedule | undefined {
      return (id: string) => state.schedules.find((s) => s.id === id);
    },

    /** Get schedules for a specific date */
    schedulesByDate(): (dateKey: string) => Schedule[] {
      return (dateKey: string) =>
        this.schedules.filter((s) => {
          const startKey = localDateKey(new Date(s.startAt));
          return startKey === dateKey;
        });
    },

    /** Get schedules in a month */
    schedulesInMonth(): (year: number, month: number) => Schedule[] {
      return (year: number, month: number) =>
        this.schedules.filter((s) => {
          const d = new Date(s.startAt);
          return d.getFullYear() === year && d.getMonth() === month;
        });
    },
  },

  actions: {
    persist(): boolean {
      try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(this.schedules));
      } catch {
        /* ignore */
      }
      return true;
    },

    hydrate(): void {
      try {
        const raw = localStorage.getItem(STORAGE_KEY);
        if (raw) {
          this.schedules = JSON.parse(raw);
        }
      } catch {
        /* ignore */
      }
    },

    async hydrateFromApi(year: number, month: number): Promise<void> {
      const auth = useAuthStore();
      if (!auth.isLoggedIn) return;

      // Fetch schedules for the given month (with buffer)
      const fromDate = new Date(year, month - 1, 1);
      const toDate = new Date(year, month, 0);
      const from = fromDate.toISOString();
      const to = toDate.toISOString();

      const data = await apiFetchSchedules(from, to);
      if (data) {
        this.schedules = data;
        this.persist();
      }
    },

    async addSchedule(payload: {
      title: string;
      description?: string | null;
      startAt: string;
      endAt?: string | null;
      timezone?: string;
      location?: string | null;
    }): Promise<string | null> {
      const schedule = await apiCreateSchedule({
        title: payload.title,
        description: payload.description ?? null,
        start_at: payload.startAt,
        end_at: payload.endAt ?? null,
        timezone: payload.timezone ?? Intl.DateTimeFormat().resolvedOptions().timeZone,
        location: payload.location ?? null,
      });
      if (schedule) {
        this.schedules.push(schedule);
        this.persist();
        return schedule.id;
      }
      return null;
    },

    async updateSchedule(
      id: string,
      patch: Partial<{
        title: string;
        description: string | null;
        startAt: string;
        endAt: string | null;
        timezone: string;
        location: string | null;
      }>,
    ): Promise<boolean> {
      const idx = this.schedules.findIndex((s) => s.id === id);
      if (idx === -1) return false;

      const updated = await apiUpdateSchedule(id, {
        title: patch.title,
        description: patch.description,
        start_at: patch.startAt,
        end_at: patch.endAt,
        timezone: patch.timezone,
        location: patch.location,
      });
      if (updated) {
        this.schedules[idx] = updated;
        this.persist();
        return true;
      }
      return false;
    },

    async deleteSchedule(id: string): Promise<boolean> {
      const ok = await apiDeleteSchedule(id);
      if (ok) {
        this.schedules = this.schedules.filter((s) => s.id !== id);
        this.persist();
        return true;
      }
      return false;
    },
  },
});
