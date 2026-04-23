/**
 * TaskTick API Client
 *
 * Calls to FastAPI backend. Auth token is read from the auth store.
 * When no server is configured or the call fails, operations return
 * `null` so callers can fall back to localStorage-only behavior.
 */

import type { Note, Project, ProjectGroup, Task, Tag, Team, TeamMember, Schedule, PomodoroSession } from "@tasktick/shared";
import { useAuthStore } from "../stores/auth";

const BASE = import.meta.env.VITE_API_URL ?? "http://127.0.0.1:8000";

function authHeaders(): HeadersInit {
  const token = useAuthStore().token;
  return token ? { Authorization: `Bearer ${token}` } : {};
}

async function handleResponse<T>(res: Response): Promise<T | null> {
  if (!res.ok) {
    console.error(`[API] HTTP ${res.status}: ${res.statusText}`);
    return null;
  }
  try {
    return await res.json();
  } catch {
    return null;
  }
}

// ---------------------------------------------------------------------------
// Field conversion: backend snake_case <-> frontend camelCase
// ---------------------------------------------------------------------------

/** API task response (snake_case) → frontend Task (camelCase) */
export function taskFromApi(raw: Record<string, unknown>): Task {
  return {
    id: raw.id as string,
    title: raw.title as string,
    description: (raw.description as string | null) ?? null,
    completed: Boolean(raw.completed),
    startAt: (raw.start_at as string | null) ?? null,
    dueAt: (raw.due_at as string | null) ?? null,
    priority: (raw.priority as Task["priority"]) ?? 0,
    projectIds: (raw.project_ids as string[]) ?? [],
    tagIds: (raw.tag_ids as string[]) ?? [],
    deletedAt: (raw.deleted_at as string | null) ?? null,
    clientMutationId: (raw.client_mutation_id as string | null) ?? null,
    isImportant: Boolean(raw.is_important),
    repeatRule: (raw.repeat_rule as string | null) ?? (raw.repeat_daily ? "FREQ=DAILY" : null),
    notifyEnabled: Boolean(raw.notify_enabled),
    attachments: (raw.attachments as Task["attachments"]) ?? [],
    parentId: (raw.parent_id as string | null) ?? null,
    sortOrder: (raw.sort_order as number | null) ?? null,
    dependsOn: (raw.depends_on as string[]) ?? [],
    assigneeId: (raw.assignee_id as string | null) ?? null,
    locationReminders: (raw.location_reminders as import("@tasktick/shared").LocationReminder[]) ?? [],
    createdAt: raw.created_at as string,
    updatedAt: raw.updated_at as string,
  };
}

/** Frontend Task (camelCase) → API request body (snake_case) */
function taskToApi(task: Partial<Task>): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  if (task.title !== undefined) out.title = task.title;
  if (task.description !== undefined) out.description = task.description;
  if (task.completed !== undefined) out.completed = task.completed;
  if (task.dueAt !== undefined) out.due_at = task.dueAt;
  if (task.priority !== undefined) out.priority = task.priority;
  if (task.projectIds !== undefined) out.project_ids = task.projectIds;
  if (task.tagIds !== undefined) out.tag_ids = task.tagIds;
  if (task.deletedAt !== undefined) out.deleted_at = task.deletedAt;
  if (task.clientMutationId !== undefined) out.client_mutation_id = task.clientMutationId;
  if (task.isImportant !== undefined) out.is_important = task.isImportant;
  if (task.repeatRule !== undefined) out.repeat_rule = task.repeatRule;
  if (task.notifyEnabled !== undefined) out.notify_enabled = task.notifyEnabled;
  if (task.attachments !== undefined) out.attachments = task.attachments;
  if (task.parentId !== undefined) out.parent_id = task.parentId;
  if (task.sortOrder !== undefined) out.sort_order = task.sortOrder;
  if (task.dependsOn !== undefined) out.depends_on = task.dependsOn;
  if (task.assigneeId !== undefined) out.assignee_id = task.assigneeId;
  return out;
}

/** API project response (snake_case) → frontend Project (camelCase) */
export function projectFromApi(raw: Record<string, unknown>): Project {
  return {
    id: raw.id as string,
    name: raw.name as string,
    color: (raw.color as string | null) ?? null,
    deletedAt: (raw.deleted_at as string | null) ?? null,
    createdAt: raw.created_at as string,
    updatedAt: raw.updated_at as string,
    builtIn: Boolean(raw.built_in),
    teamId: (raw.team_id as string | null) ?? null,
    groupId: (raw.group_id as string | null) ?? null,
    archived: Boolean(raw.archived),
    muted: Boolean(raw.muted),
  };
}

/** API project_group response → frontend ProjectGroup */
export function projectGroupFromApi(raw: Record<string, unknown>): ProjectGroup {
  return {
    id: raw.id as string,
    userId: raw.user_id as string,
    name: raw.name as string,
    color: (raw.color as string | null) ?? null,
    order: (raw.order as number) ?? 0,
    deletedAt: (raw.deleted_at as string | null) ?? null,
    createdAt: raw.created_at as string,
    updatedAt: raw.updated_at as string,
  };
}

/** API tag response (snake_case) → frontend Tag (camelCase) */
export function tagFromApi(raw: Record<string, unknown>): Tag {
  return {
    id: raw.id as string,
    name: raw.name as string,
    color: (raw.color as string | null) ?? null,
    deletedAt: (raw.deleted_at as string | null) ?? null,
    createdAt: raw.created_at as string,
    updatedAt: raw.updated_at as string,
    teamId: (raw.team_id as string | null) ?? null,
  };
}

// ---------------------------------------------------------------------------
// Health
// ---------------------------------------------------------------------------

export async function ping(): Promise<boolean> {
  try {
    const res = await fetch(`${BASE}/health`, { headers: authHeaders() });
    return res.ok;
  } catch {
    return false;
  }
}

// ---------------------------------------------------------------------------
// Auth
// ---------------------------------------------------------------------------

export async function login(
  email: string,
  password: string,
): Promise<{ access_token: string; token_type: string; id: string; email: string; username: string; avatar_url: string } | { error: string }> {
  try {
    const res = await fetch(`${BASE}/api/v1/auth/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, password }),
    });
    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      return { error: (body as { detail?: string }).detail ?? "邮箱或密码错误" };
    }
    return await res.json();
  } catch {
    return { error: "网络错误，请检查网络连接" };
  }
}

export async function register(
  email: string,
  username: string,
  password: string,
): Promise<{ id: string; email: string; username: string } | { error: string }> {
  try {
    const res = await fetch(`${BASE}/api/v1/auth/register`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, username, password }),
    });
    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      return { error: (body as { detail?: string }).detail ?? "注册失败，请重试" };
    }
    return await res.json();
  } catch {
    return { error: "网络错误，请检查网络连接" };
  }
}

export async function sendResetCode(email: string): Promise<boolean> {
  try {
    const res = await fetch(`${BASE}/api/v1/auth/send-reset-code`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email }),
    });
    return res.ok;
  } catch {
    return false;
  }
}

export async function resetPassword(email: string, code: string, newPassword: string): Promise<boolean> {
  try {
    const res = await fetch(`${BASE}/api/v1/auth/reset-password`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, code, new_password: newPassword }),
    });
    return res.ok;
  } catch {
    return false;
  }
}

export async function sendVerifyCode(email: string): Promise<boolean> {
  try {
    const res = await fetch(`${BASE}/api/v1/auth/send-verify-code`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email }),
    });
    return res.ok;
  } catch {
    return false;
  }
}

export async function uploadAvatar(file: File): Promise<string | null> {
  try {
    const form = new FormData();
    form.append("file", file);
    const res = await fetch(`${BASE}/api/v1/auth/avatar-upload`, { method: "POST", body: form });
    if (!res.ok) return null;
    const data = await res.json();
    return (data as { avatar_url: string }).avatar_url ?? null;
  } catch {
    return null;
  }
}

export async function registerWithCode(
  email: string,
  code: string,
  password: string,
  username: string,
  avatarUrl?: string,
): Promise<{ id: string; email: string; username: string } | { error: string }> {
  try {
    const res = await fetch(`${BASE}/api/v1/auth/register-with-code`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, code, password, username, avatar_url: avatarUrl ?? "" }),
    });
    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      return { error: (body as { detail?: string }).detail ?? "注册失败，请重试" };
    }
    return await res.json();
  } catch {
    return { error: "网络错误，请检查网络连接" };
  }
}

// ---------------------------------------------------------------------------
// Tasks
// ---------------------------------------------------------------------------

export async function fetchTasks(): Promise<Task[] | null> {
  try {
    const res = await fetch(`${BASE}/api/v1/tasks`, { headers: authHeaders() });
    const data = await handleResponse<Record<string, unknown>[]>(res);
    if (!data) return null;
    return data.map((r) => taskFromApi(r));
  } catch {
    return null;
  }
}

export async function fetchDeletedTasks(): Promise<Task[] | null> {
  try {
    const res = await fetch(`${BASE}/api/v1/tasks/trash`, { headers: authHeaders() });
    const data = await handleResponse<Record<string, unknown>[]>(res);
    if (!data) return null;
    return data.map((r) => taskFromApi(r));
  } catch {
    return null;
  }
}

export async function restoreTask(id: string): Promise<Task | null> {
  try {
    const res = await fetch(`${BASE}/api/v1/tasks/${id}/restore`, {
      method: "POST",
      headers: authHeaders(),
    });
    const data = await handleResponse<Record<string, unknown>>(res);
    if (!data) return null;
    return taskFromApi(data);
  } catch {
    return null;
  }
}

export async function permanentDeleteTask(id: string): Promise<boolean> {
  try {
    const res = await fetch(`${BASE}/api/v1/tasks/${id}/permanent`, {
      method: "DELETE",
      headers: authHeaders(),
    });
    return res.ok;
  } catch {
    return false;
  }
}

export async function createTask(
  payload: Omit<Task, "id" | "createdAt" | "updatedAt">,
): Promise<Task | null> {
  try {
    const res = await fetch(`${BASE}/api/v1/tasks`, {
      method: "POST",
      headers: { ...authHeaders(), "Content-Type": "application/json" },
      body: JSON.stringify(taskToApi(payload)),
    });
    const data = await handleResponse<Record<string, unknown>>(res);
    if (!data) return null;
    return taskFromApi(data);
  } catch {
    return null;
  }
}

export async function updateTask(
  id: string,
  patch: Partial<Omit<Task, "id" | "createdAt">>,
): Promise<Task | null> {
  try {
    const res = await fetch(`${BASE}/api/v1/tasks/${id}`, {
      method: "PATCH",
      headers: { ...authHeaders(), "Content-Type": "application/json" },
      body: JSON.stringify(taskToApi(patch)),
    });
    const data = await handleResponse<Record<string, unknown>>(res);
    if (!data) return null;
    return taskFromApi(data);
  } catch {
    return null;
  }
}

export async function deleteTask(id: string): Promise<boolean> {
  try {
    const res = await fetch(`${BASE}/api/v1/tasks/${id}`, {
      method: "DELETE",
      headers: authHeaders(),
    });
    return res.ok;
  } catch {
    return false;
  }
}

export async function batchDeleteTasks(ids: string[]): Promise<boolean> {
  try {
    const res = await fetch(`${BASE}/api/v1/tasks/batch-delete`, {
      method: "POST",
      headers: { ...authHeaders(), "Content-Type": "application/json" },
      body: JSON.stringify({ task_ids: ids }),
    });
    return res.ok;
  } catch {
    return false;
  }
}

export async function batchUpdateTasks(
  ids: string[],
  patch: {
    project_ids?: string[];
    tag_ids?: string[];
    priority?: number;
    is_important?: boolean;
    completed?: boolean;
  },
): Promise<Task[] | null> {
  try {
    const res = await fetch(`${BASE}/api/v1/tasks/batch`, {
      method: "PATCH",
      headers: { ...authHeaders(), "Content-Type": "application/json" },
      body: JSON.stringify({ task_ids: ids, ...patch }),
    });
    const data = await handleResponse<Record<string, unknown>[]>(res);
    if (!data) return null;
    return data.map((r) => taskFromApi(r));
  } catch {
    return null;
  }
}

// ---------------------------------------------------------------------------
// Projects
// ---------------------------------------------------------------------------

export async function fetchProjects(): Promise<Project[] | null> {
  try {
    const res = await fetch(`${BASE}/api/v1/projects`, { headers: authHeaders() });
    const data = await handleResponse<Record<string, unknown>[]>(res);
    if (!data) return null;
    return data.map((r) => projectFromApi(r));
  } catch {
    return null;
  }
}

export async function createProject(
  payload: Pick<Project, "name" | "color" | "teamId">,
): Promise<Project | null> {
  try {
    const res = await fetch(`${BASE}/api/v1/projects`, {
      method: "POST",
      headers: { ...authHeaders(), "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    const data = await handleResponse<Record<string, unknown>>(res);
    if (!data) return null;
    return projectFromApi(data);
  } catch {
    return null;
  }
}

export async function updateProject(
  id: string,
  patch: Partial<Pick<Project, "name" | "color" | "teamId">>,
): Promise<Project | null> {
  try {
    const res = await fetch(`${BASE}/api/v1/projects/${id}`, {
      method: "PATCH",
      headers: { ...authHeaders(), "Content-Type": "application/json" },
      body: JSON.stringify(patch),
    });
    const data = await handleResponse<Record<string, unknown>>(res);
    if (!data) return null;
    return projectFromApi(data);
  } catch {
    return null;
  }
}

export async function deleteProject(id: string): Promise<boolean> {
  try {
    const res = await fetch(`${BASE}/api/v1/projects/${id}`, {
      method: "DELETE",
      headers: authHeaders(),
    });
    return res.ok;
  } catch {
    return false;
  }
}

// ---------------------------------------------------------------------------
// Tags
// ---------------------------------------------------------------------------

export async function fetchTags(): Promise<Tag[] | null> {
  try {
    const res = await fetch(`${BASE}/api/v1/tags`, { headers: authHeaders() });
    const data = await handleResponse<Record<string, unknown>[]>(res);
    if (!data) return null;
    return data.map((r) => tagFromApi(r));
  } catch {
    return null;
  }
}

export async function createTag(
  payload: Pick<Tag, "name" | "color" | "teamId">,
): Promise<Tag | null> {
  try {
    const res = await fetch(`${BASE}/api/v1/tags`, {
      method: "POST",
      headers: { ...authHeaders(), "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    const data = await handleResponse<Record<string, unknown>>(res);
    if (!data) return null;
    return tagFromApi(data);
  } catch {
    return null;
  }
}

export async function updateTag(
  id: string,
  patch: Partial<Pick<Tag, "name" | "color" | "teamId">>,
): Promise<Tag | null> {
  try {
    const res = await fetch(`${BASE}/api/v1/tags/${id}`, {
      method: "PATCH",
      headers: { ...authHeaders(), "Content-Type": "application/json" },
      body: JSON.stringify(patch),
    });
    const data = await handleResponse<Record<string, unknown>>(res);
    if (!data) return null;
    return tagFromApi(data);
  } catch {
    return null;
  }
}

export async function deleteTag(id: string): Promise<boolean> {
  try {
    const res = await fetch(`${BASE}/api/v1/tags/${id}`, {
      method: "DELETE",
      headers: authHeaders(),
    });
    return res.ok;
  } catch {
    return false;
  }
}

// ---------------------------------------------------------------------------
// Sync push / pull
// ---------------------------------------------------------------------------

export interface SyncPushPayload {
  deviceId: string;
  mutations: Array<{
    entityType: "task" | "project" | "tag" | "note" | "project_group";
    entityId: string;
    clientMutationId: string;
    op: "upsert" | "delete";
    payload: Record<string, unknown> | null;
    clientUpdatedAt: string;
  }>;
}

export interface SyncPullResponse {
  nextCursor: string | null;
  tasks: Task[];
  projects: Project[];
  tags: Tag[];
  notes?: Note[];
  projectGroups?: ProjectGroup[];
}

export async function syncPush(payload: SyncPushPayload): Promise<boolean> {
  try {
    const res = await fetch(`${BASE}/api/v1/sync/push`, {
      method: "POST",
      headers: { ...authHeaders(), "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    return res.ok;
  } catch {
    return false;
  }
}

export async function exportIcal(startDate?: string, endDate?: string): Promise<void> {
  const params = new URLSearchParams();
  if (startDate) params.set("start_date", startDate);
  if (endDate) params.set("end_date", endDate);
  const url = `${BASE}/api/v1/sync/export-ical${params.size ? `?${params}` : ""}`;
  const res = await fetch(url, { headers: authHeaders() });
  if (!res.ok) throw new Error("导出失败");
  const blob = await res.blob();
  const blobUrl = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = blobUrl;
  a.download = `tasktick-${new Date().toISOString().slice(0, 10)}.ics`;
  a.click();
  URL.revokeObjectURL(blobUrl);
}

export async function syncPull(
  since: string | null,
): Promise<SyncPullResponse | null> {
  try {
    const url = since ? `${BASE}/api/v1/sync/pull?since=${encodeURIComponent(since)}` : `${BASE}/api/v1/sync/pull`;
    const res = await fetch(url, { headers: authHeaders() });
    const data = await handleResponse<{
      nextCursor: string | null;
      tasks: Record<string, unknown>[];
      projects: Record<string, unknown>[];
      tags: Record<string, unknown>[];
      notes?: Record<string, unknown>[];
      projectGroups?: Record<string, unknown>[];
    }>(res);
    if (!data) return null;
    return {
      nextCursor: data.nextCursor,
      tasks: data.tasks.map((t) => taskFromApi(t)),
      projects: data.projects.map((p) => projectFromApi(p)),
      tags: data.tags.map((t) => tagFromApi(t)),
      notes: data.notes?.map((n) => noteFromApi(n)),
      projectGroups: data.projectGroups?.map((g) => projectGroupFromApi(g)),
    };
  } catch {
    return null;
  }
}

// ---------------------------------------------------------------------------
// File upload (MinIO)
// ---------------------------------------------------------------------------

export async function uploadFile(file: File): Promise<{ objectKey: string } | null> {
  try {
    const form = new FormData();
    form.append("file", file);
    const res = await fetch(`${BASE}/api/v1/ai/files/upload`, {
      method: "POST",
      headers: authHeaders(),
      body: form,
    });
    const data = await handleResponse<{ object_key: string }>(res);
    return data ? { objectKey: data.object_key } : null;
  } catch {
    return null;
  }
}

export async function getMe(): Promise<{ id: string; email: string; username: string; avatar_url: string } | null> {
  try {
    const res = await fetch(`${BASE}/api/v1/auth/me`, { headers: authHeaders() });
    if (!res.ok) return null;
    return await res.json();
  } catch {
    return null;
  }
}

export async function changeAvatar(avatarUrl: string): Promise<{ id: string; email: string; username: string; avatar_url: string } | null> {
  try {
    const res = await fetch(`${BASE}/api/v1/auth/avatar`, {
      method: "PUT",
      headers: { ...authHeaders(), "Content-Type": "application/json" },
      body: JSON.stringify({ avatar_url: avatarUrl }),
    });
    if (!res.ok) return null;
    return await res.json();
  } catch {
    return null;
  }
}

export async function getFilePresignUrl(objectKey: string): Promise<string | null> {
  try {
    const res = await fetch(
      `${BASE}/api/v1/ai/files/presign?object_key=${encodeURIComponent(objectKey)}`,
      { headers: authHeaders() },
    );
    const data = await handleResponse<{ url: string }>(res);
    return data?.url ?? null;
  } catch {
    return null;
  }
}

// ---------------------------------------------------------------------------
// Settings
// ---------------------------------------------------------------------------

export async function changeUsername(username: string): Promise<{ id: string; email: string; username: string } | null> {
  try {
    const res = await fetch(`${BASE}/api/v1/auth/username`, {
      method: "PUT",
      headers: { ...authHeaders(), "Content-Type": "application/json" },
      body: JSON.stringify({ username }),
    });
    if (!res.ok) return null;
    return await res.json();
  } catch {
    return null;
  }
}

export async function changePassword(oldPassword: string, newPassword: string): Promise<boolean> {
  try {
    const res = await fetch(`${BASE}/api/v1/auth/password`, {
      method: "PUT",
      headers: { ...authHeaders(), "Content-Type": "application/json" },
      body: JSON.stringify({ old_password: oldPassword, new_password: newPassword }),
    });
    return res.ok;
  } catch {
    return false;
  }
}

// ---------------------------------------------------------------------------
// Teams
// ---------------------------------------------------------------------------

export async function fetchTeams(): Promise<Team[] | null> {
  try {
    const res = await fetch(`${BASE}/api/v1/teams`, { headers: authHeaders() });
    const data = await handleResponse<Record<string, unknown>[]>(res);
    if (!data) return null;
    return data.map((r) => ({
      id: r.id as string,
      name: r.name as string,
      ownerUserId: r.owner_user_id as string,
      createdAt: r.created_at as string,
      updatedAt: r.updated_at as string,
    }));
  } catch {
    return null;
  }
}

export async function createTeam(payload: { name: string }): Promise<Team | null> {
  try {
    const res = await fetch(`${BASE}/api/v1/teams`, {
      method: "POST",
      headers: { ...authHeaders(), "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    const data = await handleResponse<Record<string, unknown>>(res);
    if (!data) return null;
    return {
      id: data.id as string,
      name: data.name as string,
      ownerUserId: data.owner_user_id as string,
      createdAt: data.created_at as string,
      updatedAt: data.updated_at as string,
    };
  } catch {
    return null;
  }
}

export async function getTeam(teamId: string): Promise<Team | null> {
  try {
    const res = await fetch(`${BASE}/api/v1/teams/${teamId}`, { headers: authHeaders() });
    const data = await handleResponse<Record<string, unknown>>(res);
    if (!data) return null;
    return {
      id: data.id as string,
      name: data.name as string,
      ownerUserId: data.owner_user_id as string,
      createdAt: data.created_at as string,
      updatedAt: data.updated_at as string,
    };
  } catch {
    return null;
  }
}

export async function updateTeam(teamId: string, payload: { name: string }): Promise<Team | null> {
  try {
    const res = await fetch(`${BASE}/api/v1/teams/${teamId}`, {
      method: "PATCH",
      headers: { ...authHeaders(), "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    const data = await handleResponse<Record<string, unknown>>(res);
    if (!data) return null;
    return {
      id: data.id as string,
      name: data.name as string,
      ownerUserId: data.owner_user_id as string,
      createdAt: data.created_at as string,
      updatedAt: data.updated_at as string,
    };
  } catch {
    return null;
  }
}

export async function deleteTeam(teamId: string): Promise<boolean> {
  try {
    const res = await fetch(`${BASE}/api/v1/teams/${teamId}`, {
      method: "DELETE",
      headers: authHeaders(),
    });
    return res.ok;
  } catch {
    return false;
  }
}

export async function fetchTeamMembers(teamId: string): Promise<TeamMember[] | null> {
  try {
    const res = await fetch(`${BASE}/api/v1/teams/${teamId}/members`, { headers: authHeaders() });
    const data = await handleResponse<Record<string, unknown>[]>(res);
    if (!data) return null;
    return data.map((r) => ({
      id: r.id as string,
      teamId: r.team_id as string,
      userId: r.user_id as string,
      role: r.role as TeamMember["role"],
      joinedAt: r.joined_at as string,
      userEmail: r.user_email as string | undefined,
      userUsername: r.user_username as string | undefined,
      userAvatarUrl: r.user_avatar_url as string | undefined,
    }));
  } catch {
    return null;
  }
}

export async function inviteTeamMember(
  teamId: string,
  payload: { email: string; role: string },
): Promise<boolean> {
  try {
    const res = await fetch(`${BASE}/api/v1/teams/${teamId}/invite`, {
      method: "POST",
      headers: { ...authHeaders(), "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    return res.ok;
  } catch {
    return false;
  }
}

export async function updateTeamMember(
  teamId: string,
  targetUserId: string,
  payload: { role: string },
): Promise<boolean> {
  try {
    const res = await fetch(`${BASE}/api/v1/teams/${teamId}/members/${targetUserId}`, {
      method: "PATCH",
      headers: { ...authHeaders(), "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    return res.ok;
  } catch {
    return false;
  }
}

export async function removeTeamMember(teamId: string, targetUserId: string): Promise<boolean> {
  try {
    const res = await fetch(`${BASE}/api/v1/teams/${teamId}/members/${targetUserId}`, {
      method: "DELETE",
      headers: authHeaders(),
    });
    return res.ok;
  } catch {
    return false;
  }
}

export async function transferTeamOwnership(teamId: string, targetUserId: string): Promise<boolean> {
  try {
    const res = await fetch(`${BASE}/api/v1/teams/${teamId}/transfer-ownership`, {
      method: "POST",
      headers: { ...authHeaders(), "Content-Type": "application/json" },
      body: JSON.stringify({ target_user_id: targetUserId }),
    });
    return res.ok;
  } catch {
    return false;
  }
}

export async function fetchTeamProjects(teamId: string): Promise<Project[] | null> {
  try {
    const res = await fetch(`${BASE}/api/v1/teams/${teamId}/projects`, { headers: authHeaders() });
    const data = await handleResponse<Record<string, unknown>[]>(res);
    if (!data) return null;
    return data.map((r) => projectFromApi(r));
  } catch {
    return null;
  }
}

export async function fetchTeamTags(teamId: string): Promise<Tag[] | null> {
  try {
    const res = await fetch(`${BASE}/api/v1/teams/${teamId}/tags`, { headers: authHeaders() });
    const data = await handleResponse<Record<string, unknown>[]>(res);
    if (!data) return null;
    return data.map((r) => tagFromApi(r));
  } catch {
    return null;
  }
}

// ---------------------------------------------------------------------------
// Schedules
// ---------------------------------------------------------------------------

export function scheduleFromApi(raw: Record<string, unknown>): Schedule {
  return {
    id: raw.id as string,
    title: raw.title as string,
    description: (raw.description as string | null) ?? null,
    startAt: raw.start_at as string,
    endAt: (raw.end_at as string | null) ?? null,
    timezone: (raw.timezone as string) ?? "UTC",
    location: (raw.location as string | null) ?? null,
    createdAt: raw.created_at as string,
    updatedAt: raw.updated_at as string,
  };
}

export async function fetchSchedules(from?: string, to?: string): Promise<Schedule[] | null> {
  try {
    let url = `${BASE}/api/v1/schedules`;
    const params: string[] = [];
    if (from) params.push(`from=${encodeURIComponent(from)}`);
    if (to) params.push(`to=${encodeURIComponent(to)}`);
    if (params.length > 0) url += `?${params.join("&")}`;
    const res = await fetch(url, { headers: authHeaders() });
    const data = await handleResponse<Record<string, unknown>[]>(res);
    if (!data) return null;
    return data.map((r) => scheduleFromApi(r));
  } catch {
    return null;
  }
}

export async function createSchedule(payload: {
  title: string;
  description?: string | null;
  start_at: string;
  end_at?: string | null;
  timezone?: string;
  location?: string | null;
}): Promise<Schedule | null> {
  try {
    const res = await fetch(`${BASE}/api/v1/schedules`, {
      method: "POST",
      headers: { ...authHeaders(), "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    const data = await handleResponse<Record<string, unknown>>(res);
    if (!data) return null;
    return scheduleFromApi(data);
  } catch {
    return null;
  }
}

export async function updateSchedule(
  id: string,
  patch: Partial<{
    title: string;
    description: string | null;
    start_at: string;
    end_at: string | null;
    timezone: string;
    location: string | null;
  }>,
): Promise<Schedule | null> {
  try {
    const res = await fetch(`${BASE}/api/v1/schedules/${id}`, {
      method: "PATCH",
      headers: { ...authHeaders(), "Content-Type": "application/json" },
      body: JSON.stringify(patch),
    });
    const data = await handleResponse<Record<string, unknown>>(res);
    if (!data) return null;
    return scheduleFromApi(data);
  } catch {
    return null;
  }
}

export async function deleteSchedule(id: string): Promise<boolean> {
  try {
    const res = await fetch(`${BASE}/api/v1/schedules/${id}`, {
      method: "DELETE",
      headers: authHeaders(),
    });
    return res.ok;
  } catch {
    return false;
  }
}

// ---------------------------------------------------------------------------
// Pomodoro
// ---------------------------------------------------------------------------

export interface PomodoroStats {
  totalSessions: number;
  totalMinutes: number;
  todaySessions: number;
  todayMinutes: number;
  weekSessions: number;
  weekMinutes: number;
}

export function pomodoroFromApi(raw: Record<string, unknown>): PomodoroSession {
  return {
    id: raw.id as string,
    taskId: (raw.task_id as string | null) ?? null,
    startedAt: raw.started_at as string,
    endedAt: (raw.ended_at as string | null) ?? null,
    durationMinutes: (raw.duration_minutes as number) ?? 25,
    completed: Boolean(raw.completed),
    createdAt: raw.created_at as string,
    updatedAt: raw.updated_at as string,
  };
}

export async function fetchPomodoros(filters?: {
  taskId?: string;
  from?: string;
  to?: string;
}): Promise<PomodoroSession[] | null> {
  try {
    let url = `${BASE}/api/v1/pomodoros`;
    const params: string[] = [];
    if (filters?.taskId) params.push(`task_id=${encodeURIComponent(filters.taskId)}`);
    if (filters?.from) params.push(`from=${encodeURIComponent(filters.from)}`);
    if (filters?.to) params.push(`to=${encodeURIComponent(filters.to)}`);
    if (params.length > 0) url += `?${params.join("&")}`;
    const res = await fetch(url, { headers: authHeaders() });
    const data = await handleResponse<Record<string, unknown>[]>(res);
    if (!data) return null;
    return data.map((r) => pomodoroFromApi(r));
  } catch {
    return null;
  }
}

export async function createPomodoro(payload: {
  task_id?: string | null;
  started_at: string;
  duration_minutes?: number;
}): Promise<PomodoroSession | null> {
  try {
    const res = await fetch(`${BASE}/api/v1/pomodoros`, {
      method: "POST",
      headers: { ...authHeaders(), "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    const data = await handleResponse<Record<string, unknown>>(res);
    if (!data) return null;
    return pomodoroFromApi(data);
  } catch {
    return null;
  }
}

export async function updatePomodoro(
  id: string,
  patch: Partial<{
    ended_at: string | null;
    duration_minutes: number;
    completed: boolean;
  }>,
): Promise<PomodoroSession | null> {
  try {
    const res = await fetch(`${BASE}/api/v1/pomodoros/${id}`, {
      method: "PATCH",
      headers: { ...authHeaders(), "Content-Type": "application/json" },
      body: JSON.stringify(patch),
    });
    const data = await handleResponse<Record<string, unknown>>(res);
    if (!data) return null;
    return pomodoroFromApi(data);
  } catch {
    return null;
  }
}

export async function deletePomodoro(id: string): Promise<boolean> {
  try {
    const res = await fetch(`${BASE}/api/v1/pomodoros/${id}`, {
      method: "DELETE",
      headers: authHeaders(),
    });
    return res.ok;
  } catch {
    return false;
  }
}

export async function fetchPomodoroStats(): Promise<PomodoroStats | null> {
  try {
    const res = await fetch(`${BASE}/api/v1/pomodoros/stats`, { headers: authHeaders() });
    const data = await handleResponse<Record<string, unknown>>(res);
    if (!data) return null;
    return {
      totalSessions: (data.total_sessions as number) ?? 0,
      totalMinutes: (data.total_minutes as number) ?? 0,
      todaySessions: (data.today_sessions as number) ?? 0,
      todayMinutes: (data.today_minutes as number) ?? 0,
      weekSessions: (data.week_sessions as number) ?? 0,
      weekMinutes: (data.week_minutes as number) ?? 0,
    };
  } catch {
    return null;
  }
}

// ---------------------------------------------------------------------------
// Notes
// ---------------------------------------------------------------------------

export function noteFromApi(raw: Record<string, unknown>): Note {
  return {
    id: raw.id as string,
    userId: raw.user_id as string,
    title: raw.title as string,
    content: (raw.content as string | null) ?? null,
    isMarkdown: Boolean(raw.is_markdown),
    deletedAt: (raw.deleted_at as string | null) ?? null,
    createdAt: raw.created_at as string,
    updatedAt: raw.updated_at as string,
  };
}

export async function fetchNotes(): Promise<Note[] | null> {
  try {
    const res = await fetch(`${BASE}/api/v1/notes`, { headers: authHeaders() });
    const data = await handleResponse<Record<string, unknown>[]>(res);
    if (!data) return null;
    return data.map((r) => noteFromApi(r));
  } catch {
    return null;
  }
}

export async function createNote(payload: {
  title: string;
  content?: string | null;
  is_markdown?: boolean;
}): Promise<Note | null> {
  try {
    const res = await fetch(`${BASE}/api/v1/notes`, {
      method: "POST",
      headers: { ...authHeaders(), "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    const data = await handleResponse<Record<string, unknown>>(res);
    if (!data) return null;
    return noteFromApi(data);
  } catch {
    return null;
  }
}

export async function updateNote(
  id: string,
  patch: Partial<{ title: string | null; content: string | null; is_markdown: boolean | null }>,
): Promise<Note | null> {
  try {
    const res = await fetch(`${BASE}/api/v1/notes/${id}`, {
      method: "PATCH",
      headers: { ...authHeaders(), "Content-Type": "application/json" },
      body: JSON.stringify(patch),
    });
    const data = await handleResponse<Record<string, unknown>>(res);
    if (!data) return null;
    return noteFromApi(data);
  } catch {
    return null;
  }
}

export async function deleteNote(id: string): Promise<boolean> {
  try {
    const res = await fetch(`${BASE}/api/v1/notes/${id}`, {
      method: "DELETE",
      headers: authHeaders(),
    });
    return res.ok;
  } catch {
    return false;
  }
}

// ---------------------------------------------------------------------------
// Smart Lists
// ---------------------------------------------------------------------------

export function smartListFromApi(raw: Record<string, unknown>): import("@tasktick/shared").SmartList {
  return {
    id: raw.id as string,
    name: raw.name as string,
    color: (raw.color as string | null) ?? null,
    filter: (raw.filter as import("@tasktick/shared").SmartListFilter) ?? {},
    createdAt: raw.created_at as string,
    updatedAt: raw.updated_at as string,
  };
}

export async function fetchSmartLists(): Promise<import("@tasktick/shared").SmartList[] | null> {
  try {
    const res = await fetch(`${BASE}/api/v1/smart-lists`, { headers: authHeaders() });
    const data = await handleResponse<Record<string, unknown>[]>(res);
    if (!data) return null;
    return data.map((r) => smartListFromApi(r));
  } catch {
    return null;
  }
}

export async function createSmartList(
  payload: { name: string; color?: string | null; filter?: import("@tasktick/shared").SmartListFilter },
): Promise<import("@tasktick/shared").SmartList | null> {
  try {
    const res = await fetch(`${BASE}/api/v1/smart-lists`, {
      method: "POST",
      headers: { ...authHeaders(), "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    const data = await handleResponse<Record<string, unknown>>(res);
    if (!data) return null;
    return smartListFromApi(data);
  } catch {
    return null;
  }
}

export async function updateSmartList(
  id: string,
  patch: { name?: string; color?: string | null; filter?: import("@tasktick/shared").SmartListFilter },
): Promise<import("@tasktick/shared").SmartList | null> {
  try {
    const res = await fetch(`${BASE}/api/v1/smart-lists/${id}`, {
      method: "PATCH",
      headers: { ...authHeaders(), "Content-Type": "application/json" },
      body: JSON.stringify(patch),
    });
    const data = await handleResponse<Record<string, unknown>>(res);
    if (!data) return null;
    return smartListFromApi(data);
  } catch {
    return null;
  }
}

export async function deleteSmartList(id: string): Promise<boolean> {
  try {
    const res = await fetch(`${BASE}/api/v1/smart-lists/${id}`, {
      method: "DELETE",
      headers: authHeaders(),
    });
    return res.ok;
  } catch {
    return false;
  }
}

// ---------------------------------------------------------------------------
// Location Reminders
// ---------------------------------------------------------------------------

export function locationReminderFromApi(
  raw: Record<string, unknown>,
): import("@tasktick/shared").LocationReminder {
  return {
    id: raw.id as string,
    taskId: raw.task_id as string,
    locationName: raw.location_name as string,
    latitude: raw.latitude as number,
    longitude: raw.longitude as number,
    radius: (raw.radius as number) ?? 100,
    reminderType: (raw.reminder_type as "arrival" | "departure") ?? "arrival",
    enabled: Boolean(raw.enabled),
    createdAt: raw.created_at as string,
  };
}

export async function fetchLocationReminders(): Promise<
  import("@tasktick/shared").LocationReminder[] | null
> {
  try {
    const res = await fetch(`${BASE}/api/v1/location-reminders`, { headers: authHeaders() });
    const data = await handleResponse<Record<string, unknown>[]>(res);
    if (!data) return null;
    return data.map((r) => locationReminderFromApi(r));
  } catch {
    return null;
  }
}

export async function fetchLocationRemindersByTask(
  taskId: string,
): Promise<import("@tasktick/shared").LocationReminder[] | null> {
  try {
    const res = await fetch(`${BASE}/api/v1/location-reminders/by-task/${taskId}`, {
      headers: authHeaders(),
    });
    const data = await handleResponse<Record<string, unknown>[]>(res);
    if (!data) return null;
    return data.map((r) => locationReminderFromApi(r));
  } catch {
    return null;
  }
}

export async function createLocationReminder(payload: {
  task_id: string;
  location_name: string;
  latitude: number | null;
  longitude: number | null;
  radius?: number;
  reminder_type?: "arrival" | "departure";
  enabled?: boolean;
}): Promise<import("@tasktick/shared").LocationReminder | null> {
  try {
    const res = await fetch(`${BASE}/api/v1/location-reminders`, {
      method: "POST",
      headers: { ...authHeaders(), "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    const data = await handleResponse<Record<string, unknown>>(res);
    if (!data) return null;
    return locationReminderFromApi(data);
  } catch {
    return null;
  }
}

export async function updateLocationReminder(
  id: string,
  patch: Partial<{
    location_name: string;
    latitude: number | null;
    longitude: number | null;
    radius: number;
    reminder_type: "arrival" | "departure";
    enabled: boolean;
  }>,
): Promise<import("@tasktick/shared").LocationReminder | null> {
  try {
    const res = await fetch(`${BASE}/api/v1/location-reminders/${id}`, {
      method: "PATCH",
      headers: { ...authHeaders(), "Content-Type": "application/json" },
      body: JSON.stringify(patch),
    });
    const data = await handleResponse<Record<string, unknown>>(res);
    if (!data) return null;
    return locationReminderFromApi(data);
  } catch {
    return null;
  }
}

export async function deleteLocationReminder(id: string): Promise<boolean> {
  try {
    const res = await fetch(`${BASE}/api/v1/location-reminders/${id}`, {
      method: "DELETE",
      headers: authHeaders(),
    });
    return res.ok;
  } catch {
    return false;
  }
}

// ---------------------------------------------------------------------------
// Comments
// ---------------------------------------------------------------------------

export async function fetchComments(taskId: string): Promise<import("@tasktick/shared").Comment[] | null> {
  try {
    const res = await fetch(`${BASE}/api/v1/comments/task/${taskId}`, { headers: authHeaders() });
    const data = await handleResponse<Record<string, unknown>[]>(res);
    if (!data) return null;
    return data.map((r) => ({
      id: r.id as string,
      taskId: r.taskId as string,
      userId: r.userId as string,
      authorName: r.authorName as string,
      content: r.content as string,
      createdAt: r.createdAt as string,
    }));
  } catch {
    return null;
  }
}

export async function createComment(taskId: string, content: string): Promise<import("@tasktick/shared").Comment | null> {
  try {
    const res = await fetch(`${BASE}/api/v1/comments?task_id=${taskId}`, {
      method: "POST",
      headers: { ...authHeaders(), "Content-Type": "application/json" },
      body: JSON.stringify({ content }),
    });
    const data = await handleResponse<Record<string, unknown>>(res);
    if (!data) return null;
    return {
      id: data.id as string,
      taskId: data.taskId as string,
      userId: data.userId as string,
      authorName: data.authorName as string,
      content: data.content as string,
      createdAt: data.createdAt as string,
    };
  } catch {
    return null;
  }
}

export async function deleteComment(commentId: string): Promise<boolean> {
  try {
    const res = await fetch(`${BASE}/api/v1/comments/${commentId}`, {
      method: "DELETE",
      headers: authHeaders(),
    });
    return res.ok;
  } catch {
    return false;
  }
}
