/**
 * Subtask Template Composable
 *
 * Manages subtask templates - saved sets of subtask titles
 * that can be quickly added to any parent task.
 * Persisted to localStorage.
 */

import { ref } from "vue";
import { newId } from "../utils/id";

export interface SubtaskTemplate {
  id: string;
  name: string;
  /** List of subtask title strings */
  items: string[];
  createdAt: string;
}

const STORAGE_KEY = "tasktick.local.subtask_templates.v1";

function nowIso(): string {
  return new Date().toISOString();
}

const templates = ref<SubtaskTemplate[]>([]);

function loadFromStorage(): void {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      templates.value = JSON.parse(raw);
    }
  } catch {
    templates.value = [];
  }
}

function persist(): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(templates.value));
  } catch {
    /* ignore */
  }
}

export function useSubtaskTemplate() {
  // Load on first use
  if (templates.value.length === 0) {
    loadFromStorage();
  }

  function getTemplates(): SubtaskTemplate[] {
    return templates.value;
  }

  function saveTemplate(name: string, items: string[]): SubtaskTemplate {
    const template: SubtaskTemplate = {
      id: newId(),
      name: name.trim() || `模板 ${templates.value.length + 1}`,
      items: items.filter((t) => t.trim()),
      createdAt: nowIso(),
    };
    templates.value.push(template);
    persist();
    return template;
  }

  function deleteTemplate(id: string): void {
    const idx = templates.value.findIndex((t) => t.id === id);
    if (idx !== -1) {
      templates.value.splice(idx, 1);
      persist();
    }
  }

  function updateTemplateName(id: string, name: string): void {
    const t = templates.value.find((t) => t.id === id);
    if (t) {
      t.name = name.trim() || t.name;
      persist();
    }
  }

  /** Parse a newline-separated string into an array of non-empty trimmed strings */
  function parseLines(text: string): string[] {
    return text
      .split("\n")
      .map((l) => l.trim())
      .filter((l) => l.length > 0);
  }

  return {
    templates,
    getTemplates,
    saveTemplate,
    deleteTemplate,
    updateTemplateName,
    parseLines,
  };
}
