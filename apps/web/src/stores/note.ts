/**
 * Note Store
 *
 * Manages notes (simple title + content items without task features like due date/priority/reminders).
 * Notes are synced with the server and persisted to localStorage.
 */

import { defineStore } from "pinia";
import type { Note } from "@tasktick/shared";
import {
  createNote as apiCreateNote,
  deleteNote as apiDeleteNote,
  fetchNotes as apiFetchNotes,
  updateNote as apiUpdateNote,
} from "../api";
import { newId } from "../utils/id";

const NOTES_STORAGE_KEY = "tasktick.local.notes.v1";

function nowIso(): string {
  return new Date().toISOString();
}

export const useNoteStore = defineStore("note", {
  state: () => ({
    notes: [] as Note[],
  }),

  getters: {
    visibleNotes(state): Note[] {
      return state.notes.filter((n) => !n.deletedAt);
    },

    noteById(state): (id: string) => Note | undefined {
      return (id: string) => state.notes.find((n) => n.id === id);
    },
  },

  actions: {
    persist(): boolean {
      try {
        localStorage.setItem(NOTES_STORAGE_KEY, JSON.stringify(this.notes));
      } catch {
        /* ignore */
      }
      return true;
    },

    hydrate(): void {
      try {
        const raw = localStorage.getItem(NOTES_STORAGE_KEY);
        if (raw) {
          this.notes = JSON.parse(raw);
        }
      } catch {
        /* ignore */
      }
    },

    async fetchNotes(): Promise<void> {
      const data = await apiFetchNotes();
      if (data) {
        this.notes = data;
        this.persist();
      }
    },

    async addNote(title: string, content?: string | null, isMarkdown?: boolean): Promise<Note | null> {
      const t = title.trim();
      if (!t) return null;

      const note: Note = {
        id: newId(),
        userId: "",
        title: t,
        content: content ?? null,
        isMarkdown: isMarkdown ?? false,
        deletedAt: null,
        createdAt: nowIso(),
        updatedAt: nowIso(),
      };

      // Optimistic local add
      this.notes.unshift(note);
      this.persist();

      // Sync with server
      const created = await apiCreateNote({ title: t, content: content ?? null, is_markdown: isMarkdown ?? false });
      if (created) {
        // Replace optimistic entry with server-confirmed entry
        const idx = this.notes.findIndex((n) => n.id === note.id);
        if (idx !== -1) this.notes[idx] = created;
        this.persist();
        return created;
      }

      // Rollback optimistic add on failure
      this.notes = this.notes.filter((n) => n.id !== note.id);
      return null;
    },

    async updateNote(id: string, updates: Partial<Pick<Note, "title" | "content" | "isMarkdown">>): Promise<boolean> {
      const idx = this.notes.findIndex((n) => n.id === id && !n.deletedAt);
      if (idx === -1) return false;

      const updated: Note = {
        ...this.notes[idx]!,
        ...updates,
        updatedAt: nowIso(),
      };
      this.notes[idx] = updated;
      this.persist();

      const ok = await apiUpdateNote(id, updates as { title?: string | null; content?: string | null; is_markdown?: boolean | null });
      if (!ok) {
        // Keep local update even if API fails (will sync later)
      }
      return true;
    },

    async deleteNote(id: string): Promise<boolean> {
      const idx = this.notes.findIndex((n) => n.id === id);
      if (idx === -1) return false;

      const deletedAt = nowIso();
      this.notes[idx] = { ...this.notes[idx]!, deletedAt };
      this.persist();

      const ok = await apiDeleteNote(id);
      return ok;
    },

    upsertNote(note: Note): void {
      const idx = this.notes.findIndex((n) => n.id === note.id);
      if (idx !== -1) {
        this.notes[idx] = note;
      } else {
        this.notes.unshift(note);
      }
      this.persist();
    },

    removeNote(id: string): void {
      this.notes = this.notes.filter((n) => n.id !== id);
      this.persist();
    },
  },
});
