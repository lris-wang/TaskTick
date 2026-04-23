/**
 * Comments composable for task comments.
 *
 * Manages per-task comment lists loaded on demand.
 */

import { ref } from "vue";
import type { Comment } from "@tasktick/shared";
import { fetchComments, createComment, deleteComment as deleteCommentApi } from "../api";

const cache = new Map<string, { comments: Comment[]; loading: boolean }>();

export function useComments(taskId: string) {
  if (!cache.has(taskId)) {
    cache.set(taskId, { comments: [], loading: false });
  }

  const entry = cache.get(taskId)!;
  const comments = ref<Comment[]>(entry.comments);
  const loading = ref(entry.loading);
  const newCommentText = ref("");

  async function load(): Promise<void> {
    if (loading.value) return;
    loading.value = true;
    try {
      const data = await fetchComments(taskId);
      if (data) {
        comments.value = data;
        entry.comments = data;
      }
    } finally {
      loading.value = false;
      entry.loading = false;
    }
  }

  async function add(): Promise<boolean> {
    const text = newCommentText.value.trim();
    if (!text) return false;
    const created = await createComment(taskId, text);
    if (created) {
      comments.value.push(created);
      entry.comments = comments.value;
      newCommentText.value = "";
      return true;
    }
    return false;
  }

  async function remove(commentId: string): Promise<boolean> {
    const ok = await deleteCommentApi(commentId);
    if (ok) {
      const idx = comments.value.findIndex((c) => c.id === commentId);
      if (idx !== -1) {
        comments.value.splice(idx, 1);
        entry.comments = comments.value;
      }
    }
    return ok;
  }

  function clearCache(): void {
    cache.delete(taskId);
  }

  return {
    comments,
    loading,
    newCommentText,
    load,
    add,
    remove,
    clearCache,
  };
}
