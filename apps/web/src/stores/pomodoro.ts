/**
 * Pomodoro Store
 *
 * Manages Pomodoro timer state and sessions.
 * Timer runs locally; sessions are synced with the backend API.
 * Persisted to localStorage for timer state recovery.
 */

import { defineStore } from "pinia";
import type { PomodoroSession } from "@tasktick/shared";
import {
  createPomodoro as apiCreatePomodoro,
  fetchPomodoros as apiFetchPomodoros,
  fetchPomodoroStats,
  updatePomodoro as apiUpdatePomodoro,
} from "../api";
import type { PomodoroStats } from "../api";
import { useAuthStore } from "./auth";
import { useTaskStore } from "./task";

const STORAGE_KEY = "tasktick.local.pomodoro.v1";

function localDateKey(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

export const usePomodoroStore = defineStore("pomodoro", {
  state: () => ({
    sessions: [] as PomodoroSession[],
    stats: null as PomodoroStats | null,
    currentTaskId: null as string | null,
    durationMinutes: 25 as number,
    isRunning: false,
    isPaused: false,
    remainingSeconds: 25 * 60,
    // Internal: the session we created on the server
    _activeSessionId: null as string | null,
    _timerInterval: null as ReturnType<typeof setInterval> | null,
  }),

  getters: {
    todayPomodoros(): number {
      const today = localDateKey(new Date());
      return this.sessions.filter(
        (s) => s.completed && localDateKey(new Date(s.startedAt)) === today,
      ).length;
    },

    todayMinutes(): number {
      const today = localDateKey(new Date());
      return this.sessions
        .filter(
          (s) => s.completed && localDateKey(new Date(s.startedAt)) === today,
        )
        .reduce((sum, s) => sum + s.durationMinutes, 0);
    },

    weekPomodoros(): number {
      const now = new Date();
      const dow = now.getDay();
      const monday = new Date(now);
      monday.setDate(now.getDate() - (dow === 0 ? 6 : dow - 1));
      const weekStart = localDateKey(monday);
      return this.sessions.filter(
        (s) =>
          s.completed && localDateKey(new Date(s.startedAt)) >= weekStart,
      ).length;
    },

    weekMinutes(): number {
      const now = new Date();
      const dow = now.getDay();
      const monday = new Date(now);
      monday.setDate(now.getDate() - (dow === 0 ? 6 : dow - 1));
      const weekStart = localDateKey(monday);
      return this.sessions
        .filter(
          (s) =>
            s.completed && localDateKey(new Date(s.startedAt)) >= weekStart,
        )
        .reduce((sum, s) => sum + s.durationMinutes, 0);
    },

    progress(): number {
      if (!this.isRunning && !this.isPaused) return 0;
      const total = this.durationMinutes * 60;
      return Math.round(((total - this.remainingSeconds) / total) * 100);
    },

    timerDisplay(): string {
      const m = Math.floor(this.remainingSeconds / 60);
      const s = this.remainingSeconds % 60;
      return `${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
    },

    availableTaskOptions(): { label: string; value: string }[] {
      const taskStore = useTaskStore();
      return taskStore.visibleTasks
        .filter((t) => !t.deletedAt)
        .map((t) => ({ label: t.title, value: t.id }));
    },
  },

  actions: {
    persist(): void {
      try {
        localStorage.setItem(
          STORAGE_KEY,
          JSON.stringify({
            currentTaskId: this.currentTaskId,
            durationMinutes: this.durationMinutes,
            remainingSeconds: this.remainingSeconds,
            isRunning: this.isRunning,
            isPaused: this.isPaused,
          }),
        );
      } catch {
        /* ignore */
      }
    },

    hydrate(): void {
      try {
        const raw = localStorage.getItem(STORAGE_KEY);
        if (raw) {
          const data = JSON.parse(raw);
          if (data.currentTaskId !== undefined) this.currentTaskId = data.currentTaskId;
          if (data.durationMinutes) this.durationMinutes = data.durationMinutes;
          if (data.remainingSeconds) this.remainingSeconds = data.remainingSeconds;
          // Don't auto-resume timer on page load — just restore state
          this.isRunning = false;
          this.isPaused = false;
        }
      } catch {
        /* ignore */
      }
    },

    async fetchSessions(): Promise<void> {
      const auth = useAuthStore();
      if (!auth.isLoggedIn) return;
      const data = await apiFetchPomodoros();
      if (data) this.sessions = data;
    },

    async fetchStats(): Promise<void> {
      const auth = useAuthStore();
      if (!auth.isLoggedIn) return;
      this.stats = await fetchPomodoroStats();
    },

    setDuration(minutes: number): void {
      this.durationMinutes = minutes;
      this.remainingSeconds = minutes * 60;
      this.persist();
    },

    selectTask(taskId: string | null): void {
      this.currentTaskId = taskId;
      this.persist();
    },

    async startTimer(): Promise<void> {
      if (this.isRunning) return;

      const auth = useAuthStore();
      if (!auth.isLoggedIn) return;

      // Create session on server
      const session = await apiCreatePomodoro({
        task_id: this.currentTaskId,
        started_at: new Date().toISOString(),
        duration_minutes: this.durationMinutes,
      });

      if (!session) return;
      this._activeSessionId = session.id;

      this.isRunning = true;
      this.isPaused = false;
      this._startInterval();
      this.persist();

      // Request notification permission
      if (Notification.permission === "default") {
        void Notification.requestPermission();
      }
    },

    pauseTimer(): void {
      if (!this.isRunning) return;
      this.isPaused = true;
      this.isRunning = false;
      this._clearInterval();
      this.persist();
    },

    resumeTimer(): void {
      if (!this.isPaused) return;
      this.isRunning = true;
      this.isPaused = false;
      this._startInterval();
      this.persist();
    },

    async stopTimer(completed: boolean): Promise<void> {
      this._clearInterval();
      this.isRunning = false;
      this.isPaused = false;

      if (this._activeSessionId) {
        await apiUpdatePomodoro(this._activeSessionId, {
          ended_at: new Date().toISOString(),
          completed,
        });
        this._activeSessionId = null;
      }

      this.remainingSeconds = this.durationMinutes * 60;
      this.persist();
    },

    _startInterval(): void {
      this._clearInterval();
      this._timerInterval = setInterval(() => {
        this._tick();
      }, 1000);
    },

    _clearInterval(): void {
      if (this._timerInterval !== null) {
        clearInterval(this._timerInterval);
        this._timerInterval = null;
      }
    },

    _tick(): void {
      if (this.remainingSeconds > 0) {
        this.remainingSeconds--;
        this.persist();
      } else {
        // Timer completed
        void this._onComplete();
      }
    },

    async _onComplete(): Promise<void> {
      this._clearInterval();
      this.isRunning = false;
      this.isPaused = false;

      if (this._activeSessionId) {
        await apiUpdatePomodoro(this._activeSessionId, {
          ended_at: new Date().toISOString(),
          completed: true,
        });
        this._activeSessionId = null;
      }

      this.remainingSeconds = this.durationMinutes * 60;

      // Send desktop notification
      if (Notification.permission === "granted") {
        const taskInfo = this.currentTaskId ? ` - 任务进行中` : "";
        new Notification("🍅 番茄钟完成！", {
          body: `恭喜完成 ${this.durationMinutes} 分钟专注${taskInfo}`,
        });
      }

      // Refresh sessions and stats
      await this.fetchSessions();
      await this.fetchStats();
      this.persist();
    },
  },
});
