<script setup lang="ts">
import type { Habit, Note, Project, RRuleConfig, Tag, Task, TaskAttachment, TaskPriority } from "@tasktick/shared";
import {
  NButton,
  NCheckbox,
  NCheckboxGroup,
  NDatePicker,
  NDivider,
  NDropdown,
  NForm,
  NFormItem,
  NInput,
  NInputNumber,
  NLayout,
  NLayoutContent,
  NLayoutSider,
  NModal,
  NProgress,
  NRadio,
  NRadioButton,
  NRadioGroup,
  NScrollbar,
  NSelect,
  NSpace,
  NSpin,
  NSwitch,
  NTag,
  NText,
  NUpload,
  useMessage,
} from "naive-ui";
import { storeToRefs } from "pinia";
import { computed, nextTick, onMounted, onUnmounted, ref, watch } from "vue";
import { useVirtualizer } from "@tanstack/vue-virtual";
import { useRouter } from "vue-router";
import { useI18n } from "vue-i18n";
import { marked } from "marked";

import CalendarView from "./CalendarView.vue";
import PomodoroWidget from "../components/PomodoroWidget.vue";
import {
  createLocationReminder,
  deleteLocationReminder,
  fetchLocationRemindersByTask,
  updateLocationReminder,
} from "../api";
import { REMINDER_DISMISS_SESSION_KEY, useAuthStore } from "../stores/auth";
import { taskPinScore, useTaskStore } from "../stores/task";
import { useTagStore, PRESET_COLORS } from "../stores/tag";
import { useHabitStore } from "../stores/habit";
import { useTeamStore } from "../stores/team";
import { usePomodoroStore } from "../stores/pomodoro";
import { useNoteStore } from "../stores/note";
import { useProjectGroupStore } from "../stores/projectGroup";
import { useSmartListStore } from "../stores/smartList";
import { MAX_ATTACHMENT_BYTES, MAX_ATTACHMENTS_PER_TASK, formatFileSize } from "../utils/attachmentLimits";
import { getAttachmentVisual } from "../utils/attachmentVisual";
import { dueCalendarKey, localDateKey } from "../utils/date";
import { getLunarInfo } from "../composables/useLunar";
import { buildRRuleString, isRecurring, parseRRule } from "../utils/rrule";
import { type NaturalTaskDraft, parseNaturalLanguageTask } from "../utils/naturalLanguageTask";
import { notify } from "../utils/electron";
import { readFileAsDataUrl } from "../utils/readFileAsDataUrl";
import { newId } from "../utils/id";
import { useUndoRedo } from "../composables/useUndoRedo";
import { useSubtaskTemplate } from "../composables/useSubtaskTemplate";
import { useComments } from "../composables/useComments";

const message = useMessage();
const router = useRouter();
const { t } = useI18n();
const auth = useAuthStore();
const store = useTaskStore();
const tagStore = useTagStore();
const habitStore = useHabitStore();
const smartListStore = useSmartListStore();
const teamStore = useTeamStore();
const pomodoroStore = usePomodoroStore();
const noteStore = useNoteStore();
const groupStore = useProjectGroupStore();
const { projects, selectedProjectId, searchText, visibleTasks, tasks } = storeToRefs(store);
const { username, email: authEmail } = storeToRefs(auth);
const { activeTags, selectedTagIds } = storeToRefs(tagStore);
const { todayPomodoros } = storeToRefs(pomodoroStore);
const { visibleNotes } = storeToRefs(noteStore);

const { canUndo, canRedo, undo, redo, recordCreate, recordUpdate, recordDelete, recordToggleComplete } = useUndoRedo();
const { templates: subtaskTemplates, saveTemplate, deleteTemplate, parseLines } = useSubtaskTemplate();

const statsData = computed(() => {
  const all = tasks.value.filter((t) => !t.deletedAt);
  const total = all.length;
  const completed = all.filter((t) => t.completed).length;
  const active = total - completed;
  const now = new Date();
  const overdue = all.filter(
    (t) => !t.completed && t.dueAt && new Date(t.dueAt) < now,
  ).length;

  // by priority
  const byPriority: Record<number, number> = {};
  for (const task of all) {
    byPriority[task.priority] = (byPriority[task.priority] || 0) + 1;
  }

  // by project
  const projectCounts: Record<string, { name: string; count: number; color: string | null }> = {};
  for (const task of all) {
    for (const pid of task.projectIds) {
      if (!projectCounts[pid]) {
        const proj = projects.value.find((p) => p.id === pid);
        projectCounts[pid] = { name: proj?.name || t('common.unknown') || "Unknown", count: 0, color: proj?.color ?? null };
      }
      projectCounts[pid].count++;
    }
  }
  const projectStats = Object.values(projectCounts)
    .sort((a, b) => b.count - a.count)
    .map((ps) => ({ ...ps, pct: total > 0 ? Math.round((ps.count / total) * 100) : 0 }));

  return {
    totalTasks: total,
    completedTasks: completed,
    activeTasks: active,
    overdueTasks: overdue,
    completionRate: total > 0 ? Math.round((completed / total) * 100) : 0,
    byPriority,
    projectStats,
  };
});

const habitStatsCompletedThisWeek = computed(() => {
  const now = new Date();
  const dow = now.getDay();
  const monday = new Date(now);
  monday.setDate(now.getDate() - (dow === 0 ? 6 : dow - 1));
  monday.setHours(0, 0, 0, 0);
  return habitStore.habitLogs.filter(
    (l) => new Date(l.completedAt) >= monday,
  ).length;
});

/** Task assignment options (from team members) */
const assigneeOptions = computed(() =>
  teamStore.members.map((m) => ({
    label: m.userUsername || m.userEmail || t('common.unknown') || "Unknown member",
    value: m.id,
  })),
);

/** Heatmap: last 12 weeks of habit completions by day */
const habitHeatmapData = computed(() => {
  const weeks: Array<Array<{ date: string; count: number; dayIndex: number }>> = [];
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  for (let w = 11; w >= 0; w--) {
    const week: Array<{ date: string; count: number; dayIndex: number }> = [];
    const monday = new Date(today);
    monday.setDate(today.getDate() - today.getDay() + 1 + w * 7 - (today.getDay() === 0 ? 6 : 0));
    for (let d = 0; d < 7; d++) {
      const day = new Date(monday);
      day.setDate(monday.getDate() + d);
      if (day > today) {
        week.push({ date: "", count: -1, dayIndex: d });
      } else {
        const dateStr = day.toISOString().slice(0, 10);
        const count = habitStore.habitLogs.filter((l) => l.date === dateStr).length;
        week.push({ date: dateStr, count, dayIndex: d });
      }
    }
    weeks.push(week);
  }
  return weeks;
});

/** Weekly completion counts for last 4 weeks */
const habitWeeklyCounts = computed(() => {
  const weeks: { label: string; count: number }[] = [];
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  for (let w = 3; w >= 0; w--) {
    const weekStart = new Date(today);
    weekStart.setDate(today.getDate() - today.getDay() + 1 + w * 7 - (today.getDay() === 0 ? 6 : 0));
    const weekEnd = new Date(weekStart);
    weekEnd.setDate(weekStart.getDate() + 6);
    const startStr = weekStart.toISOString().slice(0, 10);
    const endStr = weekEnd.toISOString().slice(0, 10);
    const count = habitStore.habitLogs.filter((l) => l.date >= startStr && l.date <= endStr).length;
    const label = `${weekStart.getMonth() + 1}/${weekStart.getDate()}`;
    weeks.push({ label, count });
  }
  return weeks;
});

/** Overall completion rate (last 30 days) */
const habitCompletionRate = computed(() => {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const thirtyDaysAgo = new Date(today);
  thirtyDaysAgo.setDate(today.getDate() - 30);
  const activeHabits = habitStore.activeHabits;
  if (activeHabits.length === 0) return 0;

  let expected = 0;
  let completed = 0;
  for (let i = 0; i < 30; i++) {
    const day = new Date(thirtyDaysAgo);
    day.setDate(thirtyDaysAgo.getDate() + i);
    const dayStr = day.toISOString().slice(0, 10);
    for (const h of activeHabits) {
      if (h.frequency === "daily") {
        expected++;
        if (habitStore.habitLogs.some((l) => l.habitId === h.id && l.date === dayStr)) {
          completed++;
        }
      }
    }
  }
  return expected > 0 ? Math.round((completed / expected) * 100) : 0;
});

const pomodoroCurrentTaskMinutes = computed(() => {
  const today = new Date();
  const y = today.getFullYear();
  const m = String(today.getMonth() + 1).padStart(2, "0");
  const d = String(today.getDate()).padStart(2, "0");
  const todayKey = `${y}-${m}-${d}`;
  return pomodoroStore.sessions
    .filter(
      (s) =>
        s.completed &&
        s.taskId === pomodoroStore.currentTaskId &&
        s.startedAt.startsWith(todayKey),
    )
    .reduce((sum, s) => sum + s.durationMinutes, 0);
});

const pomodoroTaskDisplay = computed(() => {
  if (!pomodoroStore.currentTaskId) return null;
  const task = store.tasks.find((t) => t.id === pomodoroStore.currentTaskId);
  return task?.title ?? null;
});

const showCustomDurationModal = ref(false);
const customDurationVal = ref(30);

function openCustomDuration() {
  customDurationVal.value = pomodoroStore.durationMinutes;
  showCustomDurationModal.value = true;
}

function confirmCustomDuration() {
  const v = customDurationVal.value;
  if (v > 0 && v <= 180) {
    pomodoroStore.setDuration(v);
  }
  showCustomDurationModal.value = false;
}

/** Outer nav: which panel is active */
const NAV_STORAGE_KEY = "tasktick.activeNav";
type NavValue = "list" | "search" | "habits" | "pomodoro" | "stats" | "notes" | "settings" | "trash";
const savedNav = localStorage.getItem(NAV_STORAGE_KEY) as NavValue | null;
const activeNav = ref<NavValue>(savedNav ?? "list");
watch(activeNav, (val: NavValue) => localStorage.setItem(NAV_STORAGE_KEY, val));


/** Sidebar module definitions */
const NAV_MODULE_DEFS = [
  { key: "pomodoro" as const, label: t('pomodoro.title'), icon: "🍅" },
  { key: "stats" as const, label: t('stats.title'), icon: "📊" },
  { key: "list" as const, label: t('nav.all'), icon: "📋" },
  { key: "search" as const, label: t('common.search'), icon: "🔍" },
  { key: "habits" as const, label: t('habit.title'), icon: "🎯" },
  { key: "notes" as const, label: t('note.title'), icon: "📝" },
  { key: "trash" as const, label: t('trash.title'), icon: "🗑️" },
];

/** Navigation modules in persistence order */
const orderedNavItems = computed(() => {
  const order = auth.sidebarModuleOrder ?? ["list", "pomodoro", "stats", "search", "habits", "notes"];
  return [...NAV_MODULE_DEFS].sort(
    (a, b) => order.indexOf(a.key) - order.indexOf(b.key),
  );
});

/** Sidebar module drag state */
const sidebarDragFromIndex = ref<number | null>(null);
const sidebarDragOverIndex = ref<number | null>(null);

function onSidebarModuleDragStart(e: DragEvent, index: number) {
  sidebarDragFromIndex.value = index;
  e.dataTransfer?.setData("text/plain", String(index));
}

function onSidebarModuleDragOver(e: DragEvent, index: number) {
  e.preventDefault();
  sidebarDragOverIndex.value = index;
}

function onSidebarModuleDrop(e: DragEvent, toIndex: number) {
  e.preventDefault();
  const fromIndex = sidebarDragFromIndex.value;
  sidebarDragFromIndex.value = null;
  sidebarDragOverIndex.value = null;
  if (fromIndex === null || fromIndex === toIndex) return;
  const order = [...auth.sidebarModuleOrder];
  const [moved] = order.splice(fromIndex, 1);
  order.splice(toIndex, 0, moved);
  auth.sidebarModuleOrder = order;
  auth.persist();
}

function onSidebarModuleDragEnd() {
  sidebarDragFromIndex.value = null;
  sidebarDragOverIndex.value = null;
}

/** Task sort mode - must be declared before filteredTasks/flatTaskItems (TDZ avoidance) */
const taskSortMode = ref<"manual" | "priority" | "createdAt" | "dueAt" | "title">("manual");

/** Subtask expansion state - must be declared before flatTaskItems (TDZ avoidance) */
const expandedTaskIds = ref<Set<string>>(new Set());
/** Parent task ID for adding subtask */
const addingSubtaskFor = ref<string | null>(null);
/** Input for adding subtask */
const newSubtaskTitleInput = ref("");

/** Search results computed from searchText */
const searchResults = computed(() => {
  const q = searchText.value.trim().toLowerCase();
  if (!q) return [];
  return tasks.value.filter((t) => {
    if (t.deletedAt) return false;
    return (
      t.title.toLowerCase().includes(q) ||
      (t.description?.toLowerCase().includes(q) ?? false)
    );
  });
});

/** Tasks filtered by both project + search + selected tags */
const filteredTasks = computed(() => {
  let result = visibleTasks.value;
  // Filter by selected project
  if (store.selectedProjectId) {
    result = result.filter((t) => t.projectIds?.includes(store.selectedProjectId!));
  }
  if (selectedTagIds.value.length > 0) {
    result = result.filter((t) =>
      (t.tagIds ?? []).some((tid) => selectedTagIds.value.includes(tid)),
    );
  }
  // Sort tasks based on selected mode
  const tk = todayKey.value;
  return [...result].sort((a, b) => {
    // manual mode: sortOrder > taskPinScore > dueAt
    if (taskSortMode.value === "manual") {
      if (a.sortOrder != null && b.sortOrder != null) {
        if (a.sortOrder !== b.sortOrder) return a.sortOrder - b.sortOrder;
      } else if (a.sortOrder != null) {
        return -1;
      } else if (b.sortOrder != null) {
        return 1;
      }
      const pa = taskPinScore(a, tk);
      const pb = taskPinScore(b, tk);
      if (pa !== pb) return pb - pa;
      const da = a.dueAt ? new Date(a.dueAt).getTime() : Number.MAX_SAFE_INTEGER;
      const db = b.dueAt ? new Date(b.dueAt).getTime() : Number.MAX_SAFE_INTEGER;
      return da - db;
    }
    // Priority: high to low
    if (taskSortMode.value === "priority") {
      return (b.priority ?? 0) - (a.priority ?? 0);
    }
    // Created time: newest first
    if (taskSortMode.value === "createdAt") {
      const ta = a.createdAt ? new Date(a.createdAt).getTime() : 0;
      const tb = b.createdAt ? new Date(b.createdAt).getTime() : 0;
      return tb - ta;
    }
    // Due date: earliest first
    if (taskSortMode.value === "dueAt") {
      const da = a.dueAt ? new Date(a.dueAt).getTime() : Number.MAX_SAFE_INTEGER;
      const db = b.dueAt ? new Date(b.dueAt).getTime() : Number.MAX_SAFE_INTEGER;
      return da - db;
    }
    // Title: alphabetical
    if (taskSortMode.value === "title") {
      return (a.title ?? "").localeCompare(b.title ?? "");
    }
    return 0;
  });
});

/** Kanban view: tasks grouped by project */
interface KanbanColumn {
  project: Project;
  tasks: Task[];
  isNoProject?: boolean;
}
const kanbanBoard = computed((): KanbanColumn[] => {
  const cols: KanbanColumn[] = [];
  const noProjectTasks: Task[] = [];
  const taskMap = new Map<string, Task[]>();

  for (const t of filteredTasks.value) {
    if (t.projectIds && t.projectIds.length > 0) {
      for (const pid of t.projectIds) {
        if (!taskMap.has(pid)) taskMap.set(pid, []);
        taskMap.get(pid)!.push(t);
      }
    } else {
      noProjectTasks.push(t);
    }
  }

  for (const [pid, prjTasks] of taskMap) {
    const project = projects.value.find((p) => p.id === pid);
    if (project) {
      cols.push({ project, tasks: [...new Set(prjTasks)] });
    }
  }

  if (noProjectTasks.length > 0) {
    cols.push({
      project: { id: "", name: t('project.noProject') || "No project", color: "#888", deletedAt: null, createdAt: "", updatedAt: "" } as Project,
      tasks: noProjectTasks,
      isNoProject: true,
    });
  }

  return cols;
});

const todayKey = computed(() => localDateKey(new Date()));

/** Flat list: top-level tasks + inline subtasks (only when expanded) */
const flatTaskItems = computed(() => {
  const result: Array<{ task: Task; isSubtask: boolean; expanded: boolean }> = [];
  for (const t of filteredTasks.value) {
    result.push({ task: t, isSubtask: false, expanded: expandedTaskIds.value.has(t.id) });
    if (expandedTaskIds.value.has(t.id)) {
      for (const sub of store.subtasksOf(t.id)) {
        result.push({ task: sub, isSubtask: true, expanded: false });
      }
    }
  }
  return result;
});

/** Virtual list container ref */
const listContainerRef = ref<HTMLElement | null>(null);

/** Virtualizer options ref — wrapped in computed so count stays reactive */
const virtualOptions = computed(() => ({
  count: flatTaskItems.value.length,
  getScrollElement: () => listContainerRef.value,
  estimateSize: () => 88,
  overscan: 8,
}));

const virtualizer = useVirtualizer(virtualOptions);
const virtualRows = computed(() => virtualizer.value.getVirtualItems());

const reminderEntries = computed(() => {
  const tk = todayKey.value;
  const out: { task: Task; kinds: string[] }[] = [];
  for (const tkTask of tasks.value) {
    if (tkTask.deletedAt || tkTask.completed) continue;
    const kinds: string[] = [];
    if (tkTask.isImportant) kinds.push('important');
    const dk = dueCalendarKey(tkTask.dueAt);
    if (isRecurring(tkTask.repeatRule, false) || (dk !== null && dk <= tk)) kinds.push('today');
    if (isRecurring(tkTask.repeatRule, false)) kinds.push('daily');
    if (kinds.length) out.push({ task: tkTask, kinds });
  }
  out.sort((a, b) => taskPinScore(b.task, tk) - taskPinScore(a.task, tk));
  return out;
});

/** Whether creating category */
const isCreatingCategory = ref(false);

/** Role label mapping */
function roleLabel(role: string): string {
  const map: Record<string, string> = {
    owner: t('team.owner'),
    admin: t('team.admin'),
    member: t('team.member'),
    guest: t('team.guest')
  };
  return map[role] ?? role;
}

/** Team dialog state */
const showCreateTeamDialog = ref(false);
const showInviteDialog = ref(false);
const showTeamMembersDialog = ref(false);
const newTeamName = ref("");
const inviteEmail = ref("");
const inviteRole = ref<"admin" | "member" | "guest">("member");
const transferOwnerTarget = ref<string | null>(null);

/** Create dropdown options */
const createDropdownOptions = [
  { label: computed(() => t('task.createForm') || '创建表单'), key: "form" },
  { label: computed(() => t('project.create')), key: "category" },
  { label: computed(() => t('tag.create')), key: "tag" },
];

const showReminderModal = ref(false);

/** Scheduled reminders: taskId -> timerHandle[] */
const scheduledReminders = new Map<string, ReturnType<typeof setTimeout>[]>();

/** Schedule a task's due desktop notification */
function scheduleTaskReminder(task: Task) {
  if (!task.notifyEnabled || task.completed || task.deletedAt) return;
  cancelTaskReminder(task.id);

  const timers: ReturnType<typeof setTimeout>[] = [];

  // 预设提醒（基于截止时间）
  if (task.dueAt && task.reminderSettings?.presets?.length) {
    const dueMs = new Date(task.dueAt).getTime();
    for (const minutes of task.reminderSettings.presets) {
      const reminderMs = dueMs - minutes * 60 * 1000;
      const delay = reminderMs - Date.now();
      if (delay > 0) {
        const handle = setTimeout(async () => {
          const label = formatReminderTimeLabel(minutes);
          await notify(`TaskTick ${t('pomodoro.reminder') || 'Reminder'}（${label}）`, task.title);
        }, delay);
        timers.push(handle);
      }
    }
  }

  // 自定义时间点
  if (task.reminderSettings?.customTimes?.length) {
    for (const timeStr of task.reminderSettings.customTimes) {
      const reminderMs = new Date(timeStr).getTime();
      const delay = reminderMs - Date.now();
      if (delay > 0) {
        const handle = setTimeout(async () => {
          await notify(`TaskTick ${t('pomodoro.customReminder') || 'Custom Reminder'}`, task.title);
        }, delay);
        timers.push(handle);
      }
    }
  }

  if (timers.length > 0) {
    scheduledReminders.set(task.id, timers);
  }
}

/** Format reminder time label */
function formatReminderTimeLabel(minutes: number): string {
  if (minutes < 60) return `${minutes}${t('common.minutes') || 'min'}`;
  if (minutes < 1440) return `${Math.floor(minutes / 60)}${t('common.hours') || 'h'}`;
  return `${Math.floor(minutes / 1440)}${t('common.days') || 'd'}`;
}

/** Cancel all scheduled reminders for a task */
function cancelTaskReminder(taskId: string) {
  const existing = scheduledReminders.get(taskId);
  if (existing) {
    for (const handle of existing) {
      clearTimeout(handle);
    }
    scheduledReminders.delete(taskId);
  }
}

/** Reschedule all reminders based on current task list */
function rescheduleAllReminders() {
  for (const [id] of scheduledReminders) {
    cancelTaskReminder(id);
  }
  for (const t of tasks.value) {
    scheduleTaskReminder(t);
  }
}

function dismissReminder() {
  try {
    sessionStorage.setItem(REMINDER_DISMISS_SESSION_KEY, "1");
  } catch {
    /* ignore */
  }
  showReminderModal.value = false;
}

function openReminderModal() {
  if (reminderEntries.value.length === 0) {
    message.info(t('common.noData') || 'No data');
    return;
  }
  showReminderModal.value = true;
}

/** Handle create dropdown selection */
function handleCreateDropdown(key: string) {
  if (key === "form") {
    openNaturalLanguageCreate();
  } else if (key === "category") {
    isCreatingCategory.value = true;
    selectedProjectId.value = null;
  } else if (key === "tag") {
    showTagManageModal.value = true;
  }
}

/** Submit create category */
async function submitCreateCategory() {
  if (!newCategoryName.value.trim()) return;
  const groupId = projectModalGroupId.value && projectModalGroupId.value !== "__none__"
    ? projectModalGroupId.value
    : null;
  await store.addProject(newCategoryName.value.trim(), undefined, teamStore.activeTeamId, groupId);
  newCategoryName.value = "";
  projectModalGroupId.value = null;
  isCreatingCategory.value = false;
}

/** Cancel create category */
function cancelCreateCategory() {
  isCreatingCategory.value = false;
  newCategoryName.value = "";
  projectModalGroupId.value = null;
}

/** Select team */
async function handleSelectTeam(teamId: string) {
  if (teamStore.activeTeamId === teamId) {
    await teamStore.setActiveTeam(null);
  } else {
    await teamStore.setActiveTeam(teamId);
  }
}

/** Create team */
async function handleCreateTeam() {
  const name = newTeamName.value.trim();
  if (!name) return;
  const team = await teamStore.createTeam(name);
  if (team) {
    message.success(t('team.createSuccess') || 'Team created successfully');
    showCreateTeamDialog.value = false;
    newTeamName.value = "";
  } else {
    message.error(t('team.createFailed') || 'Failed to create team');
  }
}

/** Leave team */
async function handleLeaveTeam() {
  if (!teamStore.activeTeamId) return;
  const ok = await teamStore.leaveTeam(teamStore.activeTeamId);
  if (ok) {
    message.success(t('team.leaveSuccess') || 'Left team successfully');
    await teamStore.setActiveTeam(null);
  } else {
    message.error(t('team.leaveFailed') || 'Failed to leave team');
  }
}

/** Transfer team ownership */
async function handleTransferOwnership() {
  if (!teamStore.activeTeamId || !transferOwnerTarget.value) return;
  const ok = await teamStore.transferOwnership(teamStore.activeTeamId, transferOwnerTarget.value);
  if (ok) {
    message.success(t('team.transferSuccess') || 'Ownership transferred successfully');
    transferOwnerTarget.value = null;
  } else {
    message.error(t('team.transferFailed') || 'Failed to transfer ownership');
  }
}

/** Invite member */
async function handleInviteMember() {
  if (!teamStore.activeTeamId || !inviteEmail.value.trim()) return;
  const ok = await teamStore.inviteMember(teamStore.activeTeamId, inviteEmail.value.trim(), inviteRole.value);
  if (ok) {
    message.success(t('team.inviteSuccess') || 'Invitation sent successfully');
    showInviteDialog.value = false;
    inviteEmail.value = "";
    inviteRole.value = "member";
  } else {
    message.error(t('team.inviteFailed') || 'Failed to send invitation');
  }
}

// Reschedule reminders whenever tasks change (handles sync from server)
let reminderInitDone = false;
watch(
  tasks,
  () => {
    if (reminderInitDone) {
      rescheduleAllReminders();
    }
  },
  { flush: "post" },
);

onMounted(() => {
  reminderInitDone = true;
  rescheduleAllReminders();
  let dismissed = false;
  try {
    dismissed = sessionStorage.getItem(REMINDER_DISMISS_SESSION_KEY) === "1";
  } catch {
    dismissed = false;
  }

  // Fire desktop notifications for important + due-today tasks (if enabled)
  if (auth.desktopNotifyEnabled) {
    const importantTasks = reminderEntries.value.filter((r) => r.kinds.includes(t('task.important') || 'Important') || r.kinds.includes(t('task.dueToday') || 'Due Today'));
    for (const row of importantTasks) {
      const kinds = row.kinds.join(", ");
      void notify("TaskTick Reminder", `${row.task.title} [${kinds}]`);
    }
  }

  if (dismissed || reminderEntries.value.length === 0) return;
  // Schedule all due-time reminders after tasks are loaded
  rescheduleAllReminders();
  void nextTick(() => {
    showReminderModal.value = true;
  });
});

function onKeydown(e: KeyboardEvent) {
  // Ctrl+N / Cmd+N → new task
  if ((e.ctrlKey || e.metaKey) && e.key === "n") {
    e.preventDefault();
    openCreate();
  }
  // Ctrl+Z → undo
  if ((e.ctrlKey || e.metaKey) && !e.shiftKey && e.key === "z") {
    e.preventDefault();
    if (canUndo.value) {
      void undo();
    }
  }
  // Ctrl+Shift+Z / Ctrl+Y → redo
  if ((e.ctrlKey || e.metaKey) && (e.key === "y" || (e.shiftKey && e.key === "z"))) {
    e.preventDefault();
    if (canRedo.value) {
      void redo();
    }
  }
}

window.addEventListener("keydown", onKeydown);

onUnmounted(() => {
  window.removeEventListener("keydown", onKeydown);
});

/** List "today" label: recurring tasks (incomplete) or due today/overdue */
function isDueTodayOrOverdue(task: Task): boolean {
  if (isRecurring(task.repeatRule, false) && !task.completed) return true;
  const dk = dueCalendarKey(task.dueAt);
  return dk !== null && dk <= todayKey.value;
}

function logout() {
  auth.logout();
  void router.replace({ name: "login" });
}

const showModal = ref(false);
const editing = ref<Task | null>(null);

const showPreviewModal = ref(false);
const previewAttachment = ref<TaskAttachment | null>(null);
const previewKind = ref<"image" | "pdf" | "text" | null>(null);
const previewTextLoading = ref(false);
const previewTextContent = ref("");

const formTitle = ref("");
const formDescription = ref("");
const formStart = ref<number | null>(null);
const formDue = ref<number | null>(null);
const formPriority = ref<TaskPriority>(0);
const formIsImportant = ref(false);
const formAssigneeId = ref<string | null>(null);
const formRepeatEnabled = ref(false);
const formRRuleConfig = ref<RRuleConfig>({ freq: "DAILY", interval: 1, endType: "NEVER" });
const formRepeatAdvanced = ref(false);
/** Derived RRULE string from the builder, null when repeat is disabled */
const formRepeatRule = computed<string | null>(() =>
  formRepeatEnabled.value ? buildRRuleString(formRRuleConfig.value) : null,
);

/** Recurring preset quick options */
const REPEAT_PRESETS = [
  { label: computed(() => t('habit.daily')), freq: "DAILY" as const, interval: 1 },
  { label: computed(() => t('habit.weekdays')), freq: "WEEKLY" as const, interval: 1, byweekday: [1, 2, 3, 4, 5] },
  { label: computed(() => t('habit.weekly')), freq: "WEEKLY" as const, interval: 1 },
  { label: computed(() => t('habit.monthly')), freq: "MONTHLY" as const, interval: 1 },
  { label: computed(() => t('habit.yearly')), freq: "YEARLY" as const, interval: 1 },
];

function activePreset(preset: typeof REPEAT_PRESETS[number]): boolean {
  return (
    formRepeatEnabled.value &&
    formRRuleConfig.value.freq === preset.freq &&
    formRRuleConfig.value.interval === preset.interval &&
    JSON.stringify(formRRuleConfig.value.byweekday ?? []) === JSON.stringify(preset.byweekday ?? [])
  );
}

function applyRepeatPreset(preset: typeof REPEAT_PRESETS[number]) {
  formRepeatEnabled.value = true;
  formRRuleConfig.value = {
    freq: preset.freq,
    interval: preset.interval,
    endType: "NEVER",
    byweekday: preset.byweekday ? [...preset.byweekday] : undefined,
  };
  // 如果是工作日且没有设置星期几，则默认选周一到周五
  if (preset.byweekday && (!formRRuleConfig.value.byweekday || formRRuleConfig.value.byweekday.length === 0)) {
    formRRuleConfig.value.byweekday = [...preset.byweekday];
  }
}
const formNotifyEnabled = ref(false);

// 提醒预设选项（分钟）
const REMINDER_PRESETS = [
  { label: computed(() => t('task.reminder5min')), value: 5 },
  { label: computed(() => t('task.reminder15min')), value: 15 },
  { label: computed(() => t('task.reminder30min')), value: 30 },
  { label: computed(() => t('task.reminder1hour')), value: 60 },
  { label: computed(() => t('task.reminder2hours')), value: 120 },
  { label: computed(() => t('task.reminder1day')), value: 1440 },
  { label: computed(() => t('task.reminder2days')), value: 2880 },
];
const formReminderPresets = ref<number[]>([5, 15]);
const formCustomReminderTimes = ref<(string | number)[]>([]);
const showAddReminderTimeModal = ref(false);
const newCustomReminderTime = ref<number | null>(null);

// Habit related
const showAddHabitModal = ref(false);
const editingHabit = ref<Habit | null>(null);
const habitFormName = ref("");
const habitFormFreq = ref<"daily" | "weekly" | "custom">("daily");
const habitFormColor = ref("#18a0ff");
const habitFormWeekDays = ref<number[]>([]);

// Smart List related
const showSmartListModal = ref(false);
const editingSmartList = ref<import("@tasktick/shared").SmartList | null>(null);

// Batch subtask related
const showBatchSubtaskModal = ref(false);
const batchSubtaskParentId = ref<string | null>(null);
const batchSubtaskText = ref("");
const batchSubtaskTemplateName = ref("");

function openBatchSubtaskModal(parentId: string) {
  batchSubtaskParentId.value = parentId;
  batchSubtaskText.value = "";
  batchSubtaskTemplateName.value = "";
  showBatchSubtaskModal.value = true;
}

async function submitBatchSubtasks() {
  const parentId = batchSubtaskParentId.value;
  if (!parentId) return;
  const lines = parseLines(batchSubtaskText.value);
  if (lines.length === 0) return;
  const parent = store.tasks.find((t) => t.id === parentId);
  const projectIds = parent?.projectIds?.length ? parent.projectIds : defaultFormProjectIds();
  for (const title of lines) {
    await store.addTask({ title, projectIds, parentId });
  }
  message.success(t('task.subtasksAdded') || `${lines.length} subtasks added`);
  // Expand parent
  const s = new Set(expandedTaskIds.value);
  s.add(parentId);
  expandedTaskIds.value = s;
  showBatchSubtaskModal.value = false;
}

function applySubtaskTemplate(templateId: string) {
  const t = subtaskTemplates.value.find((t) => t.id === templateId);
  if (t) {
    batchSubtaskText.value = t.items.join("\n");
  }
}

function saveSubtaskTemplateFromText() {
  const lines = parseLines(batchSubtaskText.value);
  if (lines.length === 0) {
    message.warning(t('subtask.enterContent') || 'Please enter subtask content');
    return;
  }
  const name = batchSubtaskTemplateName.value.trim() || `${t('common.template') || 'Template'} ${subtaskTemplates.value.length + 1}`;
  saveTemplate(name, lines);
  batchSubtaskTemplateName.value = "";
  message.success(t('smartlist.templateSaved') || 'Template saved');
}

// Comment composable instance for the edit modal
let commentState: ReturnType<typeof useComments> | null = null;
function getCommentState(taskId: string) {
  if (!commentState || commentState.comments.value[0]?.taskId !== taskId) {
    commentState = useComments(taskId);
  }
  return commentState;
}
function loadCommentsForTask(taskId: string) {
  const cs = getCommentState(taskId);
  void cs.load();
}

const smartListFormName = ref("");
const smartListFormColor = ref("#18a0ff");
const smartListFormBuiltinView = ref<import("@tasktick/shared").BuiltinView | null>(null);
const smartListFormProjectIds = ref<string[]>([]);
const smartListFormTagIds = ref<string[]>([]);
const smartListFormPriorityMin = ref<number | null>(null);
const smartListFormPriorityMax = ref<number | null>(null);
const smartListFormIsImportant = ref(false);
const smartListFormDueFrom = ref<number | null>(null);
const smartListFormDueTo = ref<number | null>(null);
const smartListFormSearchText = ref("");

function openEditSmartList(sl?: import("@tasktick/shared").SmartList) {
  if (sl) {
    editingSmartList.value = sl;
    smartListFormName.value = sl.name;
    smartListFormColor.value = sl.color || "#18a0ff";
    const f = sl.filter;
    smartListFormBuiltinView.value = (f as any)?.builtin_view ?? null;
    smartListFormProjectIds.value = (f as any)?.project_ids ?? [];
    smartListFormTagIds.value = (f as any)?.tag_ids ?? [];
    smartListFormPriorityMin.value = (f as any)?.priority_min ?? null;
    smartListFormPriorityMax.value = (f as any)?.priority_max ?? null;
    smartListFormIsImportant.value = (f as any)?.is_important ?? false;
    smartListFormDueFrom.value = (f as any)?.due_from ? new Date((f as any).due_from).getTime() : null;
    smartListFormDueTo.value = (f as any)?.due_to ? new Date((f as any).due_to).getTime() : null;
    smartListFormSearchText.value = (f as any)?.search_text ?? "";
  } else {
    editingSmartList.value = null;
    smartListFormName.value = "";
    smartListFormColor.value = "#18a0ff";
    smartListFormBuiltinView.value = null;
    smartListFormProjectIds.value = [];
    smartListFormTagIds.value = [];
    smartListFormPriorityMin.value = null;
    smartListFormPriorityMax.value = null;
    smartListFormIsImportant.value = false;
    smartListFormDueFrom.value = null;
    smartListFormDueTo.value = null;
    smartListFormSearchText.value = "";
  }
  showSmartListModal.value = true;
}

async function submitSmartList() {
  const name = smartListFormName.value.trim();
  if (!name) {
    message.warning(t('smartlist.enterSmartListName') || 'Please enter smart list name');
    return;
  }
  const filter: import("@tasktick/shared").SmartListFilter = {};
  if (smartListFormBuiltinView.value) (filter as any).builtin_view = smartListFormBuiltinView.value;
  if (smartListFormProjectIds.value.length > 0) (filter as any).project_ids = smartListFormProjectIds.value;
  if (smartListFormTagIds.value.length > 0) (filter as any).tag_ids = smartListFormTagIds.value;
  if (smartListFormPriorityMin.value !== null) (filter as any).priority_min = smartListFormPriorityMin.value;
  if (smartListFormPriorityMax.value !== null) (filter as any).priority_max = smartListFormPriorityMax.value;
  if (smartListFormIsImportant.value) (filter as any).is_important = true;
  if (smartListFormDueFrom.value !== null) (filter as any).due_from = new Date(smartListFormDueFrom.value).toISOString().split("T")[0];
  if (smartListFormDueTo.value !== null) (filter as any).due_to = new Date(smartListFormDueTo.value).toISOString().split("T")[0];
  if (smartListFormSearchText.value.trim()) (filter as any).search_text = smartListFormSearchText.value.trim();

  if (editingSmartList.value) {
    await smartListStore.updateSmartList(editingSmartList.value.id, {
      name,
      color: smartListFormColor.value,
      filter,
    });
    message.success(t('smartlist.updateSuccess') || 'Updated successfully');
  } else {
    await smartListStore.createSmartList(name, smartListFormColor.value, filter);
    message.success(t('smartlist.createSuccess') || 'Created successfully');
  }
  showSmartListModal.value = false;
}

function frequencyLabel(freq: Habit["frequency"]): string {
  if (freq === "daily") return t('habit.daily');
  if (freq === "weekly") return t('habit.weekly');
  return t('habit.custom') || "自定义";
}

function openEditHabit(habit: Habit) {
  editingHabit.value = habit;
  habitFormName.value = habit.name;
  habitFormFreq.value = habit.frequency;
  habitFormColor.value = habit.color || "#18a0ff";
  habitFormWeekDays.value = habit.weekDays ?? [];
  showAddHabitModal.value = true;
}

async function submitHabit() {
  const name = habitFormName.value.trim();
  if (!name) {
    message.warning(t('habit.enterName') || 'Please enter habit name');
    return;
  }
  if (editingHabit.value) {
    await habitStore.updateHabit(editingHabit.value.id, {
      name,
      frequency: habitFormFreq.value,
      color: habitFormColor.value,
      weekDays: habitFormFreq.value === "weekly" ? habitFormWeekDays.value : undefined,
    });
    message.success(t('common.updateSuccess') || 'Updated successfully');
  } else {
    await habitStore.addHabit(name, habitFormFreq.value, habitFormColor.value);
    message.success(t('common.createSuccess') || 'Created successfully');
  }
  showAddHabitModal.value = false;
}

// Note related
const showNoteModal = ref(false);
const editingNote = ref<Note | null>(null);
const noteFormTitle = ref("");
const noteFormContent = ref("");
const noteFormIsMarkdown = ref(false);
const notePreviewMode = ref(false);

function openCreateNote() {
  editingNote.value = null;
  noteFormTitle.value = "";
  noteFormContent.value = "";
  noteFormIsMarkdown.value = false;
  notePreviewMode.value = false;
  showNoteModal.value = true;
}

function openEditNote(note: Note) {
  editingNote.value = note;
  noteFormTitle.value = note.title;
  noteFormContent.value = note.content ?? "";
  noteFormIsMarkdown.value = note.isMarkdown;
  notePreviewMode.value = false;
  showNoteModal.value = true;
}

async function submitNote() {
  const title = noteFormTitle.value.trim();
  if (!title) {
    message.warning(t('note.enterTitle') || 'Please enter note title');
    return;
  }
  if (editingNote.value) {
    await noteStore.updateNote(editingNote.value.id, {
      title,
      content: noteFormContent.value || null,
      isMarkdown: noteFormIsMarkdown.value,
    });
    message.success(t('common.updateSuccess') || 'Updated successfully');
  } else {
    await noteStore.addNote(title, noteFormContent.value || null, noteFormIsMarkdown.value);
    message.success(t('common.createSuccess') || 'Created successfully');
  }
  showNoteModal.value = false;
}

async function deleteNote(id: string) {
  await noteStore.deleteNote(id);
  message.success(t('common.deleteSuccess') || 'Deleted successfully');
}

function toggleReminderPreset(value: number, checked: boolean) {
  if (checked) {
    formReminderPresets.value = [...formReminderPresets.value, value];
  } else {
    formReminderPresets.value = formReminderPresets.value.filter((v) => v !== value);
  }
}

function removeCustomReminderTime(idx: number) {
  formCustomReminderTimes.value.splice(idx, 1);
}

function formatCustomReminderTime(isoString: string | number): string {
  const d = new Date(isoString);
  const month = d.getMonth() + 1;
  const day = d.getDate();
  const hours = String(d.getHours()).padStart(2, "0");
  const minutes = String(d.getMinutes()).padStart(2, "0");
  return `${month}${t('common.month') || '/'}${day}${t('common.day') || '/'} ${hours}:${minutes}`;
}

function addCustomReminderTime() {
  if (newCustomReminderTime.value && !formCustomReminderTimes.value.includes(newCustomReminderTime.value)) {
    formCustomReminderTimes.value = [...formCustomReminderTimes.value, newCustomReminderTime.value];
  }
  newCustomReminderTime.value = null;
  showAddReminderTimeModal.value = false;
}

const WEEKDAY_OPTIONS = computed(() => [
  t('habit.monFull') || 'Monday',
  t('habit.tueFull') || 'Tuesday',
  t('habit.wedFull') || 'Wednesday',
  t('habit.thuFull') || 'Thursday',
  t('habit.friFull') || 'Friday',
  t('habit.satFull') || 'Saturday',
  t('habit.sunFull') || 'Sunday',
]);
function freqLabel(freq: string): string {
  const map: Record<string, string> = {
    DAILY: t('habit.daily') || 'Daily',
    WEEKLY: t('habit.weekly') || 'Weekly',
    MONTHLY: t('habit.monthly') || 'Monthly',
    YEARLY: t('habit.yearly') || 'Yearly'
  };
  return map[freq] ?? (t('habit.custom') || 'Custom');
}
/** Task's projects (multiple), bound with NSelect multiple */
const formProjectIds = ref<string[]>([]);
/** Task's tags (multiple) */
const formTagIds = ref<string[]>([]);
/** Dependent prerequisite task ID list */
const formDependsOn = ref<string[]>([]);
const formAttachments = ref<TaskAttachment[]>([]);

/** Location reminder editing */
interface EditingLocationReminder {
  id?: string;  // undefined means new
  locationName: string;
  latitude: number | null;
  longitude: number | null;
  radius: number;
  reminderType: "arrival" | "departure";
  enabled: boolean;
}
const formLocationReminders = ref<EditingLocationReminder[]>([]);
const showLocationReminderModal = ref(false);
const editingLocationReminder = ref<EditingLocationReminder>({
  locationName: "",
  latitude: null,
  longitude: null,
  radius: 100,
  reminderType: "arrival",
  enabled: true,
});
const locationReminderError = ref<string | null>(null);

function openAddLocationReminder() {
  editingLocationReminder.value = {
    locationName: "",
    latitude: null,
    longitude: null,
    radius: 100,
    reminderType: "arrival",
    enabled: true,
  };
  locationReminderError.value = null;
  showLocationReminderModal.value = true;
}

function openEditLocationReminder(index: number) {
  editingLocationReminder.value = { ...formLocationReminders.value[index] };
  locationReminderError.value = null;
  showLocationReminderModal.value = true;
}

function removeLocationReminder(index: number) {
  formLocationReminders.value.splice(index, 1);
}

function getCurrentLocation(): Promise<{ latitude: number; longitude: number }> {
  return new Promise((resolve, reject) => {
    if (!navigator.geolocation) {
      reject(new Error(t('location.notSupported') || 'Geolocation is not supported by this browser'));
      return;
    }
    navigator.geolocation.getCurrentPosition(
      (pos) => resolve({ latitude: pos.coords.latitude, longitude: pos.coords.longitude }),
      (err) => {
        let msg = err.message;
        if (err.code === 1) msg = t('location.permissionDenied') || 'Location permission denied, please enable in browser settings';
        else if (err.code === 2) msg = t('location.positionUnavailable') || 'Location position unavailable (GPS not enabled)';
        else if (err.code === 3) msg = t('location.timeout') || 'Location request timed out, please try again';
        reject(new Error(msg));
      },
      { timeout: 15000, maximumAge: 60000 },
    );
  });
}

/** Fallback: IP-based location (less accurate, works without GPS) */
async function getLocationByIP(): Promise<{ latitude: number; longitude: number }> {
  const res = await fetch("https://ipapi.co/json/", { headers: { "Accept-Language": "zh" } });
  if (!res.ok) throw new Error(t('location.ipFailed') || 'IP location failed');
  const data = await res.json();
  if (!data.latitude || !data.longitude) throw new Error(t('location.ipInvalid') || 'IP location result invalid');
  return { latitude: data.latitude, longitude: data.longitude };
}

async function useCurrentLocation() {
  locationReminderError.value = null;
  editingLocationReminder.value.latitude = null;
  editingLocationReminder.value.longitude = null;

  // Try GPS first
  try {
    const pos = await getCurrentLocation();
    editingLocationReminder.value.latitude = pos.latitude;
    editingLocationReminder.value.longitude = pos.longitude;
    await reverseGeocode(pos.latitude, pos.longitude);
    return;
  } catch (gpsErr) {
    console.warn("GPS failed, trying IP fallback:", gpsErr);
  }

  // Fallback to IP-based location
  try {
    const pos = await getLocationByIP();
    editingLocationReminder.value.latitude = pos.latitude;
    editingLocationReminder.value.longitude = pos.longitude;
    await reverseGeocode(pos.latitude, pos.longitude);
    locationReminderError.value = t('location.gpsUnavailable') || 'GPS unavailable, using network location (lower accuracy)';
  } catch (ipErr) {
    locationReminderError.value = t('location.cannotGetLocation') || 'Cannot get location, please enter manually';
  }
}

async function reverseGeocode(lat: number, lon: number): Promise<void> {
  try {
    const res = await fetch(
      `https://nominatim.openstreetmap.org/reverse?format=json&lat=${lat}&lon=${lon}&addressdetails=1`,
      { headers: { "Accept-Language": "zh" } },
    );
    if (res.ok) {
      const data = await res.json();
      const addr = data.address;
      const parts = [
        addr.city || addr.town || addr.village || addr.suburb || addr.county || "",
        addr.road || "",
        addr.house_number || "",
      ].filter(Boolean);
      const name = parts.length > 0 ? parts.join(" ") : data.display_name || "";
      if (name && !editingLocationReminder.value.locationName.trim()) {
        editingLocationReminder.value.locationName = name.slice(0, 100);
      }
    }
  } catch {
    // Reverse geocode failed, user can type manually
  }
}

function saveLocationReminder() {
  if (!editingLocationReminder.value.locationName.trim()) {
    locationReminderError.value = t('location.enterName') || 'Please enter location name';
    return;
  }
  if (!editingLocationReminder.value.latitude || !editingLocationReminder.value.longitude) {
    locationReminderError.value = t('location.getCoords') || 'Please get location coordinates first';
    return;
  }
  // Check if editing existing or new
  const existingIdx = formLocationReminders.value.findIndex(
    (r) => r.id === editingLocationReminder.value.id,
  );
  if (existingIdx >= 0) {
    formLocationReminders.value[existingIdx] = { ...editingLocationReminder.value };
  } else {
    formLocationReminders.value.push({ ...editingLocationReminder.value });
  }
  showLocationReminderModal.value = false;
}

async function syncLocationReminders(taskId: string) {
  const form = formLocationReminders.value;
  const existing = await fetchLocationRemindersByTask(taskId);
  if (!existing) return;
  const existingMap = new Map(existing.map((r) => [r.id, r]));
  const formMap = new Map(form.filter((r) => r.id).map((r) => [r.id!, r]));
  // Delete reminders that were removed in form
  for (const r of existing) {
    if (!formMap.has(r.id)) {
      await deleteLocationReminder(r.id);
    }
  }
  // Create or update reminders
  for (const r of form) {
    if (r.id && existingMap.has(r.id)) {
      // Update existing
      await updateLocationReminder(r.id, {
        location_name: r.locationName,
        latitude: r.latitude,
        longitude: r.longitude,
        radius: r.radius,
        reminder_type: r.reminderType,
        enabled: r.enabled,
      });
    } else if (!r.id) {
      // Create new
      await createLocationReminder({
        task_id: taskId,
        location_name: r.locationName,
        latitude: r.latitude,
        longitude: r.longitude,
        radius: r.radius,
        reminder_type: r.reminderType,
        enabled: r.enabled,
      });
    }
  }
}

/** Local "upload" processing / failure echo (non-server) */
interface PendingAttachment {
  id: string;
  name: string;
  size: number;
  mimeType: string;
  progress: number;
  status: "reading" | "error";
  error?: string;
}

const pendingAttachments = ref<PendingAttachment[]>([]);

/** NUpload instance: used to clear internal fileList, avoid count residue after defaultUpload */
const attachmentUploadRef = ref<{ clear?: () => void } | null>(null);

function clearAttachmentUploadInternal() {
  void nextTick(() => {
    attachmentUploadRef.value?.clear?.();
  });
}

watch(showModal, (open) => {
  if (!open) clearAttachmentUploadInternal();
});

const remainingAttachmentSlots = computed(
  () =>
    Math.max(
      0,
      MAX_ATTACHMENTS_PER_TASK - formAttachments.value.length - pendingAttachments.value.length,
    ),
);

type UploadRequestOptions = {
  file: { id: string; name: string; file?: File | null };
  onProgress: (e: { percent: number }) => void;
  onFinish: () => void;
  onError: () => void;
};

const priorityOptions = computed(() => [
  { label: t('task.priority0'), value: 0 },
  { label: t('task.priority1'), value: 1 },
  { label: t('task.priority2'), value: 2 },
  { label: t('task.priority3'), value: 3 },
]);

const projectSelectOptions = computed(() =>
  projects.value.map((p) => ({
    label: p.name,
    value: p.id,
  })),
);

const tagSelectOptions = computed(() =>
  activeTags.value.map((t) => ({
    label: t.name,
    value: t.id,
    color: t.color,
  })),
);

/** Optional prerequisite task options (exclude self, exclude completed) */
const dependTaskOptions = computed(() =>
  store.tasks
    .filter((t) => !t.deletedAt && t.id !== editing.value?.id && !t.completed)
    .map((t) => ({
      label: t.title,
      value: t.id,
    })),
);

const showNlModal = ref(false);
const nlRaw = ref("");
const quickAddRaw = ref("");

const listEmpty = computed(
  () => !searchText.value.trim() && filteredTasks.value.length === 0,
);

const showCategoryManageModal = ref(false);
const newCategoryName = ref("");
const showExportCsvModal = ref(false);
const exportCsvProjectIds = ref<string[]>([]);
const exportCsvIncludeCompleted = ref(false);
const exportCsvLoading = ref(false);

const showProjectEditModal = ref(false);
const projectModalName = ref("");
const projectModalEditingId = ref<string | null>(null);
const projectModalArchived = ref(false);
const projectModalMuted = ref(false);
const projectModalGroupId = ref<string | null>(null);
const isCreatingProjectGroup = ref(false);
const newProjectGroupName = ref("");

const showDeleteProjectModal = ref(false);
const pendingDeleteProject = ref<Project | null>(null);

const pendingDeleteGroup = ref<{ groupId: string; groupName: string } | null>(null);
const showDeleteGroupModal = ref(false);

function toggleExpand(taskId: string) {
  const s = new Set(expandedTaskIds.value);
  if (s.has(taskId)) s.delete(taskId);
  else s.add(taskId);
  expandedTaskIds.value = s;
}

function openAddSubtask(task: Task) {
  addingSubtaskFor.value = task.id;
  newSubtaskTitleInput.value = "";
}

async function submitSubtask() {
  const parentId = addingSubtaskFor.value;
  if (!parentId) return;
  const title = newSubtaskTitleInput.value.trim();
  if (!title) return;
  const parent = store.tasks.find(t => t.id === parentId);
  const ids = parent?.projectIds?.length ? parent.projectIds : defaultFormProjectIds();
  await store.addTask({ title, projectIds: ids, parentId });
  newSubtaskTitleInput.value = "";
  addingSubtaskFor.value = null;
  // expand the parent
  const s = new Set(expandedTaskIds.value);
  s.add(parentId);
  expandedTaskIds.value = s;
}

function cancelSubtaskInput() {
  addingSubtaskFor.value = null;
  newSubtaskTitleInput.value = "";
}

/** NSelect @create callback - create category */
function onCreateProject(name: string) {
  return { label: name, value: name };
}

/** NSelect @create callback - create tag */
function onCreateTag(name: string) {
  return { label: name, value: name };
}

/** Tag management */
const showTagManageModal = ref(false);
const newTagName = ref("");
const newTagColor = ref<string | null>(null);
const editingTag = ref<Tag | null>(null);
const editingTagName = ref("");
const editingTagColor = ref<string | null>(null);
const showEditTagModal = ref(false);

/** Calendar view switch */
const viewMode = ref<"list" | "calendar" | "kanban">("list");

function isCustomProject(p: Project): boolean {
  return p.builtIn !== true;
}

const builtinViews = [
  { key: "today" as const, label: t('nav.today'), icon: "📅" },
  { key: "planned" as const, label: t('nav.planned'), icon: "📆" },
  { key: "engaged" as const, label: t('nav.engaged'), icon: "🔥" },
  { key: "next" as const, label: t('nav.next'), icon: "🎯" },
  { key: "all" as const, label: t('nav.all'), icon: "📋" },
  { key: "completed" as const, label: t('nav.completed'), icon: "✅" },
  { key: "inbox" as const, label: t('nav.inbox'), icon: "📥" },
];

const customProjects = computed(() => {
  if (teamStore.activeTeamId) {
    return projects.value.filter((p) => p.builtIn !== true && p.teamId === teamStore.activeTeamId);
  }
  return projects.value.filter((p) => p.builtIn !== true && !p.teamId);
});

/** Sidebar projects grouped by their groupId */
const sidebarProjectGroups = computed(() => {
  const projs = customProjects.value;
  const groups = groupStore.visibleGroups;

  // Projects with no group
  const ungrouped = projs.filter((p) => !p.groupId);

  // Projects grouped — include ALL groups (even empty ones) so newly created groups are visible
  const grouped: { groupId: string; groupName: string; projects: typeof projs }[] = [];
  for (const g of groups) {
    const gp = projs.filter((p) => p.groupId === g.id);
    grouped.push({ groupId: g.id, groupName: g.name, projects: gp });
  }

  return { ungrouped, grouped };
});

/** Which group headers are collapsed in sidebar */
const collapsedGroupIds = ref<Set<string>>(new Set());

const projectGroupOptions = computed(() => [
  { label: t('project.noGroup') || 'No Group', value: "__none__" },
  ...groupStore.visibleGroups.map((g) => ({ label: g.name, value: g.id })),
]);

/** Sidebar tags filtered by current team context */
const sidebarTags = computed(() => {
  if (teamStore.activeTeamId) {
    return activeTags.value.filter((t) => t.teamId === teamStore.activeTeamId);
  }
  return activeTags.value.filter((t) => !t.teamId);
});

const dragManageFromIndex = ref<number | null>(null);
const taskDragFromIndex = ref<number | null>(null);
const taskDragOverIndex = ref<number | null>(null);
const taskDragOverProjectId = ref<string | null>(null);
const taskDragOverGroupId = ref<string | null>(null);
const projectDragFromId = ref<string | null>(null);

/** Batch selection state */
const selectedTaskIds = ref(new Set<string>());

/** Group context menu state (right-click) */
const groupContextMenuGroupId = ref<string | null>(null);
const showGroupContextMenu = ref(false);
const groupContextMenuX = ref(0);
const groupContextMenuY = ref(0);

function onManageDragStart(e: DragEvent, index: number) {
  dragManageFromIndex.value = index;
  projectDragFromId.value = projects.value[index]?.id ?? null;
  e.dataTransfer?.setData("text/plain", String(index));
  if (e.dataTransfer) e.dataTransfer.effectAllowed = "move";
}

function onManageDragEnd() {
  dragManageFromIndex.value = null;
  projectDragFromId.value = null;
}

function onManageDrop(index: number) {
  const from = dragManageFromIndex.value;
  dragManageFromIndex.value = null;
  if (from === null) return;
  store.reorderProjects(from, index);
}

/** Task drag handlers — for manual task reordering */
function onTaskDragStart(e: DragEvent, index: number) {
  taskDragFromIndex.value = index;
  e.dataTransfer?.setData("text/plain", String(index));
  if (e.dataTransfer) e.dataTransfer.effectAllowed = "move";
}

function onTaskDragEnd() {
  taskDragFromIndex.value = null;
  taskDragOverIndex.value = null;
  taskDragOverProjectId.value = null;
  taskDragOverGroupId.value = null;
  projectDragFromId.value = null;
}

function onTaskDragOver(e: DragEvent, index: number) {
  e.preventDefault();
  taskDragOverIndex.value = index;
}

function onTaskDragLeave() {
  taskDragOverIndex.value = null;
}

async function onTaskDrop(index: number) {
  const from = taskDragFromIndex.value;
  taskDragFromIndex.value = null;
  taskDragOverIndex.value = null;
  if (from === null || from === index) return;

  const items = flatTaskItems.value;
  if (from < 0 || from >= items.length || index < 0 || index >= items.length) return;

  const movedItem = items[from]!;
  let beforeItem: (typeof items)[number] | null;
  let afterItem: (typeof items)[number] | null;

  if (from < index) {
    // Dragging downward: place after index (beforeItem = items[index], afterItem = null)
    beforeItem = items[index] ?? null;
    afterItem = null;
  } else {
    // Dragging upward: place before index (beforeItem = items[index - 1], afterItem = items[index])
    beforeItem = index > 0 ? items[index - 1] : null;
    afterItem = items[index] ?? null;
  }

  await store.reorderTask(
    movedItem.task.id,
    beforeItem?.task.id ?? null,
    afterItem?.task.id ?? null,
  );
}

/** Toggle task selection for batch operations */
function toggleTaskSelection(taskId: string, selected: boolean) {
  if (selected) {
    selectedTaskIds.value.add(taskId);
  } else {
    selectedTaskIds.value.delete(taskId);
  }
}

function clearTaskSelection() {
  selectedTaskIds.value.clear();
}

function selectAllVisibleTasks() {
  for (const item of flatTaskItems.value) {
    selectedTaskIds.value.add(item.task.id);
  }
}

/** Batch operations */
async function batchSetCompleted(completed: boolean) {
  const ids = Array.from(selectedTaskIds.value);
  await store.batchUpdateTasks(ids, { completed });
  clearTaskSelection();
}

async function batchMoveToProject(projectId: string) {
  const ids = Array.from(selectedTaskIds.value);
  const projectIds = projectId === "__none__" ? [] : [projectId];
  await store.batchUpdateTasks(ids, { projectIds });
  clearTaskSelection();
}

async function batchSetPriority(priority: TaskPriority) {
  const ids = Array.from(selectedTaskIds.value);
  await store.batchUpdateTasks(ids, { priority });
  clearTaskSelection();
}

async function batchToggleImportant() {
  const ids = Array.from(selectedTaskIds.value);
  // Get current tasks to check their important status
  const tasks = store.tasks.filter(t => selectedTaskIds.value.has(t.id));
  const hasUnimportant = tasks.some(t => !t.isImportant);
  await store.batchUpdateTasks(ids, { isImportant: hasUnimportant });
  clearTaskSelection();
}

async function batchDelete() {
  const ids = Array.from(selectedTaskIds.value);
  await store.batchDeleteTasks(ids);
  clearTaskSelection();
}

/** Drag task onto a project in sidebar — assigns task to that project */
function onProjectDragOver(e: DragEvent, projectId: string) {
  e.preventDefault();
  taskDragOverProjectId.value = projectId;
}

function onProjectDragLeave() {
  taskDragOverProjectId.value = null;
}

function onProjectDragStart(e: DragEvent, projectId: string) {
  projectDragFromId.value = projectId;
  e.dataTransfer?.setData("text/plain", projectId);
  if (e.dataTransfer) e.dataTransfer.effectAllowed = "move";
}

async function onProjectDrop(projectId: string) {
  const fromIdx = taskDragFromIndex.value;
  const fromProjectId = projectDragFromId.value;
  taskDragFromIndex.value = null;
  taskDragOverIndex.value = null;
  taskDragOverProjectId.value = null;
  taskDragOverGroupId.value = null;
  projectDragFromId.value = null;

  // Project drag → move that project to target project's group
  if (fromProjectId) {
    const targetProject = projects.value.find((p) => p.id === projectId);
    if (targetProject) {
      const ok = await store.updateProject(fromProjectId, { groupId: targetProject.groupId });
      if (ok) message.success(t('project.movedToGroup') || 'Moved to group');
    }
    return;
  }

  if (fromIdx === null) return;

  // Task drag → add task to this project
  const items = flatTaskItems.value;
  if (fromIdx < 0 || fromIdx >= items.length) return;

  const task = items[fromIdx]!.task;
  const currentProjectIds = task.projectIds ?? [];
  if (currentProjectIds.includes(projectId)) return;
  await store.updateTask(task.id, { projectIds: [...currentProjectIds, projectId] });
  message.success(t('project.addedToProject') || 'Added to project');
}

function onGroupDragOver(e: DragEvent, groupId: string) {
  e.preventDefault();
  taskDragOverGroupId.value = groupId;
}

function onGroupDragLeave() {
  taskDragOverGroupId.value = null;
}

async function onGroupDrop(groupId: string) {
  const fromIdx = taskDragFromIndex.value;
  const fromProjectId = projectDragFromId.value;
  taskDragFromIndex.value = null;
  taskDragOverIndex.value = null;
  taskDragOverProjectId.value = null;
  taskDragOverGroupId.value = null;
  projectDragFromId.value = null;

  // Project drag → move project to this group
  if (fromProjectId) {
    const ok = await store.updateProject(fromProjectId, { groupId });
    if (ok) message.success(t('project.movedToGroup') || 'Moved to group');
    return;
  }

  if (fromIdx === null) return;

  // Task drag → add task to first project in this group
  const items = flatTaskItems.value;
  if (fromIdx < 0 || fromIdx >= items.length) return;

  const projs = projects.value.filter((p) => p.groupId === groupId);
  if (projs.length === 0) {
    message.warning(t('group.emptyGroup') || 'No projects in this group, please create a project first');
    return;
  }
  const task = items[fromIdx]!.task;
  const currentProjectIds = task.projectIds ?? [];
  const projectId = projs[0]!.id;
  if (currentProjectIds.includes(projectId)) return;
  await store.updateTask(task.id, { projectIds: [...currentProjectIds, projectId] });
  message.success(t('project.addedToProject') || 'Added to project');
}

function openEditProject(p: Project) {
  if (!isCustomProject(p)) return;
  projectModalEditingId.value = p.id;
  projectModalName.value = p.name;
  projectModalArchived.value = p.archived ?? false;
  projectModalMuted.value = p.muted ?? false;
  projectModalGroupId.value = p.groupId ?? "__none__";
  showProjectEditModal.value = true;
}

async function submitProjectEditModal() {
  const n = projectModalName.value.trim();
  if (!n) {
    message.warning(t('project.enterName') || 'Please enter project name');
    return;
  }
  if (!projectModalEditingId.value) return;
  const ok = await store.updateProject(projectModalEditingId.value, {
    name: n,
    archived: projectModalArchived.value,
    muted: projectModalMuted.value,
    groupId: projectModalGroupId.value === "__none__" ? null : projectModalGroupId.value,
  });
  if (!ok) {
    message.error(t('project.renameFailed') || 'Failed to rename (built-in project cannot be renamed)');
    return;
  }
  message.success(t('project.renameSuccess') || 'Project name updated');
  showProjectEditModal.value = false;
}

async function submitNewCategoryInline() {
  const n = newCategoryName.value.trim();
  if (!n) {
    message.warning(t('project.enterNewName') || 'Please enter new project name');
    return;
  }
  const id = await store.addProject(n);
  if (!id) {
    message.error(t('common.saveFailed') || 'Save failed');
    return;
  }
  message.success(t('project.addSuccess') || 'Custom project added');
  newCategoryName.value = "";
}

async function submitCreateProjectGroup() {
  const n = newProjectGroupName.value.trim();
  if (!n) return;
  // addGroup already persists locally and enqueues sync mutation — do not enqueue again
  groupStore.addGroup(n);
  message.success(t('group.createSuccess') || 'Group created');
  newProjectGroupName.value = "";
  isCreatingProjectGroup.value = false;
}

function openExportCsvModal() {
  exportCsvProjectIds.value = [];
  exportCsvIncludeCompleted.value = false;
  showExportCsvModal.value = true;
}

async function doExportCsv() {
  exportCsvLoading.value = true;
  const BASE = import.meta.env.VITE_API_URL ?? "http://127.0.0.1:8000";
  const token = useAuthStore().token;
  try {
    const params = new URLSearchParams();
    for (const pid of exportCsvProjectIds.value) {
      params.append("project_id", pid);
    }
    if (exportCsvIncludeCompleted.value) {
      params.set("include_completed", "true");
    }
    const url = `${BASE}/api/v1/tasks/export-csv${params.toString() ? "?" + params.toString() : ""}`;
    const res = await fetch(url, {
      headers: token ? { Authorization: `Bearer ${token}` } : {},
    });
    if (!res.ok) { message.error(t('export.exportFailed') || 'Export failed'); return; }
    const blob = await res.blob();
    const fileUrl = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = fileUrl;
    a.download = `tasktick-${new Date().toISOString().slice(0, 10)}.csv`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(fileUrl);
    showExportCsvModal.value = false;
    message.success(t('export.exportSuccess') || 'CSV exported successfully');
  } catch {
    message.error(t('export.exportFailed') || 'Export failed');
  } finally {
    exportCsvLoading.value = false;
  }
}

function askDeleteProject(p: Project) {
  pendingDeleteProject.value = p;
  showDeleteProjectModal.value = true;
}

async function confirmDeleteProject() {
  const p = pendingDeleteProject.value;
  if (!p) return;
  const result = await store.deleteProject(p.id);
  if (result !== "ok") {
    const msgs: Record<string, string> = {
      notfound: t('project.notfound') || "Project not found, please refresh the page and try again",
      already: t('project.already') || "This project has already been deleted",
      builtin: t('project.builtIn') || "Built-in project cannot be deleted",
      persist: t('project.persistError') || "Local storage write failed, please check storage space",
    };
    message.error((msgs[result] ?? t('project.deleteFailed')) || "Failed to delete project");
    return;
  }
  message.success(t('project.deleteSuccess') || "Project deleted");
  showDeleteProjectModal.value = false;
  pendingDeleteProject.value = null;
}

function askDeleteGroup(grp: { groupId: string; groupName: string }) {
  pendingDeleteGroup.value = grp;
  showDeleteGroupModal.value = true;
}

function confirmDeleteGroup() {
  if (!pendingDeleteGroup.value) return;
  groupStore.deleteGroup(pendingDeleteGroup.value!.groupId);
  message.success(t('group.deleteSuccess') || 'Group deleted');
  pendingDeleteGroup.value = null;
  showDeleteGroupModal.value = false;
}

function cancelDeleteGroup() {
  pendingDeleteGroup.value = null;
  showDeleteGroupModal.value = false;
}

/** Group right-click context menu */
function onGroupContextMenu(e: MouseEvent, groupId: string) {
  e.preventDefault();
  e.stopPropagation();
  groupContextMenuGroupId.value = groupId;
  groupContextMenuX.value = e.clientX;
  groupContextMenuY.value = e.clientY;
  showGroupContextMenu.value = true;
}

function handleGroupContextMenuSelect(key: string) {
  showGroupContextMenu.value = false;
  if (key === "create_category" && groupContextMenuGroupId.value) {
    isCreatingCategory.value = true;
    projectModalGroupId.value = groupContextMenuGroupId.value;
    newCategoryName.value = "";
  }
}

const groupContextMenuOptions = computed(() => [
  { label: t('group.createCategory') || 'Create Category', key: "create_category" },
]);

/** Tag management helpers */
function openNewTagModal() {
  newTagName.value = "";
  newTagColor.value = PRESET_COLORS[0] ?? null;
}

async function submitNewTag() {
  const n = newTagName.value.trim();
  if (!n) {
    message.warning(t('tag.enterName') || 'Please enter tag name');
    return;
  }
  void tagStore.addTag(n, newTagColor.value ?? undefined, teamStore.activeTeamId).then((id) => {
    if (!id) {
      message.error(t('tag.createFailed') || 'Failed to create tag');
      return;
    }
    message.success(t('tag.createSuccess') || 'Tag created');
  });
}

function openEditTag(tag: Tag) {
  editingTag.value = tag;
  editingTagName.value = tag.name;
  editingTagColor.value = tag.color;
  showEditTagModal.value = true;
}

async function submitEditTag() {
  const tagToEdit = editingTag.value;
  if (!tagToEdit) return;
  const n = editingTagName.value.trim();
  if (!n) {
    message.warning(t('tag.enterName') || 'Please enter tag name');
    return;
  }
  void Promise.all([
    tagStore.updateTagName(tagToEdit.id, n),
    tagStore.updateTagColor(tagToEdit.id, editingTagColor.value),
  ]).then(([nameOk]) => {
    if (!nameOk) {
      message.error(t('common.saveFailed') || 'Save failed');
      return;
    }
    message.success(t('common.saveSuccess') || 'Saved successfully');
    showEditTagModal.value = false;
    editingTag.value = null;
  });
}

function askDeleteTag(tag: Tag) {
  void tagStore.deleteTag(tag.id).then((ok) => {
    if (!ok) {
      message.error(t('common.deleteFailed') || 'Delete failed');
      return;
    }
    // Remove from selected filter if present
    tagStore.selectedTagIds = tagStore.selectedTagIds.filter((id) => id !== tag.id);
    message.success(t('tag.deleteSuccess') || 'Tag deleted');
  });
}

function openNaturalLanguageCreate() {
  nlRaw.value = "";
  showNlModal.value = true;
}

async function quickAddTask() {
  const text = quickAddRaw.value.trim();
  if (!text) return;
  const draft = parseNaturalLanguageTask(text);
  if (!draft.title.trim()) {
    message.warning(t('task.enterContent') || 'Please enter task content');
    return;
  }
  const dueAt = draft.dueAtMs ? new Date(draft.dueAtMs).toISOString() : null;
  const task = await store.addTask({
    title: draft.title,
    description: draft.description,
    dueAt,
    priority: draft.priority,
    isImportant: draft.isImportant,
    repeatRule: draft.repeatRule,
    projectIds: [],
    tagIds: [],
  });
  if (task) {
    message.success(t('task.createSuccess') || 'Task created');
    quickAddRaw.value = "";
  } else {
    message.error(t('task.createFailed') || 'Failed to create task');
  }
}

function openBlankFormFromNl() {
  showNlModal.value = false;
  openCreate();
}

function applyDraftToForm(d: NaturalTaskDraft) {
  formTitle.value = d.title;
  formDescription.value = d.description ?? "";
  formDue.value = d.dueAtMs;
  formPriority.value = d.priority;
  formIsImportant.value = d.isImportant;
  if (d.repeatRule) {
    formRepeatEnabled.value = true;
    const cfg = parseRRule(d.repeatRule);
    formRRuleConfig.value = cfg ?? { freq: "DAILY", interval: 1, endType: "NEVER" };
  } else {
    formRepeatEnabled.value = false;
    formRRuleConfig.value = { freq: "DAILY", interval: 1, endType: "NEVER" };
  }
  formNotifyEnabled.value = false;
  formReminderPresets.value = [5, 15];
  formCustomReminderTimes.value = [];
  formTagIds.value = [];
  formAttachments.value = [];
  pendingAttachments.value = [];
}

function parseNaturalLanguageAndOpenForm() {
  const draft = parseNaturalLanguageTask(nlRaw.value);
  if (!draft.title.trim()) {
    message.warning(t('task.nlHint') || 'Please describe the task first, or use blank form');
    return;
  }
  editing.value = null;
  applyDraftToForm(draft);
  formProjectIds.value = defaultFormProjectIds();
  showNlModal.value = false;
  showModal.value = true;
  clearAttachmentUploadInternal();
  message.success(t('task.taskCreatedFromNl') || 'Draft generated from description, please confirm and click OK to create');
}

const modalTitle = computed(() => (editing.value ? t('task.edit') : t('task.create')));

function defaultFormProjectIds(): string[] {
  const s = selectedProjectId.value;
  if (s && projects.value.some((p) => p.id === s)) return [s];
  // If a builtin view is active, new tasks go to inbox
  const inbox = projects.value.find((p) => p.builtIn && p.name === (t('nav.inbox') || 'Inbox'));
  if (inbox) return [inbox.id];
  const f = projects.value[0]?.id;
  return f ? [f] : [];
}

function projectLabelById(id: string): string {
  return projects.value.find((p) => p.id === id)?.name ?? id;
}

function openCreate() {
  editing.value = null;
  formTitle.value = "";
  formDescription.value = "";
  formStart.value = null;
  formDue.value = null;
  formPriority.value = 0;
  formIsImportant.value = false;
  formRepeatEnabled.value = false;
  formRRuleConfig.value = { freq: "DAILY", interval: 1, endType: "NEVER" };
  formRepeatAdvanced.value = false;
  formNotifyEnabled.value = false;
  formReminderPresets.value = [5, 15];
  formCustomReminderTimes.value = [];
  formProjectIds.value = defaultFormProjectIds();
  formTagIds.value = [];
  formDependsOn.value = [];
  formAttachments.value = [];
  formAssigneeId.value = null;
  pendingAttachments.value = [];
  formLocationReminders.value = [];
  showModal.value = true;
  clearAttachmentUploadInternal();
}

function openEdit(task: Task) {
  editing.value = task;
  formTitle.value = task.title;
  formDescription.value = task.description ?? "";
  formStart.value = task.startAt ? new Date(task.startAt).getTime() : null;
  formDue.value = task.dueAt ? new Date(task.dueAt).getTime() : null;
  formPriority.value = task.priority;
  formIsImportant.value = task.isImportant;
  if (task.repeatRule) {
    formRepeatEnabled.value = true;
    const cfg = parseRRule(task.repeatRule);
    formRRuleConfig.value = cfg ?? { freq: "DAILY", interval: 1, endType: "NEVER" };
  } else {
    formRepeatEnabled.value = false;
    formRRuleConfig.value = { freq: "DAILY", interval: 1, endType: "NEVER" };
  }
  formNotifyEnabled.value = task.notifyEnabled;
  if (task.reminderSettings) {
    formReminderPresets.value = task.reminderSettings.presets ?? [5, 15];
    formCustomReminderTimes.value = task.reminderSettings.customTimes ?? [];
  } else {
    formReminderPresets.value = [5, 15];
    formCustomReminderTimes.value = [];
  }
  const pids = task.projectIds?.length ? [...task.projectIds] : defaultFormProjectIds();
  formProjectIds.value = pids;
  formTagIds.value = [...(task.tagIds ?? [])];
  formDependsOn.value = [...(task.dependsOn ?? [])];
  formAssigneeId.value = task.assigneeId;
  formAttachments.value = (task.attachments ?? []).map((a) => ({ ...a }));
  pendingAttachments.value = [];
  // Load location reminders from task if available
  formLocationReminders.value = (task.locationReminders ?? []).map((r) => ({
    id: r.id,
    locationName: r.locationName,
    latitude: r.latitude,
    longitude: r.longitude,
    radius: r.radius,
    reminderType: r.reminderType,
    enabled: r.enabled,
  }));
  showModal.value = true;
  clearAttachmentUploadInternal();
  // Load comments for this task
  loadCommentsForTask(task.id);
}

function dueIsoFromPicker(ms: number | null): string | null {
  if (ms == null) return null;
  return new Date(ms).toISOString();
}
function startIsoFromPicker(ms: number | null): string | null {
  if (ms == null) return null;
  return new Date(ms).toISOString();
}

function onUploadExceed() {
  message.warning(`${t('attachment.maxReached') || `Maximum ${MAX_ATTACHMENTS_PER_TASK} attachments, please remove some files first`}`);
}

async function handleCustomRequest(options: UploadRequestOptions) {
  /** Naive passes file as UploadFileInfo, binary in .file */
  const file = options.file.file ?? null;
  if (!file) {
    options.onError();
    return;
  }
  if (file.size > MAX_ATTACHMENT_BYTES) {
    message.warning(`${file.name} ${t('attachment.tooLarge') || 'exceeds' } ${formatFileSize(MAX_ATTACHMENT_BYTES)}, ${t('attachment.skipped') || 'skipped'}`);
    options.onError();
    return;
  }
  if (formAttachments.value.length + pendingAttachments.value.length >= MAX_ATTACHMENTS_PER_TASK) {
    message.warning(t('task.maxReached', { n: MAX_ATTACHMENTS_PER_TASK }));
    options.onError();
    return;
  }

  const pendId = newId();
  pendingAttachments.value.push({
    id: pendId,
    name: file.name,
    size: file.size,
    mimeType: file.type || "application/octet-stream",
    progress: 8,
    status: "reading",
  });

  let pct = 8;
  const timer = window.setInterval(() => {
    pct = Math.min(92, pct + 12 + Math.random() * 8);
    options.onProgress({ percent: Math.round(pct) });
    const row = pendingAttachments.value.find((p) => p.id === pendId);
    if (row && row.status === "reading") row.progress = Math.round(pct);
  }, 120);

  try {
    const dataUrl = await readFileAsDataUrl(file);
    window.clearInterval(timer);
    options.onProgress({ percent: 100 });
    pendingAttachments.value = pendingAttachments.value.filter((p) => p.id !== pendId);
    formAttachments.value.push({
      id: newId(),
      name: file.name,
      mimeType: file.type || "application/octet-stream",
      size: file.size,
      dataUrl,
    });
    options.onFinish();
  } catch {
    window.clearInterval(timer);
    const row = pendingAttachments.value.find((p) => p.id === pendId);
    if (row) {
      row.status = "error";
      row.error = t('task.readError') || 'Read error';
      row.progress = 0;
    }
    message.error(t('task.fileReadError', { name: file.name }));
    options.onError();
  }
}

function removePendingAttachment(id: string) {
  pendingAttachments.value = pendingAttachments.value.filter((p) => p.id !== id);
}

function removeFormAttachment(id: string) {
  formAttachments.value = formAttachments.value.filter((a) => a.id !== id);
}

function downloadAttachment(att: TaskAttachment) {
  const a = document.createElement("a");
  a.href = att.dataUrl;
  a.download = att.name;
  a.rel = "noopener";
  document.body.appendChild(a);
  a.click();
  a.remove();
}

function canPreviewAttachment(att: TaskAttachment): boolean {
  const m = (att.mimeType || "").toLowerCase();
  const n = att.name.toLowerCase();
  if (m.startsWith("image/")) return true;
  if (m === "application/pdf" || n.endsWith(".pdf")) return true;
  if (m.startsWith("text/") || m === "application/json" || m === "application/xml") return true;
  return /\.(md|txt|csv|json|xml|html?|log|ts|js|vue|css|yml|yaml|sh|bat|ps1)$/i.test(n);
}

function openPreview(att: TaskAttachment) {
  const m = (att.mimeType || "").toLowerCase();
  const n = att.name.toLowerCase();
  previewTextContent.value = "";
  previewTextLoading.value = false;

  if (m.startsWith("image/")) {
    previewAttachment.value = att;
    previewKind.value = "image";
    showPreviewModal.value = true;
    return;
  }
  if (m === "application/pdf" || n.endsWith(".pdf")) {
    previewAttachment.value = att;
    previewKind.value = "pdf";
    showPreviewModal.value = true;
    return;
  }
  if (
    m.startsWith("text/") ||
    m === "application/json" ||
    m === "application/xml" ||
    /\.(md|txt|csv|json|xml|html?|log|ts|js|vue|css|yml|yaml|sh|bat|ps1)$/i.test(att.name)
  ) {
    previewAttachment.value = att;
    previewKind.value = "text";
    previewTextLoading.value = true;
    showPreviewModal.value = true;
    void fetch(att.dataUrl)
      .then((r) => r.text())
      .then((t) => {
        previewTextContent.value = t;
      })
      .catch(() => {
        previewTextContent.value = t('task.cannotDecodeText');
      })
      .finally(() => {
        previewTextLoading.value = false;
      });
    return;
  }
  message.info(t('task.unsupportedPreview') || 'This format does not support preview, please use Download');
}

watch(showPreviewModal, (open) => {
  if (!open) {
    previewAttachment.value = null;
    previewKind.value = null;
    previewTextContent.value = "";
    previewTextLoading.value = false;
  }
});

async function submitForm() {
  const title = formTitle.value.trim();
  if (!title) {
    message.warning(t('task.fillTitle') || 'Please fill in the title');
    return;
  }
  if (pendingAttachments.value.some((p) => p.status === "reading")) {
    message.warning(t('task.attachmentsProcessing') || 'Attachments are still being processed, please wait before saving');
    return;
  }
  if (pendingAttachments.value.some((p) => p.status === "error")) {
    message.warning(t('task.removeFailedAttachments') || 'Please remove failed attachments or reselect files');
    return;
  }
  const dueAt = dueIsoFromPicker(formDue.value);
  const startAt = startIsoFromPicker(formStart.value);
  const attachments = formAttachments.value.map((a) => ({ ...a }));

  // 处理分类：创建新的分类（如果需要）
  const validProjectIds = new Set(projects.value.map((p) => p.id));
  const validProjectNames = new Set(projects.value.map((p) => p.name));
  const rawFormIds = formProjectIds.value;
  const resolvedProjectIds: string[] = [];
  for (const id of rawFormIds) {
    if (validProjectIds.has(id)) {
      resolvedProjectIds.push(id);
    } else if (!validProjectNames.has(id)) {
      // 新建的分类名，创建并获取真实ID
      const newId = await store.addProject(id);
      if (newId) resolvedProjectIds.push(newId);
    }
  }

  // 处理标签：创建新的标签（如果需要）
  const validTagIds = new Set(activeTags.value.map((t) => t.id));
  const validTagNames = new Set(activeTags.value.map((t) => t.name));
  const resolvedTagIds: string[] = [];
  for (const id of formTagIds.value) {
    if (validTagIds.has(id)) {
      resolvedTagIds.push(id);
    } else if (!validTagNames.has(id)) {
      // 新建的标签名，创建并获取真实ID
      const newId = await tagStore.addTag(id, PRESET_COLORS[0] ?? undefined, teamStore.activeTeamId);
      if (newId) resolvedTagIds.push(newId);
    }
  }

  if (resolvedProjectIds.length === 0) {
    const defaults = defaultFormProjectIds().filter((id) => validProjectIds.has(id));
    if (defaults.length > 0) {
      resolvedProjectIds.push(...defaults);
    }
  }
  if (resolvedProjectIds.length === 0) {
    message.warning(t('task.selectProject') || 'Please select at least one project');
    return;
  }

  if (editing.value) {
    // Record before-state for undo
    const beforeTask = store.tasks.find((t) => t.id === editing.value!.id);
    if (beforeTask) {
      recordUpdate(beforeTask.id, beforeTask, { ...beforeTask });
    }
    const ok = await store.updateTask(editing.value.id, {
      title,
      description: formDescription.value.trim() || null,
      startAt,
      dueAt,
      priority: formPriority.value,
      isImportant: formIsImportant.value,
      repeatRule: formRepeatRule.value,
      notifyEnabled: formNotifyEnabled.value,
      reminderSettings: formNotifyEnabled.value ? {
        presets: formReminderPresets.value,
        customMinutes: [],
        customTimes: formCustomReminderTimes.value.filter((t): t is string => typeof t === "string"),
      } : null,
      projectIds: resolvedProjectIds,
      tagIds: resolvedTagIds,
      attachments,
      dependsOn: formDependsOn.value,
      assigneeId: formAssigneeId.value,
    });
    if (!ok) {
      message.error(t('task.savedFailed') || 'Save failed, please reduce attachments and try again');
      return;
    }
    message.success(t('task.savedSuccess') || 'Saved successfully');
    const savedTask = tasks.value.find((t) => t.id === editing.value?.id);
    if (savedTask) {
      cancelTaskReminder(savedTask.id);
      scheduleTaskReminder(savedTask);
      await syncLocationReminders(savedTask.id);
      // Date propagation: if due date changed, prompt to shift dependent tasks
      const oldDue = editing.value?.dueAt;
      const newDue = dueAt;
      if (oldDue !== newDue && newDue) {
        const dependents = getDependentTasks(savedTask);
        if (dependents.length > 0) {
          // Simple approach: just notify user about dependent tasks
          const names = dependents.map((t) => t.title).join(", ");
          message.info(`${t('task.dependNotify') || 'Note'}: ${names} ${t('task.dependSuggest') || 'depends on this task, may need to adjust due date'}`);
        }
      }
    }
  } else {
    const ok = await store.addTask({
      title,
      description: formDescription.value.trim() || null,
      startAt,
      dueAt,
      priority: formPriority.value,
      isImportant: formIsImportant.value,
      repeatRule: formRepeatRule.value,
      notifyEnabled: formNotifyEnabled.value,
      reminderSettings: formNotifyEnabled.value ? {
        presets: formReminderPresets.value,
        customMinutes: [],
        customTimes: formCustomReminderTimes.value.filter((t): t is string => typeof t === "string"),
      } : null,
      projectIds: resolvedProjectIds,
      tagIds: resolvedTagIds,
      attachments,
      assigneeId: formAssigneeId.value,
    });
    if (!ok) {
      message.error(t('task.createFailedAttachments') || 'Failed to create task, storage quota exceeded, please reduce attachments');
      return;
    }
    message.success(t('task.createSuccess') || 'Task created');
    // Find the just-created task and schedule its reminder
    const created = tasks.value.find((t) => t.title === title && !t.completed && t.dueAt === dueAt);
    if (created) {
      recordCreate({ ...created });
      scheduleTaskReminder(created);
      await syncLocationReminders(created.id);
    }
  }
  showModal.value = false;
}

/** Check if task completion is blocked by dependencies */
function getBlockingTasks(task: Task): Task[] {
  if (!task.dependsOn || task.dependsOn.length === 0) return [];
  return task.dependsOn
    .map((id) => store.tasks.find((t) => t.id === id))
    .filter((t): t is Task => t !== undefined && !t.completed);
}

/** Get tasks that depend on the given task (reverse of dependsOn) */
function getDependentTasks(task: Task): Task[] {
  return store.tasks.filter((t) => !t.deletedAt && t.dependsOn?.includes(task.id));
}

async function onTaskCompleteClick(task: Task) {
  recordToggleComplete({ ...task });
  if (task.completed) {
    // Uncompleting is always allowed
    await store.toggleComplete(task.id);
    return;
  }
  const blockers = getBlockingTasks(task);
  if (blockers.length > 0) {
    const names = blockers.map((t) => t.title).join(t('common.and') || ', ');
    message.warning(t('common.waitingTasks', { names }));
    return;
  }
  await store.toggleComplete(task.id);
}

async function removeTask(task: Task) {
  recordDelete({ ...task });
  cancelTaskReminder(task.id);
  await store.softDelete(task.id);
  message.success(t('task.moveToTrash') || 'Moved to trash');
}

function priorityLabel(p: TaskPriority): string {
  const opts = priorityOptions.value;
  const opt = opts.find((x) => x.value === p);
  return (opt?.label ?? t('task.priority2')) || 'Medium';
}

function memberNameById(memberId: string | null): string {
  if (!memberId) return "?";
  const m = teamStore.members.find((m) => m.id === memberId);
  return m?.userUsername || m?.userEmail || "?";
}

function isOverdue(task: Task): boolean {
  return !task.completed && !!task.dueAt && new Date(task.dueAt) < new Date();
}

function formatDateShort(iso: string): string {
  const d = new Date(iso);
  return `${d.getMonth() + 1}/${d.getDate()}`;
}

function taskLunarInfo(dueAt: string | null): { label: string; isHoliday: boolean } | null {
  if (!dueAt) return null;
  const info = getLunarInfo(new Date(dueAt));
  return { label: info.shortLabel || info.label, isHoliday: info.isHoliday };
}
</script>

<template>
  <!-- Global quick add bar - fixed at top -->
  <div class="quick-add-bar">
    <NInput
      v-model:value="quickAddRaw"
      size="large"
      :placeholder="t('task.quickAddPlaceholder')"
      @keydown.enter.prevent="void quickAddTask()"
    >
      <template #prefix>
        <span style="color: var(--tt-accent, #18a0ff); font-size: 18px; font-weight: 700;">+</span>
      </template>
    </NInput>
  </div>

  <!-- Outer layout: narrow avatar+nav sidebar + main content area -->
  <NLayout has-sider style="min-height: 100vh; padding-top: 64px;" class="app-themed">
    <!-- Outer left sidebar: avatar + nav icons -->
    <NLayoutSider
      bordered
      :native-scrollbar="false"
      content-style="padding: 12px 0"
      width="64"
      class="sidebar-themed"
    >
      <NSpace vertical :size="16" align="center">
        <!-- Avatar circle -->
        <div class="avatar-circle" :title="username ?? authEmail ?? ''">
          {{ (username ?? authEmail ?? "?").charAt(0).toUpperCase() }}
        </div>

        <!-- Nav icons -->
        <NSpace vertical :size="8" align="center">
          <div
            v-for="(item, idx) in orderedNavItems"
            :key="item.key"
            class="nav-module-wrapper"
            :class="{
              'nav-module-wrapper--dragging': sidebarDragFromIndex === idx,
              'nav-module-wrapper--drag-over': sidebarDragOverIndex === idx,
            }"
            draggable="true"
            @dragstart="onSidebarModuleDragStart($event, idx)"
            @dragover="onSidebarModuleDragOver($event, idx)"
            @drop="onSidebarModuleDrop($event, idx)"
            @dragend="onSidebarModuleDragEnd"
          >
            <NButton
              text
              class="nav-icon-btn"
              :class="{ active: activeNav === item.key }"
              style="position: relative;"
              @click="activeNav = item.key"
            >
              <span class="nav-icon">{{ item.icon }}</span>
              <NText v-if="activeNav === item.key" class="nav-label">{{ item.label }}</NText>
              <span
                v-if="item.key === 'pomodoro' && todayPomodoros > 0 && activeNav !== 'pomodoro'"
                class="nav-pomodoro-badge"
              >{{ todayPomodoros }}</span>
            </NButton>
          </div>
          <!-- Settings — not draggable -->
          <NButton
            text
            class="nav-icon-btn"
            :class="{ active: activeNav === 'settings' }"
            @click="router.push('/settings')"
          >
            <span class="nav-icon">⚙️</span>
            <NText v-if="activeNav === 'settings'" class="nav-label">{{ t('settings.title') }}</NText>
          </NButton>
        </NSpace>

        <!-- Bottom: logout -->
        <NButton text class="nav-icon-btn" @click="logout" style="margin-top: auto">
          <span class="nav-icon">🚪</span>
        </NButton>
      </NSpace>
    </NLayoutSider>

    <!-- Main content area: inner sidebar + task content -->
    <NLayout has-sider style="flex: 1">
      <!-- Inner left sidebar (builtin views) — only shown in 清单 view -->
      <NLayoutSider v-if="activeNav === 'list'" content-style="padding: 16px" width="180" class="sidebar-inner-themed">
        <NSpace vertical :size="8">
          <NText strong>{{ t('nav.all') }}</NText>
          <div class="sidebar-builtin-btns">
            <NButton
              v-for="view in builtinViews"
              :key="view.key"
              block
              quaternary
              :type="store.activeBuiltinView === view.key ? 'primary' : 'default'"
              @click="store.selectBuiltinView(view.key)"
            >
              <template #icon>
                <span class="nav-icon">{{ view.icon }}</span>
              </template>
              {{ view.label }}
            </NButton>
          </div>
          <NDivider style="margin: 4px 0" />

          <!-- Smart list -->
          <div style="display: flex; align-items: center; justify-content: space-between;">
            <NText strong>{{ t('smartlist.title') }}</NText>
            <NButton size="tiny" quaternary style="padding: 2px 6px;" @click="openEditSmartList()">+</NButton>
          </div>
          <div v-for="sl in smartListStore.smartLists" :key="sl.id" class="sidebar-smartlist-item" :class="{ 'sidebar-smartlist-item--active': smartListStore.activeSmartListId === sl.id }">
            <NButton
              block
              quaternary
              :type="smartListStore.activeSmartListId === sl.id ? 'primary' : 'default'"
              @click="smartListStore.selectSmartList(sl.id)"
              style="text-align: left; justify-content: flex-start;"
            >
              <template #icon>
                <span class="tag-color-dot" :style="{ background: sl.color || '#6b7280' }"></span>
              </template>
              {{ sl.name }}
            </NButton>
            <NButton size="tiny" quaternary style="padding: 0 2px; min-width: 20px; opacity: 0.6" @click.stop="openEditSmartList(sl)">✎</NButton>
            <NButton size="tiny" quaternary style="padding: 0 2px; min-width: 20px; opacity: 0.6" @click.stop="smartListStore.deleteSmartList(sl.id)">×</NButton>
          </div>

          <NDivider style="margin: 4px 0" />
          <div style="display: flex; align-items: center; justify-content: space-between;">
            <NText strong>{{ t('nav.planned') }}</NText>
            <NDropdown
              :options="createDropdownOptions"
              @select="handleCreateDropdown"
              trigger="click"
            >
              <NButton size="tiny" quaternary style="padding: 2px 6px;">+</NButton>
            </NDropdown>
          </div>

          <!-- Create category mode: show input and tags -->
          <div v-if="isCreatingCategory" style="margin-top: 8px;">
            <NInput
              v-model:value="newCategoryName"
              size="small"
              :placeholder="t('project.namePlaceholder')"
              @keydown.enter.prevent="submitCreateCategory"
              @keydown.esc.prevent="cancelCreateCategory"
              autofocus
            />
            <div class="sidebar-tag-btns" style="margin-top: 8px; padding-left: 0;">
              <NText depth="3" style="font-size: 12px; margin-bottom: 4px; display: block;">{{ t('task.selectTags') }}</NText>
              <div
                v-for="tag in sidebarTags"
                :key="tag.id"
                class="tag-item"
                :class="{ 'tag-item--selected': selectedTagIds.includes(tag.id) }"
                @click="tagStore.toggleTagFilter(tag.id)"
              >
                <span class="tag-color-dot" :style="{ background: tag.color || '#6b7280' }"></span>
                <span class="tag-name">{{ tag.name }}</span>
              </div>
            </div>
            <NSpace style="margin-top: 8px;">
              <NButton size="tiny" type="primary" @click="submitCreateCategory" :disabled="!newCategoryName.trim()">{{ t('common.create') }}</NButton>
              <NButton size="tiny" quaternary @click="cancelCreateCategory">{{ t('common.cancel') }}</NButton>
            </NSpace>
          </div>

          <!-- Project list -->
          <div v-show="!isCreatingCategory" class="sidebar-project-btns">
            <!-- 未分组项目 -->
            <div
              v-for="p in sidebarProjectGroups.ungrouped"
              :key="p.id"
              class="sidebar-project-item"
              :class="{ 'sidebar-project-item--active': selectedProjectId === p.id, 'sidebar-project-item--drag-over': taskDragOverProjectId === p.id, 'sidebar-project-item--dragging': projectDragFromId === p.id }"
              draggable="true"
              @click="store.selectProject(p.id)"
              @dragstart="onProjectDragStart($event, p.id)"
              @dragover.prevent="onProjectDragOver($event, p.id)"
              @dragleave="onProjectDragLeave"
              @drop.stop="onProjectDrop(p.id)"
            >
              <span class="sidebar-project-name">{{ p.name }}</span>
              <NButton
                size="tiny"
                quaternary
                style="padding: 0 2px; min-width: 20px; opacity: 0.6"
                @click.stop="askDeleteProject(p)"
              >
                ×
              </NButton>
            </div>

            <!-- Grouped project list -->
            <div v-for="grp in sidebarProjectGroups.grouped" :key="grp.groupId">
              <div
                class="project-group-header"
                :class="{ 'project-group-header--drag-over': taskDragOverGroupId === grp.groupId }"
                @click="collapsedGroupIds.has(grp.groupId) ? collapsedGroupIds.delete(grp.groupId) : collapsedGroupIds.add(grp.groupId)"
                @contextmenu="onGroupContextMenu($event, grp.groupId)"
                @dragover.prevent="onGroupDragOver($event, grp.groupId)"
                @dragleave="onGroupDragLeave"
                @drop.stop="onGroupDrop(grp.groupId)"
              >
                <span class="project-group-arrow">{{ collapsedGroupIds.has(grp.groupId) ? '▸' : '▾' }}</span>
                <NText strong style="font-size: 12px; flex: 1">{{ grp.groupName }}</NText>
                <NButton
                  size="tiny"
                  quaternary
                  style="padding: 0 2px; min-width: 20px; opacity: 0.6"
                  @click.stop="askDeleteGroup(grp)"
                >
                  ×
                </NButton>
              </div>
              <div v-if="!collapsedGroupIds.has(grp.groupId)">
                <div
                  v-for="p in grp.projects"
                  :key="p.id"
                  class="sidebar-project-item"
                  :class="{ 'sidebar-project-item--active': selectedProjectId === p.id, 'sidebar-project-item--drag-over': taskDragOverProjectId === p.id, 'sidebar-project-item--dragging': projectDragFromId === p.id }"
                  style="padding-left: 20px"
                  draggable="true"
                  @click="store.selectProject(p.id)"
                  @dragstart="onProjectDragStart($event, p.id)"
                  @dragover.prevent="onProjectDragOver($event, p.id)"
                  @dragleave="onProjectDragLeave"
                  @drop.stop="onProjectDrop(p.id)"
                >
                  <span class="sidebar-project-name">{{ p.name }}</span>
                  <NButton
                    size="tiny"
                    quaternary
                    style="padding: 0 2px; min-width: 20px; opacity: 0.6"
                    @click.stop="askDeleteProject(p)"
                  >
                    ×
                  </NButton>
                </div>
              </div>
            </div>

            <!-- Group context menu -->
            <NDropdown
              v-model:show="showGroupContextMenu"
              :x="groupContextMenuX"
              :y="groupContextMenuY"
              :options="groupContextMenuOptions"
              trigger="manual"
              @select="handleGroupContextMenuSelect"
            />

            <!-- Create group -->
            <div v-if="isCreatingProjectGroup">
              <NInput
                v-model:value="newProjectGroupName"
                size="tiny"
                :placeholder="t('group.namePlaceholder')"
                @keydown.enter.prevent="submitCreateProjectGroup"
                @keydown.esc.prevent="isCreatingProjectGroup = false"
                autofocus
                style="margin-top: 4px"
              />
              <NSpace style="margin-top: 4px">
                <NButton size="tiny" type="primary" @click="submitCreateProjectGroup" :disabled="!newProjectGroupName.trim()">{{ t('common.create') }}</NButton>
                <NButton size="tiny" quaternary @click="isCreatingProjectGroup = false">{{ t('common.cancel') }}</NButton>
              </NSpace>
            </div>
            <NButton
              v-else
              size="tiny"
              quaternary
              block
              style="margin-top: 4px; color: var(--tt-sidebar-text-muted, #7a8fa8)"
              @click="isCreatingProjectGroup = true"
            >
              + {{ t('group.create') }}
            </NButton>
          </div>

          <NDivider style="margin: 4px 0" />
          <div style="display: flex; align-items: center; justify-content: space-between;">
            <NText strong>{{ t('team.title') }}</NText>
            <NButton size="tiny" quaternary style="padding: 2px 6px;" @click="showCreateTeamDialog = true">+</NButton>
          </div>

          <!-- Team list -->
          <div class="sidebar-team-btns">
            <NButton
              v-for="team in teamStore.teams"
              :key="team.id"
              block
              quaternary
              :type="teamStore.activeTeamId === team.id ? 'primary' : 'default'"
              @click="handleSelectTeam(team.id)"
            >
              {{ team.name }}
            </NButton>
          </div>

          <!-- Current team action buttons -->
          <template v-if="teamStore.activeTeamId && teamStore.canManageTeam">
            <NButton size="tiny" quaternary block style="margin-top: 4px;" @click="showInviteDialog = true">
              {{ t('team.invite') }}
            </NButton>
            <NButton size="tiny" quaternary block @click="showTeamMembersDialog = true">
              {{ t('team.members') }}
            </NButton>
          </template>
          <NButton
            v-if="teamStore.activeTeamId"
            size="tiny"
            quaternary
            block
            type="warning"
            style="margin-top: 4px;"
            @click="handleLeaveTeam"
          >
            {{ t('team.leave') }}
          </NButton>
        </NSpace>
      </NLayoutSider>

      <NLayoutContent content-style="padding: 20px 24px">
        <!-- Search view -->
        <div v-if="activeNav === 'search'" class="search-view">
          <NInput
            v-model:value="searchText"
            clearable
            size="large"
            :placeholder="t('search.placeholder')"
            autofocus
          />
          <div v-if="searchText.trim()" class="search-results">
            <div v-if="searchResults.length === 0" class="empty" style="margin-top: 24px">
              <NText depth="3">{{ t('search.noResults') }}「{{ searchText }}」{{ t('search.tasks') }}</NText>
            </div>
            <div v-else class="task-list" style="margin-top: 16px">
              <div
                v-for="task in searchResults"
                :key="task.id"
                class="task-row"
                :class="{ 'task-row--done': task.completed }"
                @click="openEdit(task)"
              >
                <NCheckbox
                  :checked="task.completed"
                  @click.stop="onTaskCompleteClick(task)"
                />
                <span class="task-title">{{ task.title }}</span>
                <NTag v-if="task.dueAt" size="small" :bordered="false">{{ task.dueAt.slice(0, 10) }}</NTag>
              </div>
            </div>
          </div>
          <div v-else class="empty" style="margin-top: 48px; text-align: center">
            <NText depth="3">{{ t('search.hint') }}</NText>
          </div>
        </div>

        <!-- Habit view -->
        <div v-else-if="activeNav === 'habits'" class="habits-view">
          <div class="habits-header">
            <NText strong style="font-size: 18px">{{ t('habit.title') }}</NText>
            <NButton type="primary" size="small" @click="showAddHabitModal = true">+ {{ t('habit.create') }}</NButton>
          </div>

          <!-- 习惯统计图表 -->
          <div v-if="habitStore.activeHabits.length > 0" class="habits-stats">
            <!-- 汇总卡片 -->
            <div class="habits-stats-summary">
              <div class="habits-stat-card">
                <NText class="habits-stat-num">{{ habitCompletionRate }}%</NText>
                <NText depth="3" style="font-size: 12px">{{ t('habit.last30DaysRate') }}</NText>
              </div>
              <div class="habits-stat-card">
                <NText class="habits-stat-num">{{ habitStatsCompletedThisWeek }}</NText>
                <NText depth="3" style="font-size: 12px">{{ t('habit.weekCompleted') || '本周完成次数' }}</NText>
              </div>
              <div class="habits-stat-card">
                <NText class="habits-stat-num">{{ habitStore.activeHabits.length }}</NText>
                <NText depth="3" style="font-size: 12px">{{ t('habit.count') || '习惯数量' }}</NText>
              </div>
            </div>

            <!-- 每周柱状图 -->
            <div class="habits-weekly-chart">
              <NText depth="3" style="font-size: 13px; margin-bottom: 8px; display: block">{{ t('habit.weeklyCompleted') || '每周完成次数' }}</NText>
              <div class="habits-bar-chart">
                <div
                  v-for="week in habitWeeklyCounts"
                  :key="week.label"
                  class="habits-bar-col"
                >
                  <div class="habits-bar-wrap">
                    <div
                      class="habits-bar"
                      :style="{ height: Math.max(4, (week.count / Math.max(...habitWeeklyCounts.map(w => w.count), 1)) * 80) + 'px' }"
                    ></div>
                  </div>
                  <NText depth="3" style="font-size: 11px">{{ week.label }}</NText>
                </div>
              </div>
            </div>

            <!-- 热度图 -->
            <div class="habits-heatmap">
              <NText depth="3" style="font-size: 13px; margin-bottom: 8px; display: block">{{ t('habit.checkInRecord') || '打卡记录（近12周）' }}</NText>
              <div class="habits-heatmap-grid">
                <div class="habits-heatmap-row">
                  <span class="habits-heatmap-label">{{ t('habit.mon') || '一' }}</span>
                  <span class="habits-heatmap-label">{{ t('habit.tue') || '二' }}</span>
                  <span class="habits-heatmap-label">{{ t('habit.wed') || '三' }}</span>
                  <span class="habits-heatmap-label">{{ t('habit.thu') || '四' }}</span>
                  <span class="habits-heatmap-label">{{ t('habit.fri') || '五' }}</span>
                  <span class="habits-heatmap-label">{{ t('habit.sat') || '六' }}</span>
                  <span class="habits-heatmap-label">{{ t('habit.sun') || '日' }}</span>
                </div>
                <div
                  v-for="(week, wi) in habitHeatmapData"
                  :key="wi"
                  class="habits-heatmap-row"
                >
                  <div
                    v-for="(day, di) in week"
                    :key="di"
                    class="habits-heatmap-cell"
                    :class="{
                      'heatmap-cell-none': day.count === 0,
                      'heatmap-cell-low': day.count > 0 && day.count <= 2,
                      'heatmap-cell-mid': day.count > 2 && day.count <= 5,
                      'heatmap-cell-high': day.count > 5,
                      'heatmap-cell-future': day.count === -1,
                    }"
                    :title="day.date ? `${day.date}: ${day.count}${t('habit.checkInCount')}` : ''"
                  ></div>
                </div>
              </div>
              <div class="habits-heatmap-legend">
                <span class="heatmap-legend-item heatmap-cell-none"></span>
                <NText depth="3" style="font-size: 11px">0</NText>
                <span class="heatmap-legend-item heatmap-cell-low"></span>
                <span class="heatmap-legend-item heatmap-cell-mid"></span>
                <span class="heatmap-legend-item heatmap-cell-high"></span>
                <NText depth="3" style="font-size: 11px">{{ t('common.more') }}</NText>
              </div>
            </div>
          </div>

          <!-- 今日习惯列表 -->
          <div class="habits-today">
            <NText depth="3" style="font-size: 13px; margin-bottom: 12px; display: block">{{ t('habit.today') || '今日习惯' }}</NText>
            <NSpace vertical :size="8" style="width: 100%">
              <div
                v-for="habit in habitStore.activeHabits"
                :key="habit.id"
                class="habit-row"
                :class="{ 'habit-row--done': habitStore.isCompletedToday(habit.id) }"
              >
                <div class="habit-check" @click="habitStore.toggleToday(habit.id)">
                  <span v-if="habitStore.isCompletedToday(habit.id)" class="habit-check-done">✓</span>
                  <span v-else class="habit-check-empty"></span>
                </div>
                <div class="habit-info">
                  <span class="habit-name" :style="{ color: habit.color || '#18a0ff' }">{{ habit.name }}</span>
                  <span v-if="habitStore.streakByHabitId(habit.id) > 1" class="habit-streak">
                    🔥 {{ habitStore.streakByHabitId(habit.id) }}{{ t('habit.daysUnit') }}
                  </span>
                </div>
                <div class="habit-freq">
                  <NText depth="3" style="font-size: 12px">
                    {{ frequencyLabel(habit.frequency) }}
                  </NText>
                </div>
              </div>
              <div v-if="habitStore.activeHabits.length === 0" class="empty">
                <NText depth="3">{{ t('habit.noHabitsToday') || '今天没有需要追踪的习惯' }}</NText>
              </div>
            </NSpace>
          </div>

          <!-- 所有习惯列表 -->
          <div class="habits-all" style="margin-top: 24px">
            <NText depth="3" style="font-size: 13px; margin-bottom: 12px; display: block">{{ t('habit.all') || '所有习惯' }}</NText>
            <NSpace vertical :size="8" style="width: 100%">
              <div
                v-for="habit in habitStore.activeHabits"
                :key="habit.id"
                class="habit-row"
                :class="{ 'habit-row--done': habitStore.isCompletedToday(habit.id) }"
                @click="openEditHabit(habit)"
              >
                <div class="habit-check" @click.stop="habitStore.toggleToday(habit.id)">
                  <span v-if="habitStore.isCompletedToday(habit.id)" class="habit-check-done">✓</span>
                  <span v-else class="habit-check-empty"></span>
                </div>
                <div class="habit-info">
                  <span class="habit-name" :style="{ color: habit.color || '#18a0ff' }">{{ habit.name }}</span>
                  <span v-if="habitStore.streakByHabitId(habit.id) > 0" class="habit-streak">
                    🔥 {{ habitStore.streakByHabitId(habit.id) }}{{ t('habit.daysUnit') }}
                  </span>
                </div>
                <div class="habit-actions">
                  <NButton size="tiny" quaternary @click.stop="void habitStore.deleteHabit(habit.id)">{{ t('task.delete') }}</NButton>
                </div>
              </div>
            </NSpace>
          </div>
        </div>

        <!-- Note view -->
        <div v-else-if="activeNav === 'notes'" class="notes-view">
          <div class="notes-header">
            <NText strong style="font-size: 18px">📝 {{ t('note.title') || '笔记' }}</NText>
            <NButton type="primary" size="small" @click="openCreateNote">+ {{ t('note.create') || '新建笔记' }}</NButton>
          </div>

          <!-- 笔记列表 -->
          <div class="notes-list">
            <NSpace vertical :size="8" style="width: 100%">
              <div
                v-for="note in visibleNotes"
                :key="note.id"
                class="note-card"
                @click="openEditNote(note)"
              >
                <div class="note-card-title">{{ note.title }}</div>
                <div v-if="note.content" class="note-card-content">{{ note.content }}</div>
                <div class="note-card-time">{{ note.createdAt.slice(0, 16).replace("T", " ") }}</div>
              </div>
              <div v-if="visibleNotes.length === 0" class="empty" style="margin-top: 48px; text-align: center">
                <NText depth="3">{{ t('note.empty') || '还没有笔记，点击新建笔记开始' }}</NText>
              </div>
            </NSpace>
          </div>
        </div>

        <!-- Pomodoro view -->
        <div v-else-if="activeNav === 'pomodoro'" class="pomodoro-view">
          <NSpace vertical :size="24" align="center" style="width: 100%; padding: 24px 0">
            <NText strong style="font-size: 22px">🍅 {{ t('pomodoro.title') }}</NText>

            <!-- 圆形计时器 -->
            <div class="pomodoro-timer-wrap">
              <NProgress
                type="circle"
                :percentage="pomodoroStore.progress"
                :stroke-width="10"
                :width="220"
                color="#ef4444"
                rail-color="rgba(255,255,255,0.08)"
              >
                <div class="pomodoro-big-time">{{ pomodoroStore.timerDisplay }}</div>
              </NProgress>
            </div>

            <!-- 时长选择 -->
            <NSpace :size="8" justify="center">
              <NButton
                v-for="m in [5, 10, 15, 20, 25, 30, 60]"
                :key="m"
                size="small"
                :type="pomodoroStore.durationMinutes === m ? 'primary' : 'default'"
                :disabled="pomodoroStore.isRunning || pomodoroStore.isPaused"
                @click="pomodoroStore.setDuration(m)"
              >{{ m }}m</NButton>
              <NButton
                size="small"
                :type="![5,10,15,20,25,30,60].includes(pomodoroStore.durationMinutes) ? 'primary' : 'default'"
                :disabled="pomodoroStore.isRunning || pomodoroStore.isPaused"
                @click="openCustomDuration"
              >{{ t('common.custom') || '自定义' }}</NButton>
            </NSpace>

            <!-- 关联任务 -->
            <div style="width: 320px">
              <NSpace vertical :size="8" style="width: 100%">
                <NText depth="3" style="font-size: 12px">{{ t('pomodoro.linkTask') }}</NText>
                <NSelect
                  v-model:value="pomodoroStore.currentTaskId"
                  :options="pomodoroStore.availableTaskOptions"
                  :placeholder="t('pomodoro.selectTask')"
                  clearable
                  :disabled="pomodoroStore.isRunning || pomodoroStore.isPaused"
                  style="width: 100%"
                />
              </NSpace>
            </div>

            <!-- 控制按钮 -->
            <NSpace :size="12">
              <template v-if="!pomodoroStore.isRunning && !pomodoroStore.isPaused">
                <NButton type="primary" size="large" @click="void pomodoroStore.startTimer()">{{ t('pomodoro.start') }}</NButton>
              </template>
              <template v-else-if="pomodoroStore.isRunning">
                <NButton size="large" @click="pomodoroStore.pauseTimer()">{{ t('pomodoro.pause') }}</NButton>
                <NButton type="warning" size="large" @click="void pomodoroStore.stopTimer(false)">{{ t('pomodoro.stop') }}</NButton>
              </template>
              <template v-else>
                <NButton type="primary" size="large" @click="void pomodoroStore.resumeTimer()">{{ t('pomodoro.resume') }}</NButton>
                <NButton type="warning" size="large" @click="void pomodoroStore.stopTimer(false)">{{ t('pomodoro.stop') }}</NButton>
              </template>
            </NSpace>

            <!-- 统计数据 -->
            <div class="pomodoro-stats-grid">
              <div class="pomodoro-stat-card">
                <NText class="pomodoro-stat-num">{{ pomodoroStore.todayPomodoros }}</NText>
                <NText depth="3" style="font-size: 12px">{{ t('pomodoro.today') }}</NText>
              </div>
              <div class="pomodoro-stat-card">
                <NText class="pomodoro-stat-num">{{ pomodoroStore.todayMinutes }}m</NText>
                <NText depth="3" style="font-size: 12px">{{ t('pomodoro.todayDuration') }}</NText>
              </div>
              <div class="pomodoro-stat-card">
                <NText class="pomodoro-stat-num">{{ pomodoroStore.weekPomodoros }}</NText>
                <NText depth="3" style="font-size: 12px">{{ t('pomodoro.week') }}</NText>
              </div>
              <div class="pomodoro-stat-card">
                <NText class="pomodoro-stat-num">{{ pomodoroStore.weekMinutes }}m</NText>
                <NText depth="3" style="font-size: 12px">{{ t('pomodoro.weekDuration') }}</NText>
              </div>
            </div>
          </NSpace>
        </div>

        <!-- Stats view -->
        <div v-else-if="activeNav === 'stats'" class="stats-view">
          <NText strong style="font-size: 22px; margin-bottom: 24px; display: block">📊 {{ t('stats.title') || '统计概览' }}</NText>

          <!-- 任务总数卡片 -->
          <div class="stats-grid-2">
            <div class="stats-card">
              <NText class="stats-card-num">{{ statsData.totalTasks }}</NText>
              <NText depth="3" style="font-size: 13px">{{ t('stats.totalTasks') || '任务总数' }}</NText>
            </div>
            <div class="stats-card">
              <NText class="stats-card-num">{{ statsData.completedTasks }}</NText>
              <NText depth="3" style="font-size: 13px">{{ t('stats.completed') || '已完成' }}</NText>
            </div>
            <div class="stats-card">
              <NText class="stats-card-num">{{ statsData.activeTasks }}</NText>
              <NText depth="3" style="font-size: 13px">{{ t('stats.active') || '进行中' }}</NText>
            </div>
            <div class="stats-card">
              <NText class="stats-card-num" style="color: #ef4444">{{ statsData.overdueTasks }}</NText>
              <NText depth="3" style="font-size: 13px">{{ t('stats.overdue') || '已逾期' }}</NText>
            </div>
          </div>

          <!-- 任务完成率 -->
          <div class="stats-section">
            <NText strong style="font-size: 15px; margin-bottom: 12px; display: block">{{ t('stats.completionRate') || '任务完成率' }}</NText>
            <div class="stats-completion-ring-wrap">
              <NProgress
                type="circle"
                :percentage="100"
                :stroke-width="12"
                :size="140"
                color="rgba(255,255,255,0.08)"
                :rail-color="'transparent'"
                :show-indicator="false"
              />
              <NProgress
                type="circle"
                :percentage="statsData.completionRate"
                :stroke-width="12"
                :size="140"
                color="#18a0ff"
                :rail-color="'transparent'"
                :show-indicator="false"
                class="stats-completion-ring-fill"
              />
              <div class="stats-completion-ring-text">
                <NText class="stats-completion-pct">{{ statsData.completionRate }}%</NText>
                <NText depth="3" style="font-size: 12px">{{ t('stats.rate') || '完成率' }}</NText>
              </div>
            </div>
            <div class="stats-completion-legend">
              <div class="stats-completion-legend-item">
                <span class="stats-legend-dot" style="background: #18a0ff"></span>
                <span>{{ t('stats.completed') }} {{ statsData.completedTasks }}</span>
              </div>
              <div class="stats-completion-legend-item">
                <span class="stats-legend-dot" style="background: rgba(255,255,255,0.15)"></span>
                <span>{{ t('stats.incomplete') || '未完成' }} {{ statsData.totalTasks - statsData.completedTasks }}</span>
              </div>
            </div>
          </div>

          <!-- 按项目分布 -->
          <div class="stats-section">
            <NText strong style="font-size: 15px; margin-bottom: 12px; display: block">{{ t('stats.byProject') || '按项目分布' }}</NText>
            <div v-if="statsData.projectStats.length > 0" class="stats-bar-list">
              <div v-for="ps in statsData.projectStats" :key="ps.name" class="stats-bar-row">
                <div class="stats-bar-label">
                  <span>{{ ps.name }}</span>
                  <span depth="3" style="font-size: 12px">{{ ps.count }}</span>
                </div>
                <div class="stats-bar-track">
                  <div
                    class="stats-bar-fill"
                    :style="{ width: `${ps.pct}%`, background: ps.color || '#18a0ff' }"
                  />
                </div>
              </div>
            </div>
            <NText v-else depth="3" style="font-size: 13px">{{ t('common.noData') }}</NText>
          </div>

          <!-- 按优先级分布 -->
          <div class="stats-section">
            <NText strong style="font-size: 15px; margin-bottom: 12px; display: block">{{ t('stats.byPriority') || '按优先级' }}</NText>
            <div class="stats-grid-4">
              <div class="stats-priority-card" style="border-left: 3px solid #ef4444">
                <NText class="stats-card-num">{{ statsData.byPriority[3] || 0 }}</NText>
                <NText depth="3" style="font-size: 12px">{{ t('task.priority3') }}</NText>
              </div>
              <div class="stats-priority-card" style="border-left: 3px solid #f97316">
                <NText class="stats-card-num">{{ statsData.byPriority[2] || 0 }}</NText>
                <NText depth="3" style="font-size: 12px">{{ t('task.priority2') }}</NText>
              </div>
              <div class="stats-priority-card" style="border-left: 3px solid #22c55e">
                <NText class="stats-card-num">{{ statsData.byPriority[1] || 0 }}</NText>
                <NText depth="3" style="font-size: 12px">{{ t('task.priority1') }}</NText>
              </div>
              <div class="stats-priority-card" style="border-left: 3px solid #6b7280">
                <NText class="stats-card-num">{{ statsData.byPriority[0] || 0 }}</NText>
                <NText depth="3" style="font-size: 12px">{{ t('task.priority0') }}</NText>
              </div>
            </div>
          </div>

          <!-- 番茄钟统计 -->
          <div class="stats-section">
            <NText strong style="font-size: 15px; margin-bottom: 12px; display: block">🍅 {{ t('pomodoro.title') }}</NText>
            <div class="stats-pomodoro-row">
              <!-- 任务专注时间环 -->
              <div v-if="pomodoroCurrentTaskMinutes > 0" class="stats-pomodoro-ring-wrap">
                <NProgress
                  type="circle"
                  :percentage="Math.min(100, Math.round((pomodoroCurrentTaskMinutes / 120) * 100))"
                  :stroke-width="10"
                  :size="110"
                  color="#ef4444"
                  :rail-color="'rgba(255,255,255,0.08)'"
                  :show-indicator="false"
                />
                <div class="stats-pomodoro-ring-text">
                  <NText class="stats-pomodoro-ring-min">{{ pomodoroCurrentTaskMinutes }}m</NText>
                  <NText depth="3" style="font-size: 11px">{{ pomodoroTaskDisplay }}</NText>
                </div>
              </div>
              <div v-else class="stats-pomodoro-ring-empty">
                <NProgress
                  type="circle"
                  :percentage="0"
                  :stroke-width="10"
                  :size="110"
                  color="rgba(255,255,255,0.1)"
                  :rail-color="'transparent'"
                  :show-indicator="false"
                />
                <div class="stats-pomodoro-ring-text">
                  <NText depth="3" style="font-size: 12px">{{ pomodoroTaskDisplay ?? t('pomodoro.noTask') }}</NText>
                </div>
              </div>

              <!-- 右侧统计 -->
              <div class="stats-pomodoro-side">
                <div class="stats-pomodoro-side-item">
                  <span class="stats-pomodoro-side-num">{{ pomodoroStore.todayPomodoros }}</span>
                  <span class="stats-pomodoro-side-label">{{ t('pomodoro.today') }}</span>
                </div>
                <div class="stats-pomodoro-side-item">
                  <span class="stats-pomodoro-side-num">{{ pomodoroStore.todayMinutes }}m</span>
                  <span class="stats-pomodoro-side-label">{{ t('pomodoro.todayDuration') }}</span>
                </div>
                <div class="stats-pomodoro-side-item">
                  <span class="stats-pomodoro-side-num">{{ pomodoroStore.weekPomodoros }}</span>
                  <span class="stats-pomodoro-side-label">{{ t('pomodoro.week') }}</span>
                </div>
                <div class="stats-pomodoro-side-item">
                  <span class="stats-pomodoro-side-num">{{ pomodoroStore.weekMinutes }}m</span>
                  <span class="stats-pomodoro-side-label">{{ t('pomodoro.weekDuration') }}</span>
                </div>
              </div>
            </div>
          </div>

          <!-- 习惯统计 -->
          <div class="stats-section">
            <NText strong style="font-size: 15px; margin-bottom: 12px; display: block">🎯 {{ t('habit.title') || '习惯追踪' }}</NText>
            <div class="stats-grid-2">
              <div class="stats-card">
                <NText class="stats-card-num">{{ habitStore.activeHabits.length }}</NText>
                <NText depth="3" style="font-size: 12px">{{ t('habit.count') || '习惯总数' }}</NText>
              </div>
              <div class="stats-card">
                <NText class="stats-card-num">{{ habitStatsCompletedThisWeek }}</NText>
                <NText depth="3" style="font-size: 12px">{{ t('habit.weekCompleted') || '本周完成次数' }}</NText>
              </div>
            </div>
          </div>
        </div>

        <!-- 回收站 view -->
        <div v-else-if="activeNav === 'trash'" class="trash-view">
          <div class="trash-header">
            <NText strong style="font-size: 18px">🗑️ {{ t('trash.title') || '回收站' }}</NText>
            <NText depth="3" style="font-size: 13px; margin-left: 12px">{{ store.deletedTasks.length }} {{ t('trash.deletedCount') || '个已删除任务' }}</NText>
          </div>

          <div v-if="store.deletedTasks.length === 0" class="empty">
            <NText depth="3">{{ t('trash.empty') || '回收站为空' }}</NText>
          </div>

          <NSpace v-else vertical :size="8" style="width: 100%; max-width: 600px; margin-top: 16px">
            <div
              v-for="task in store.deletedTasks"
              :key="task.id"
              class="trash-task-row"
            >
              <div class="trash-task-info">
                <NText :depth="3" style="font-size: 12px">
                  {{ t('trash.deletedAt') || '已删除于' }} {{ task.deletedAt ? new Date(task.deletedAt).toLocaleString() : '未知' }}
                </NText>
                <NText strong style="font-size: 14px; margin-top: 4px">{{ task.title }}</NText>
                <NText v-if="task.description" depth="3" style="font-size: 12px; margin-top: 2px" line-clamp="1">
                  {{ task.description }}
                </NText>
              </div>
              <NSpace :size="4">
                <NButton size="small" type="primary" @click="void store.restoreTask(task.id)">{{ t('task.restore') }}</NButton>
                <NButton size="small" type="error" quaternary @click="void store.permanentDeleteTask(task.id)">{{ t('task.permanentDelete') }}</NButton>
              </NSpace>
            </div>
          </NSpace>

          <div v-if="store.deletedTasks.length > 0" style="margin-top: 24px">
            <NPopconfirm @positive-click="void store.batchPermanentDeleteTasks(store.deletedTasks.map(t => t.id))">
              <template #trigger>
                <NButton type="error" quaternary size="small">{{ t('trash.emptyTrash') || '清空回收站' }}</NButton>
              </template>
              {{ t('trash.confirmEmpty') || '确认永久删除所有' }} {{ store.deletedTasks.length }} {{ t('trash.tasks') || '个任务？此操作不可恢复。' }}
            </NPopconfirm>
          </div>
        </div>

        <!-- 清单 view: task list -->
        <div v-else-if="activeNav === 'list'" class="list-view">
          <NSpace vertical :size="16" style="width: 100%">
            <!-- Control row: view mode + notifications -->
            <NSpace align="center" :size="8" wrap>
              <NButton v-if="reminderEntries.length > 0" size="tiny" quaternary @click="openReminderModal">{{ t('nav.today') || 'Today' }} {{ t('task.setReminder') || 'reminder' }}</NButton>
              <NButton size="tiny" quaternary :disabled="!canUndo" @click="void undo()">{{ t('common.undo') }}</NButton>
              <NButton size="tiny" quaternary :disabled="!canRedo" @click="void redo()">{{ t('common.redo') }}</NButton>
              <NSelect
                v-model:value="taskSortMode"
                size="tiny"
                style="width: 130px"
                :options="[
                  { label: t('task.sortManual'), value: 'manual' },
                  { label: t('task.sortPriority'), value: 'priority' },
                  { label: t('task.sortCreatedAt'), value: 'createdAt' },
                  { label: t('task.sortDueAt'), value: 'dueAt' },
                  { label: t('task.sortTitle'), value: 'title' },
                ]"
              />
              <NButton
                size="tiny"
                quaternary
                :type="viewMode === 'kanban' ? 'primary' : 'default'"
                @click="viewMode = viewMode === 'kanban' ? 'list' : 'kanban'"
              >
                {{ viewMode === 'kanban' ? t('common.listView') : t('common.kanbanView') }}
              </NButton>
              <NButton
                size="tiny"
                quaternary
                :type="viewMode === 'calendar' ? 'primary' : 'default'"
                @click="viewMode = viewMode === 'calendar' ? 'list' : 'calendar'"
              >
                {{ viewMode === 'calendar' ? t('common.listView') : t('common.calendarView') }}
              </NButton>
              <NButton
                size="tiny"
                quaternary
                :type="auth.desktopNotifyEnabled ? 'default' : 'warning'"
                @click="auth.toggleDesktopNotify()"
              >
                {{ auth.desktopNotifyEnabled ? t('common.notifyEnabled') : t('common.notifyDisabled') }}
              </NButton>
            </NSpace>

            <div v-if="viewMode === 'list'" class="task-list-area">
              <div v-if="listEmpty" class="inbox-empty">
                <button type="button" class="inbox-fab" :aria-label="t('task.nlCreateTitle')" @click="openNaturalLanguageCreate">
                  +
                </button>
                <NText depth="3" class="inbox-empty-hint">{{ t('task.createTaskHint') }}</NText>
              </div>
              <div v-else-if="filteredTasks.length === 0" class="empty">
                <NText depth="3">{{ t('task.noTasks') }}</NText>
              </div>
              <div v-else>
                <!-- Batch action bar (shown when items are selected) -->
                <div v-if="selectedTaskIds.size > 0" class="batch-action-bar">
                  <NText depth="2" style="margin-right: 12px">{{ t('task.selectedCount', { n: selectedTaskIds.size }) }}</NText>
                  <NCheckbox
                    :checked="selectedTaskIds.size === flatTaskItems.length && flatTaskItems.length > 0"
                    :indeterminate="selectedTaskIds.size > 0 && selectedTaskIds.size < flatTaskItems.length"
                    @update:checked="(v: boolean) => v ? selectAllVisibleTasks() : clearTaskSelection()"
                    style="margin-right: 8px"
                  >{{ t('common.selectAll') }}</NCheckbox>
                  <NSpace>
                    <NButton size="small" @click="batchSetCompleted(true)">{{ t('task.completed') }}</NButton>
                    <NButton size="small" @click="batchSetCompleted(false)">{{ t('task.markIncomplete') }}</NButton>
                  <NDropdown trigger="click" @select="(key: string) => batchMoveToProject(key)">
                    <NButton size="small">{{ t('task.move') }} ▾</NButton>
                    <template #dropdown>
                      <NDropdownItem
                        v-for="p in projects"
                        :key="p.id"
                        :divided="p.groupId !== undefined"
                      >{{ p.name }}</NDropdownItem>
                      <NDropdownItem key="__none__" :divided="projects.length > 0">{{ t('project.noProject') || '无项目' }}</NDropdownItem>
                    </template>
                  </NDropdown>
                  <NDropdown trigger="click" @select="(key: string) => batchSetPriority(Number(key) as TaskPriority)">
                    <NButton size="small">{{ t('task.setPriority') }} ▾</NButton>
                    <template #dropdown>
                      <NDropdownItem key="0">{{ t('task.priority0') }}</NDropdownItem>
                      <NDropdownItem key="1">{{ t('task.priority1') }}</NDropdownItem>
                      <NDropdownItem key="2">{{ t('task.priority2') }}</NDropdownItem>
                      <NDropdownItem key="3">{{ t('task.priority3') }}</NDropdownItem>
                    </template>
                  </NDropdown>
                  <NButton size="small" @click="batchToggleImportant">{{ t('task.important') }}</NButton>
                  <NButton size="small" type="error" @click="batchDelete">{{ t('task.delete') }}</NButton>
                  <NButton size="small" quaternary @click="clearTaskSelection">{{ t('common.cancel') }}</NButton>
                </NSpace>
              </div>
              <div ref="listContainerRef" class="task-list" :style="{ height: selectedTaskIds.size > 0 ? 'calc(100vh - 220px)' : 'calc(100vh - 160px)', overflow: 'auto' }">
                <div :style="{ height: `${virtualizer.getTotalSize()}px`, position: 'relative', width: '100%' }">
                  <div
                    v-for="vRow in virtualRows"
                    :key="vRow.index"
                    class="task-row"
                    :style="{ position: 'absolute', top: 0, left: 0, width: '100%', transform: `translateY(${vRow.start}px)` }"
                    :data-index="vRow.index"
                    :ref="(el) => { if (el) virtualizer.measureElement(el as HTMLElement); }"
                    :class="{
                      'task-row--done': flatTaskItems[vRow.index]?.task.completed,
                      'task-row--pinned': !flatTaskItems[vRow.index]?.isSubtask && !flatTaskItems[vRow.index]?.task.completed && taskPinScore(flatTaskItems[vRow.index]?.task, todayKey) > 0,
                      'task-row--subtask': flatTaskItems[vRow.index]?.isSubtask,
                      'task-row--drag-over': taskDragOverIndex === vRow.index,
                    }"
                    :draggable="!flatTaskItems[vRow.index]?.task.completed"
                    @dragstart="onTaskDragStart($event, vRow.index)"
                    @dragend="onTaskDragEnd"
                    @dragover.prevent="onTaskDragOver($event, vRow.index)"
                    @dragleave="onTaskDragLeave"
                    @drop.prevent="onTaskDrop(vRow.index)"
                  >
                    <template v-if="flatTaskItems[vRow.index]">
                      <div class="task-row-inner">
                        <div class="task-check">
                          <NCheckbox
                            :checked="selectedTaskIds.has(flatTaskItems[vRow.index]!.task.id)"
                            @update:checked="(v: boolean) => toggleTaskSelection(flatTaskItems[vRow.index]!.task.id, v)"
                            @click.stop
                          />
                          <template v-if="!flatTaskItems[vRow.index]!.isSubtask">
                            <NButton size="tiny" quaternary @click.stop="toggleExpand(flatTaskItems[vRow.index]!.task.id)" style="padding: 0 2px; min-width: 20px">
                              {{ flatTaskItems[vRow.index]!.expanded ? '▾' : '▸' }}
                            </NButton>
                          </template>
                        </div>
                        <div class="task-main" role="button" tabindex="0" @click="openEdit(flatTaskItems[vRow.index]!.task)" @keydown.enter.prevent="openEdit(flatTaskItems[vRow.index]!.task)">
                        <div class="task-title">{{ flatTaskItems[vRow.index]!.task.title }}</div>
                        <NText v-if="flatTaskItems[vRow.index]!.task.description" depth="3" class="task-desc">
                          {{ flatTaskItems[vRow.index]!.task.description }}
                        </NText>
                        <div class="task-meta">
                          <NTag v-if="flatTaskItems[vRow.index]!.task.isImportant" size="small" round type="error" :bordered="false" class="task-meta-tag">
                            {{ t('task.important') }}
                          </NTag>
                          <NTag
                            v-if="isDueTodayOrOverdue(flatTaskItems[vRow.index]!.task)"
                            size="small"
                            round
                            type="warning"
                            :bordered="false"
                            class="task-meta-tag"
                          >
                            {{ t('task.today') }}
                          </NTag>
                          <NTag v-if="isRecurring(flatTaskItems[vRow.index]!.task.repeatRule, false)" size="small" round type="success" :bordered="false" class="task-meta-tag">
                            {{ t('task.daily') }}
                          </NTag>
                          <NTag v-if="flatTaskItems[vRow.index]!.task.startAt" size="small" round :bordered="false" type="info" class="task-meta-tag">
                            {{ t('task.start') }}: {{ new Date(flatTaskItems[vRow.index]!.task.startAt!).toLocaleString() }}
                          </NTag>
                          <NTag v-if="flatTaskItems[vRow.index]!.task.dueAt" size="small" round bordered class="task-meta-tag">
                            {{ new Date(flatTaskItems[vRow.index]!.task.dueAt!).toLocaleString() }}
                          </NTag>
                          <NTag
                            v-if="taskLunarInfo(flatTaskItems[vRow.index]!.task.dueAt)"
                            size="small"
                            round
                            :bordered="false"
                            :type="(taskLunarInfo(flatTaskItems[vRow.index]!.task.dueAt)!.isHoliday ? 'error' : 'default') as any"
                            class="task-meta-tag"
                          >{{ taskLunarInfo(flatTaskItems[vRow.index]!.task.dueAt)!.label }}</NTag>
                          <NTag size="small" round :bordered="false" type="info" class="task-meta-tag">
                            {{ priorityLabel(flatTaskItems[vRow.index]!.task.priority) }}
                          </NTag>
                          <NTag v-if="flatTaskItems[vRow.index]!.task.assigneeId && teamStore.activeTeamId" size="small" round :bordered="false" type="warning" class="task-meta-tag">
                            👤 {{ memberNameById(flatTaskItems[vRow.index]!.task.assigneeId) }}
                          </NTag>
                          <NTag
                            v-for="pid in (flatTaskItems[vRow.index]!.task.projectIds ?? []).slice(0, 5)"
                            :key="pid"
                            size="small"
                            round
                            :bordered="false"
                            type="primary"
                            class="task-meta-tag"
                          >
                            {{ projectLabelById(pid) }}
                          </NTag>
                          <NTag
                            v-for="tid in (flatTaskItems[vRow.index]!.task.tagIds ?? []).slice(0, 3)"
                            :key="tid"
                            size="small"
                            round
                            :bordered="false"
                            class="task-meta-tag"
                            :color="{ color: (activeTags.find(t => t.id === tid)?.color ?? '#6b7280') + '22', textColor: activeTags.find(t => t.id === tid)?.color ?? '#6b7280', borderColor: activeTags.find(t => t.id === tid)?.color ?? '#6b7280' }"
                          >
                            {{ activeTags.find(t => t.id === tid)?.name ?? tid }}
                          </NTag>
                          <NTag
                            v-if="(flatTaskItems[vRow.index]!.task.projectIds ?? []).length > 5"
                            size="small"
                            round
                            :bordered="false"
                            class="task-meta-tag"
                          >
                            +{{ (flatTaskItems[vRow.index]!.task.projectIds ?? []).length - 5 }}
                          </NTag>
                          <NTag
                            v-if="store.subtasksOf(flatTaskItems[vRow.index]!.task.id).length > 0"
                            size="small"
                            round
                            :bordered="false"
                            type="info"
                            class="task-meta-tag"
                          >
                            {{ t('task.subtasks') }} {{ store.subtasksOf(flatTaskItems[vRow.index]!.task.id).length }}
                          </NTag>
                          <NTag
                            v-if="getBlockingTasks(flatTaskItems[vRow.index]!.task).length > 0"
                            size="small"
                            round
                            :bordered="false"
                            type="warning"
                            class="task-meta-tag"
                          >
                            🔗 {{ t('task.waiting') }}: {{ getBlockingTasks(flatTaskItems[vRow.index]!.task)[0]?.title }}
                          </NTag>
                        </div>
                      </div>
                      <div class="task-actions">
                        <NButton
                          size="small"
                          quaternary
                          :type="flatTaskItems[vRow.index]!.task.completed ? 'success' : 'default'"
                          @click.stop="onTaskCompleteClick(flatTaskItems[vRow.index]!.task)"
                        >
                          {{ flatTaskItems[vRow.index]!.task.completed ? '✓ ' + t('task.completed') : '○ ' + t('task.pending') }}
                        </NButton>
                        <NButton size="small" quaternary type="error" @click.stop="removeTask(flatTaskItems[vRow.index]!.task)">
                          {{ t('task.delete') }}
                        </NButton>
                        <NButton size="small" quaternary @click.stop="openAddSubtask(flatTaskItems[vRow.index]!.task)">
                          +{{ t('task.subtasks') }}
                        </NButton>
                      </div>
                    </div><!-- end .task-row-inner -->
                      <div
                        v-if="(flatTaskItems[vRow.index]!.task.attachments ?? []).length > 0"
                        class="task-att-slot"
                        @click.stop
                      >
                        <div class="att-cards-grid att-cards-grid--task-inline">
                          <div
                            v-for="att in flatTaskItems[vRow.index]!.task.attachments ?? []"
                            :key="att.id"
                            class="att-card att-card--inline"
                            role="group"
                            :aria-label="`${att.name} 附件操作`"
                          >
                            <div class="att-card-icon att-card-icon--inline" aria-hidden="true">
                              {{ getAttachmentVisual(att).icon }}
                            </div>
                            <div class="att-card-main att-card-main--inline">
                              <div class="att-card-name att-card-name--inline" :title="att.name">{{ att.name }}</div>
                              <div class="att-card-type att-card-type--inline">{{ getAttachmentVisual(att).typeLabel }}</div>
                            </div>
                            <div class="att-card-actions att-card-actions--inline">
                              <NButton v-if="canPreviewAttachment(att)" size="tiny" secondary @click="openPreview(att)">
                                {{ t('common.preview') || '预览' }}
                              </NButton>
                              <NButton size="tiny" secondary @click="downloadAttachment(att)">{{ t('common.download') || '下载' }}</NButton>
                            </div>
                          </div>
                        </div>
                      </div>
                      <!-- 内联添加子任务 -->
                      <div v-if="!flatTaskItems[vRow.index]!.isSubtask && addingSubtaskFor === flatTaskItems[vRow.index]!.task.id" class="subtask-add-inline" @click.stop>
                        <NInput
                          v-model:value="newSubtaskTitleInput"
                          size="small"
                          placeholder="{{ t('task.subtaskPlaceholder') || '输入子任务标题，回车确认' }}"
                          style="flex:1"
                          autofocus
                          @keydown.enter.prevent="submitSubtask"
                          @keydown.esc.prevent="cancelSubtaskInput"
                        />
                        <NButton size="small" type="primary" @click="submitSubtask">{{ t('common.add') }}</NButton>
                        <NButton size="small" quaternary @click="cancelSubtaskInput">{{ t('common.cancel') }}</NButton>
                      </div>
                    </template>
                  </div>
                </div>
              </div>
              </div>
            </div>
            <CalendarView v-else-if="viewMode === 'calendar'" @edit-task="openEdit" />
            <div v-else class="kanban-board">
              <div v-for="col in kanbanBoard" :key="col.project.id" class="kanban-column">
                <div class="kanban-column-header">
                  <span class="kanban-column-dot" :style="{ background: col.project.color || '#888' }"></span>
                  <span class="kanban-column-name">{{ col.project.name }}</span>
                  <span class="kanban-column-count">{{ col.tasks.length }}</span>
                </div>
                <div class="kanban-column-body">
                  <div
                    v-for="task in col.tasks"
                    :key="task.id"
                    class="kanban-card"
                    :class="{ 'kanban-card--completed': task.completed }"
                    @click="openEdit(task)"
                  >
                    <div class="kanban-card-priority" :class="`priority-${task.priority}`"></div>
                    <div class="kanban-card-title">{{ task.title }}</div>
                    <div v-if="task.dueAt" class="kanban-card-due">
                      <NTag size="tiny" :type="isOverdue(task) ? 'error' : 'default'">
                        {{ formatDateShort(task.dueAt) }}
                      </NTag>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </NSpace>
        </div>
      </NLayoutContent>
    </NLayout>
  </NLayout>

  <NModal
    v-model:show="showNlModal"
    preset="card"
    :title="t('task.nlCreateTitle') || '用自然语言创建任务'"
    style="width: min(560px, 94vw)"
    :mask-closable="false"
  >
    <NText depth="3" style="display: block; margin-bottom: 10px; font-size: 13px; line-height: 1.5">
      {{ t('task.nlCreateHint') }}
    </NText>
    <NInput
      v-model:value="nlRaw"
      type="textarea"
      :placeholder="t('task.nlCreatePlaceholder') || '例：明天下午前把合同发给财务，这件事很重要。第二行可写补充说明。'"
      :autosize="{ minRows: 6, maxRows: 14 }"
    />
    <template #footer>
      <NSpace justify="space-between" style="width: 100%">
        <NButton quaternary @click="openBlankFormFromNl">{{ t('task.nlSkipBlank') }}</NButton>
        <NSpace>
          <NButton @click="showNlModal = false">{{ t('common.cancel') }}</NButton>
          <NButton type="primary" @click="parseNaturalLanguageAndOpenForm">{{ t('task.nlParseAndFill') }}</NButton>
        </NSpace>
      </NSpace>
    </template>
  </NModal>

  <NModal
    v-model:show="showModal"
    preset="card"
    :title="modalTitle"
    style="width: min(640px, 96vw)"
    :mask-closable="false"
  >
    <NForm label-placement="left" label-width="72">
      <NFormItem :label="t('task.projects')">
        <NSelect
          v-model:value="formProjectIds"
          multiple
          filterable
          clearable
          :max-tag-count="3"
          :options="projectSelectOptions"
          :placeholder="t('task.quickInputPlaceholder') || '输入文字直接创建'"
          style="width: 100%"
          :on-create="onCreateProject"
          tag
        />
      </NFormItem>
      <NFormItem :label="t('task.tags')">
        <NSelect
          v-model:value="formTagIds"
          multiple
          filterable
          clearable
          :max-tag-count="4"
          :options="tagSelectOptions"
          :placeholder="t('task.quickInputPlaceholder') || '输入文字直接创建'"
          style="width: 100%"
          :on-create="onCreateTag"
          tag
        />
      </NFormItem>
      <NFormItem :label="t('task.dependOn')">
        <NSelect
          v-model:value="formDependsOn"
          multiple
          filterable
          clearable
          :max-tag-count="3"
          :options="dependTaskOptions"
          :placeholder="t('task.selectDependency') || '选择前置任务（可选）'"
          style="width: 100%"
        />
      </NFormItem>
      <NFormItem :label="t('task.title')">
        <NInput v-model:value="formTitle" :placeholder="t('task.titlePlaceholder') || '要做什么？'" />
      </NFormItem>
      <NFormItem :label="t('task.description')">
        <NInput
          v-model:value="formDescription"
          type="textarea"
          :placeholder="t('task.descriptionPlaceholder') || '可选'"
          :autosize="{ minRows: 3, maxRows: 8 }"
        />
      </NFormItem>

      <!-- 任务评论 -->
      <template v-if="editing">
        <NDivider />
        <div class="task-comments-section">
          <NText strong style="font-size: 14px; margin-bottom: 10px; display: block">{{ t('comment.title') || 'Comments' }}</NText>
          <div v-if="commentState && commentState.loading.value" class="empty">
            <NText depth="3" style="font-size: 12px">{{ t('common.loading') }}</NText>
          </div>
          <div v-else-if="commentState && commentState.comments.value.length === 0" class="empty" style="padding: 12px 0">
            <NText depth="3" style="font-size: 12px">{{ t('comment.noComments') || '暂无评论' }}</NText>
          </div>
          <div v-else class="comment-list">
            <div v-for="c in (commentState?.comments.value ?? [])" :key="c.id" class="comment-item">
              <div class="comment-header">
                <NText strong style="font-size: 13px">{{ c.authorName }}</NText>
                <NText depth="3" style="font-size: 11px; margin-left: 8px">{{ new Date(c.createdAt).toLocaleString() }}</NText>
                <NButton size="tiny" quaternary type="error" style="margin-left: auto" @click="void commentState?.remove(c.id)">{{ t('common.delete') }}</NButton>
              </div>
              <div class="comment-content">{{ c.content }}</div>
            </div>
          </div>
          <div class="comment-add">
            <NInput
              v-model:value="commentState!.newCommentText.value"
              type="textarea"
              :placeholder="t('comment.addPlaceholder') || '添加评论...'"
              :autosize="{ minRows: 2, maxRows: 5 }"
              style="width: 100%"
            />
            <NButton
              size="small"
              type="primary"
              style="margin-top: 6px"
              :disabled="!commentState?.newCommentText.value.trim()"
              @click="void commentState?.add()"
            >
              {{ t('common.send') || '发送' }}
            </NButton>
          </div>
        </div>
      </template>

      <NFormItem :label="t('task.startDate')">
        <NDatePicker v-model:value="formStart" type="datetime" clearable style="width: 100%" />
      </NFormItem>
      <NFormItem :label="t('task.dueDate')">
        <NDatePicker v-model:value="formDue" type="datetime" clearable style="width: 100%" />
      </NFormItem>
      <NFormItem :label="t('task.priority')">
        <NSelect v-model:value="formPriority" :options="priorityOptions" />
      </NFormItem>
      <NFormItem :label="t('task.important')">
        <NSwitch v-model:value="formIsImportant" /> <NText depth="3" style="margin-left: 8px">{{ t('task.setImportantReminder') || 'Pin to top and set reminder' }}</NText>
      </NFormItem>
      <NFormItem v-if="teamStore.activeTeamId && assigneeOptions.length > 0" :label="t('task.assignee') || 'Assignee'">
        <NSelect
          v-model:value="formAssigneeId"
          :options="assigneeOptions"
          clearable
          :placeholder="t('task.selectAssignee') || '选择成员（可选）'"
          style="width: 100%"
        />
      </NFormItem>
      <NFormItem :label="t('task.recurring')">
        <NSwitch v-model:value="formRepeatEnabled" />
      </NFormItem>
      <template v-if="formRepeatEnabled">
        <!-- 快捷预设按钮 -->
        <NFormItem :show-feedback="false">
          <NSpace>
            <NButton
              v-for="(preset, index) in REPEAT_PRESETS"
              :key="index"
              size="small"
              :type="activePreset(preset) ? 'primary' : 'default'"
              :quaternary="!activePreset(preset)"
              @click="applyRepeatPreset(preset)"
            >
              {{ preset.label }}
            </NButton>
            <NButton size="small" quaternary @click="formRepeatAdvanced = !formRepeatAdvanced">
              {{ formRepeatAdvanced ? t('common.collapse') : t('common.advanced') }}
            </NButton>
          </NSpace>
        </NFormItem>
        <!-- 高级配置 -->
        <template v-if="formRepeatAdvanced">
          <NFormItem :label="t('task.repeatFrequency') || 'Frequency'" :show-feedback="false">
            <NRadioGroup v-model:value="formRRuleConfig.freq">
              <NRadioButton value="DAILY">{{ t('task.daily') }}</NRadioButton>
              <NRadioButton value="WEEKLY">{{ t('task.weekly') }}</NRadioButton>
              <NRadioButton value="MONTHLY">{{ t('task.monthly') }}</NRadioButton>
              <NRadioButton value="YEARLY">{{ t('task.yearly') }}</NRadioButton>
            </NRadioGroup>
          </NFormItem>
          <NFormItem :label="t('task.repeatInterval') || 'Interval'" :show-feedback="false">
            <NInputNumber v-model:value="formRRuleConfig.interval" :min="1" :max="99" />
            <NText depth="3" style="margin-left: 8px">{{ freqLabel(formRRuleConfig.freq) }}</NText>
          </NFormItem>
          <NFormItem v-if="formRRuleConfig.freq === 'WEEKLY'" :label="t('task.repeatOn') || 'Repeat On'" :show-feedback="false">
            <NCheckboxGroup v-model:value="formRRuleConfig.byweekday">
              <NSpace>
                <NCheckbox v-for="(day, i) in WEEKDAY_OPTIONS" :key="i" :value="i">{{ day }}</NCheckbox>
              </NSpace>
            </NCheckboxGroup>
          </NFormItem>
          <NFormItem :label="t('task.repeatEnd') || 'End'" :show-feedback="false">
            <NRadioGroup v-model:value="formRRuleConfig.endType">
              <NRadio value="NEVER">{{ t('task.repeatNever') }}</NRadio>
              <NRadio value="COUNT">{{ t('task.repeatCount') }}</NRadio>
              <NRadio value="UNTIL">{{ t('task.repeatUntil') }}</NRadio>
            </NRadioGroup>
          </NFormItem>
          <NFormItem v-if="formRRuleConfig.endType === 'COUNT'" :label="t('task.repeatCount') || 'Count'" :show-feedback="false">
            <NInputNumber v-model:value="formRRuleConfig.count" :min="1" :max="9999" />
          </NFormItem>
          <NFormItem v-if="formRRuleConfig.endType === 'UNTIL'" :label="t('task.repeatEndDate') || 'End Date'" :show-feedback="false">
            <NDatePicker v-model:value="formRRuleConfig.until" type="date" clearable style="width: 100%" />
          </NFormItem>
        </template>
      </template>
      <NFormItem :label="t('task.setReminder')">
        <NSpace vertical :size="8" style="width: 100%">
          <div style="display: flex; align-items: center; gap: 8px;">
            <NSwitch v-model:value="formNotifyEnabled" />
            <NText depth="3" style="font-size: 13px">{{ t('task.reminderDesktop') || '到期时发送桌面提醒' }}</NText>
          </div>
          <!-- 提醒时间选择 -->
          <div v-if="formNotifyEnabled" class="reminder-settings">
            <NText depth="3" style="font-size: 12px; display: block; margin-bottom: 6px;">{{ t('task.reminderAdvance') || '提前提醒' }}</NText>
            <NSpace vertical :size="6">
              <NSpace :size="4" wrap>
                <NCheckbox
                  v-for="preset in REMINDER_PRESETS"
                  :key="preset.value"
                  :checked="formReminderPresets.includes(preset.value)"
                  @update:checked="(checked: boolean) => toggleReminderPreset(preset.value, checked)"
                >
                  {{ preset.label }}
                </NCheckbox>
              </NSpace>
              <!-- 自定义时间点 -->
              <div v-if="formCustomReminderTimes.length > 0" style="margin-top: 4px;">
                <NTag
                  v-for="(time, idx) in formCustomReminderTimes"
                  :key="idx"
                  size="small"
                  closable
                  @close="removeCustomReminderTime(idx)"
                >
                  {{ formatCustomReminderTime(time) }}
                </NTag>
              </div>
              <NButton size="tiny" dashed @click="showAddReminderTimeModal = true">
                + {{ t('task.addCustomReminder') || '添加自定义提醒时间' }}
              </NButton>
            </NSpace>
          </div>
        </NSpace>
      </NFormItem>
      <NFormItem :label="t('task.locationReminder')">
        <NSpace vertical :size="8" style="width: 100%">
          <NButton size="small" dashed @click="openAddLocationReminder">
            + {{ t('task.addLocationReminder') || '添加位置提醒' }}
          </NButton>
          <div v-if="formLocationReminders.length > 0" class="location-reminder-list">
            <div
              v-for="(reminder, idx) in formLocationReminders"
              :key="idx"
              class="location-reminder-item"
            >
              <NTag :type="reminder.enabled ? 'success' : 'default'" size="small">
                {{ reminder.reminderType === "arrival" ? t('task.arrival') : t('task.departure') }}
              </NTag>
              <NText depth="2" style="margin-left: 6px">{{ reminder.locationName }}</NText>
              <NText depth="3" style="margin-left: 4px; font-size: 12px">
                ({{ reminder.latitude!.toFixed(4) }}, {{ reminder.longitude!.toFixed(4) }})
              </NText>
              <NSpace style="margin-left: auto">
                <NButton size="tiny" quaternary @click="openEditLocationReminder(idx)">{{ t('common.edit') }}</NButton>
                <NButton size="tiny" quaternary type="error" @click="removeLocationReminder(idx)">{{ t('common.delete') }}</NButton>
              </NSpace>
            </div>
          </div>
        </NSpace>
      </NFormItem>
      <NFormItem :label="t('task.attachments')">
        <NSpace vertical :size="12" style="width: 100%">
          <NUpload
            ref="attachmentUploadRef"
            multiple
            :max="remainingAttachmentSlots > 0 ? remainingAttachmentSlots : 1"
            :show-file-list="false"
            :default-upload="true"
            :custom-request="handleCustomRequest"
            :disabled="remainingAttachmentSlots <= 0"
            @exceed="onUploadExceed"
          >
            <NButton secondary dashed size="small" :disabled="remainingAttachmentSlots <= 0">
              {{ t('task.selectFiles') || '选择文件（可多选）' }}
            </NButton>
          </NUpload>
          <NText depth="3" style="font-size: 12px; line-height: 1.45">
            {{ t('task.attachmentHint', { size: formatFileSize(MAX_ATTACHMENT_BYTES), max: MAX_ATTACHMENTS_PER_TASK }) }}
          </NText>

          <div v-for="p in pendingAttachments" :key="p.id" class="att-line att-line--pending">
            <template v-if="p.status === 'reading'">
              <NSpin size="small" />
              <div class="att-line-body">
                <NText class="att-line-name">{{ p.name }}</NText>
                <NText depth="3" class="att-line-size">{{ formatFileSize(p.size) }} · {{ t('task.processing') }}</NText>
                <NProgress type="line" :percentage="p.progress" :show-indicator="false" processing />
              </div>
            </template>
            <template v-else>
              <NText type="error" style="flex-shrink: 0">{{ p.error ?? t('common.failed') }}</NText>
              <div class="att-line-body">
                <NText class="att-line-name">{{ p.name }}</NText>
                <NText depth="3" class="att-line-size">{{ t('task.removeAndReselect') }}</NText>
              </div>
              <NButton size="tiny" quaternary type="error" @click="removePendingAttachment(p.id)">{{ t('common.remove') }}</NButton>
            </template>
          </div>

          <div v-if="formAttachments.length > 0" class="att-cards-grid att-cards-grid--form">
            <div v-for="a in formAttachments" :key="a.id" class="att-card att-card--form" @click.stop>
              <div class="att-card-icon" aria-hidden="true">{{ getAttachmentVisual(a).icon }}</div>
              <div class="att-card-main">
                <div class="att-card-name" :title="a.name">{{ a.name }}</div>
                <div class="att-card-type">{{ getAttachmentVisual(a).typeLabel }} · {{ formatFileSize(a.size) }}</div>
              </div>
              <div class="att-card-actions att-card-actions--form">
                <NButton v-if="canPreviewAttachment(a)" size="tiny" secondary @click.stop="openPreview(a)">{{ t('common.preview') }}</NButton>
                <NButton size="tiny" secondary @click.stop="downloadAttachment(a)">{{ t('common.download') }}</NButton>
                <NButton size="tiny" quaternary type="error" @click.stop="removeFormAttachment(a.id)">{{ t('common.remove') }}</NButton>
              </div>
            </div>
          </div>
        </NSpace>
      </NFormItem>
    </NForm>
    <template #footer>
      <NSpace justify="end">
        <NButton v-if="editing" type="info" tertiary @click="openBatchSubtaskModal(editing.id)">+ {{ t('task.batchAddSubtask') || '批量添加子任务' }}</NButton>
        <NButton @click="showModal = false">{{ t('common.cancel') }}</NButton>
        <NButton type="primary" @click="submitForm">{{ t('common.confirm') }}</NButton>
      </NSpace>
    </template>
  </NModal>

  <!-- 批量添加子任务模板 -->
  <NModal
    v-model:show="showBatchSubtaskModal"
    preset="card"
    :title="t('task.batchAddSubtask')"
    style="width: min(560px, 94vw)"
    :mask-closable="false"
  >
    <NSpace vertical :size="12">
      <NText depth="3" style="font-size: 13px; line-height: 1.5">
        {{ t('task.batchSubtaskHint') || '每行输入一个子任务标题，回车确认后全部添加为当前任务的子任务。' }}
      </NText>

      <!-- 已保存的模板 -->
      <div v-if="subtaskTemplates.length > 0">
        <NText depth="3" style="font-size: 12px; margin-bottom: 6px; display: block">{{ t('task.addFromTemplate') || '从模板添加：' }}</NText>
        <NSpace :size="6" style="flex-wrap: wrap">
          <NTag
            v-for="tpl in subtaskTemplates"
            :key="tpl.id"
            size="small"
            closable
            @close="void deleteTemplate(tpl.id)"
            @click="void applySubtaskTemplate(tpl.id)"
            style="cursor: pointer"
          >
            {{ tpl.name }} ({{ tpl.items.length }})
          </NTag>
        </NSpace>
      </div>

      <!-- 子任务输入区 -->
      <NInput
        v-model:value="batchSubtaskText"
        type="textarea"
        placeholder="Enter subtasks (one per line)"
        :autosize="{ minRows: 5, maxRows: 12 }"
        style="width: 100%"
      />

      <!-- 保存为模板 -->
      <NSpace :size="8" align="center">
        <NInput v-model:value="batchSubtaskTemplateName" :placeholder="t('task.templateNamePlaceholder') || '模板名称（可选）'" style="width: 160px" />
        <NButton size="small" @click="saveSubtaskTemplateFromText">{{ t('task.saveAsTemplate') }}</NButton>
      </NSpace>
    </NSpace>
    <template #footer>
      <NSpace justify="end">
        <NButton @click="showBatchSubtaskModal = false">{{ t('common.cancel') }}</NButton>
        <NButton type="primary" :disabled="!batchSubtaskText.trim()" @click="submitBatchSubtasks">{{ t('common.add') }}</NButton>
      </NSpace>
    </template>
  </NModal>

  <NModal
    v-model:show="showPreviewModal"
    preset="card"
    :title="previewAttachment?.name ?? t('common.preview')"
    style="width: min(960px, 96vw)"
    :mask-closable="true"
  >
    <template v-if="previewAttachment && previewKind === 'image'">
      <div class="preview-image-wrap">
        <img :src="previewAttachment.dataUrl" class="preview-image" :alt="previewAttachment.name">
      </div>
    </template>
    <iframe
      v-else-if="previewAttachment && previewKind === 'pdf'"
      class="preview-iframe"
      :src="previewAttachment.dataUrl"
      :title="previewAttachment.name"
    />
    <template v-else-if="previewAttachment && previewKind === 'text'">
      <NSpin :show="previewTextLoading">
        <NScrollbar style="max-height: min(72vh, 640px)">
          <pre class="preview-text">{{ previewTextContent }}</pre>
        </NScrollbar>
      </NSpin>
    </template>
    <template #footer>
      <NSpace justify="space-between" style="width: 100%">
        <NButton v-if="previewAttachment" tertiary @click="downloadAttachment(previewAttachment)">{{ t('common.download') }}</NButton>
        <NButton type="primary" @click="showPreviewModal = false">{{ t('common.close') }}</NButton>
      </NSpace>
    </template>
  </NModal>

  <NModal
    v-model:show="showCategoryManageModal"
    preset="card"
    :title="(t('project.categoryManagement') as string) || 'Category Management'"
    style="width: min(520px, 94vw)"
    :mask-closable="false"
  >
    <NText depth="3" style="display: block; margin-bottom: 12px; font-size: 13px; line-height: 1.5">
      {{ t('project.categoryManagementHint') || 'Drag the handle on the left to reorder. Default categories (Today, Planned, All, Completed, Inbox) cannot be renamed or deleted; only custom categories can be edited or deleted.' }}
    </NText>
    <NScrollbar style="max-height: min(52vh, 400px)">
      <div class="project-list">
        <div
          v-for="(p, idx) in projects"
          :key="p.id"
          class="project-row"
          @dragover.prevent
          @drop.prevent="onManageDrop(idx)"
        >
          <span
            class="project-drag"
            draggable="true"
            :title="t('project.dragSort')"
            @dragstart="onManageDragStart($event, idx)"
            @dragend="onManageDragEnd"
          >⋮⋮</span>
          <div class="project-row-main project-row-label">
            <NText>{{ p.name }}</NText>
            <NTag v-if="p.builtIn" size="small" round :bordered="false" type="default" style="margin-left: 6px">{{ t('project.defaultTag') || 'Default' }}</NTag>
          </div>
          <div class="project-row-actions">
            <NButton
              v-if="isCustomProject(p)"
              size="tiny"
              quaternary
              @click.stop="openEditProject(p)"
            >
              {{ t('common.edit') }}
            </NButton>
            <NButton
              v-if="isCustomProject(p)"
              size="tiny"
              quaternary
              type="error"
              @click.stop="askDeleteProject(p)"
            >
              {{ t('common.delete') }}
            </NButton>
          </div>
        </div>
      </div>
    </NScrollbar>
    <NDivider style="margin: 14px 0 12px" />
    <NText depth="3" style="display: block; margin-bottom: 8px; font-size: 13px">{{ t('project.addCustomProject') }}</NText>
    <NSpace style="width: 100%">
      <NInput
        v-model:value="newCategoryName"
        maxlength="32"
        show-count
        :placeholder="t('project.newCategoryPlaceholder') || '新分类名称'"
        style="flex: 1; min-width: 0"
        @keydown.enter.prevent="submitNewCategoryInline"
      />
      <NButton type="primary" @click="submitNewCategoryInline">{{ t('common.add') }}</NButton>
    </NSpace>
    <template #footer>
      <NSpace justify="space-between">
        <NButton @click="openExportCsvModal">📥 {{ t('project.exportCsv') }}</NButton>
        <NButton type="primary" @click="showCategoryManageModal = false">{{ t('common.confirm') }}</NButton>
      </NSpace>
    </template>
  </NModal>

  <!-- CSV 导出选择对话框 -->
  <NModal
    v-model:show="showExportCsvModal"
    preset="card"
    :title="(t('project.exportCsv') as string) || '📥 Export Tasks CSV'"
    style="width: min(420px, 90vw)"
  >
    <NSpace vertical :size="16">
      <NText depth="3" style="font-size: 13px; line-height: 1.5">
        {{ t('project.exportCsvHint') || 'Select projects to export (leave empty to export all tasks). Supports multiple selection.' }}
      </NText>
      <NSelect
        v-model:value="exportCsvProjectIds"
        :options="projects.map(p => ({ label: p.name, value: p.id }))"
        multiple
        clearable
        :placeholder="t('export.allProjects') || '全部分类'"
        style="width: 100%"
      />
      <NSpace align="center" :size="8">
        <NCheckbox v-model:checked="exportCsvIncludeCompleted" />
        <NText depth="3" style="font-size: 13px">{{ t('export.includeCompleted') }}</NText>
      </NSpace>
    </NSpace>
    <template #footer>
      <NSpace justify="end">
        <NButton @click="showExportCsvModal = false">{{ t('common.cancel') }}</NButton>
        <NButton type="primary" :loading="exportCsvLoading" @click="doExportCsv">{{ t('common.export') }}</NButton>
      </NSpace>
    </template>
  </NModal>

  <NModal
    v-model:show="showProjectEditModal"
    preset="card"
    :title="projectModalEditingId ? (t('project.editCategory') as string) : (t('project.createCategory') as string)"
    style="width: min(400px, 92vw)"
    :mask-closable="false"
  >
    <NFormItem :label="t('project.name')" label-placement="left" :show-feedback="false">
      <NInput
        v-model:value="projectModalName"
        maxlength="32"
        show-count
        :placeholder="t('project.namePlaceholder')"
        @keydown.enter.prevent="submitProjectEditModal"
      />
    </NFormItem>
    <NFormItem :label="t('project.group')" label-placement="left" :show-feedback="false">
      <NSelect
        v-model:value="projectModalGroupId"
        :options="projectGroupOptions"
        :placeholder="t('project.selectGroup')"
        clearable
      />
    </NFormItem>
    <NFormItem :label="t('project.status') || 'Status'" label-placement="left" :show-feedback="false">
      <NSpace vertical :size="4">
        <NSwitch v-model:value="projectModalArchived">
          <template #checked>{{ t('project.archived') || 'Archived' }}</template>
          <template #unchecked>{{ t('project.notArchived') || 'Not Archived' }}</template>
        </NSwitch>
        <NSwitch v-model:value="projectModalMuted">
          <template #checked>{{ t('project.muted') }}</template>
          <template #unchecked>{{ t('project.notMuted') }}</template>
        </NSwitch>
      </NSpace>
    </NFormItem>
    <template #footer>
      <NSpace justify="end">
        <NButton @click="showProjectEditModal = false">{{ t('common.cancel') }}</NButton>
        <NButton type="primary" @click="submitProjectEditModal">{{ t('common.confirm') }}</NButton>
      </NSpace>
    </template>
  </NModal>

  <NModal
    v-model:show="showDeleteProjectModal"
    preset="card"
    :title="t('project.deleteCategory') as string"
    style="width: min(420px, 92vw)"
    :mask-closable="false"
  >
    <NText style="display: block; line-height: 1.55">
      {{ t('project.deleteConfirm') }}
    </NText>
    <template #footer>
      <NSpace justify="end">
        <NButton @click="showDeleteProjectModal = false">{{ t('common.cancel') }}</NButton>
        <NButton type="error" @click="confirmDeleteProject">{{ t('project.delete') }}</NButton>
      </NSpace>
    </template>
  </NModal>

  <NModal
    v-model:show="showDeleteGroupModal"
    preset="card"
    :title="t('group.deleteGroup') as string"
    style="width: min(420px, 92vw)"
    :mask-closable="false"
  >
    <NText style="display: block; line-height: 1.55">
      {{ t('group.deleteConfirm') }}
    </NText>
    <template #footer>
      <NSpace justify="end">
        <NButton @click="cancelDeleteGroup">{{ t('common.cancel') }}</NButton>
        <NButton type="error" @click="confirmDeleteGroup">{{ t('group.delete') }}</NButton>
      </NSpace>
    </template>
  </NModal>

  <NModal
    v-model:show="showTagManageModal"
    preset="card"
    :title="t('tag.manage')"
    style="width: min(480px, 94vw)"
    :mask-closable="false"
    @after-enter="openNewTagModal"
  >
    <NScrollbar style="max-height: min(40vh, 340px)">
      <NSpace vertical :size="8" style="width: 100%">
        <div
          v-for="tag in sidebarTags"
          :key="tag.id"
          class="tag-row"
        >
          <div
            class="tag-color-dot"
            :style="{ background: tag.color ?? '#6b7280' }"
          />
          <NText class="tag-row-name">{{ tag.name }}</NText>
          <NSpace :size="4">
            <NButton size="tiny" quaternary @click="openEditTag(tag)">{{ t('common.edit') }}</NButton>
            <NButton size="tiny" quaternary type="error" @click="askDeleteTag(tag)">{{ t('common.delete') }}</NButton>
          </NSpace>
        </div>
        <NText v-if="sidebarTags.length === 0" depth="3" style="padding: 8px 0">
          {{ t('tag.noTags') }}
        </NText>
      </NSpace>
    </NScrollbar>
    <NDivider style="margin: 12px 0" />
    <NText depth="3" style="display: block; margin-bottom: 8px; font-size: 13px">{{ t('tag.createNew') }}</NText>
    <NSpace vertical :size="8" style="width: 100%">
      <NInput
        v-model:value="newTagName"
        maxlength="20"
        show-count
        :placeholder="t('tag.namePlaceholder') || '标签名称'"
        @keydown.enter.prevent="submitNewTag"
      />
      <NSpace :size="8" align="center">
        <NText depth="3" style="font-size: 13px">{{ t('tag.color') || 'Color' }}:</NText>
        <NSpace :size="6">
          <button
            v-for="color in PRESET_COLORS"
            :key="color"
            type="button"
            class="color-swatch"
            :class="{ 'color-swatch--active': newTagColor === color }"
            :style="{ background: color }"
            :aria-label="`${t('tag.selectColor')} ${color}`"
            @click="newTagColor = color"
          />
        </NSpace>
      </NSpace>
      <NButton type="primary" style="width: 100%" @click="submitNewTag">{{ t('common.add') }}</NButton>
    </NSpace>
    <template #footer>
      <NSpace justify="end">
        <NButton type="primary" @click="showTagManageModal = false">{{ t('common.done') }}</NButton>
      </NSpace>
    </template>
  </NModal>

  <NModal
    v-model:show="showEditTagModal"
    preset="card"
    :title="t('tag.edit')"
    style="width: min(400px, 90vw)"
    :mask-closable="false"
  >
    <NSpace vertical :size="12" style="width: 100%">
      <NInput
        v-model:value="editingTagName"
        maxlength="20"
        show-count
        :placeholder="t('tag.namePlaceholder') || '标签名称'"
        @keydown.enter.prevent="submitEditTag"
      />
      <NSpace :size="8" align="center">
        <NText depth="3" style="font-size: 13px">{{ t('tag.color') || 'Color' }}:</NText>
        <NSpace :size="6">
          <button
            v-for="color in PRESET_COLORS"
            :key="color"
            type="button"
            class="color-swatch"
            :class="{ 'color-swatch--active': editingTagColor === color }"
            :style="{ background: color }"
            :aria-label="`${t('tag.selectColor')} ${color}`"
            @click="editingTagColor = color"
          />
        </NSpace>
      </NSpace>
    </NSpace>
    <template #footer>
      <NSpace justify="end">
        <NButton @click="showEditTagModal = false">{{ t('common.cancel') }}</NButton>
        <NButton type="primary" @click="submitEditTag">{{ t('common.save') }}</NButton>
      </NSpace>
    </template>
  </NModal>

  <!-- 自定义提醒时间模态框 -->
  <NModal
    v-model:show="showAddReminderTimeModal"
    preset="card"
    :title="t('task.addCustomReminder') as string"
    style="width: min(360px, 90vw)"
  >
    <NText depth="3" style="display: block; margin-bottom: 12px; font-size: 13px">
      {{ t('task.customReminderHint') || '设置一个独立于截止日期的自定义提醒时间点。' }}
    </NText>
    <NDatePicker
      v-model:value="newCustomReminderTime"
      type="datetime"
      clearable
      style="width: 100%"
      :placeholder="t('task.selectReminderTime') || '选择提醒时间'"
    />
    <template #footer>
      <NSpace justify="end">
        <NButton @click="showAddReminderTimeModal = false">{{ t('common.cancel') }}</NButton>
        <NButton type="primary" :disabled="!newCustomReminderTime" @click="addCustomReminderTime">{{ t('common.add') }}</NButton>
      </NSpace>
    </template>
  </NModal>

  <!-- 地理位置提醒模态框 -->
  <NModal
    v-model:show="showLocationReminderModal"
    preset="card"
    :title="t('task.addLocationReminder') as string"
    style="width: min(400px, 90vw)"
  >
    <NForm label-placement="left" label-width="80">
      <NFormItem :label="t('task.locationName') || '地点名称'">
        <NInput
          v-model:value="editingLocationReminder.locationName"
          :placeholder="t('task.locationPlaceholder') || '例如：公司、家、健身房'"
          clearable
        />
      </NFormItem>
      <NFormItem :label="t('task.reminderType') || '提醒类型'">
        <NSelect
          v-model:value="editingLocationReminder.reminderType"
          :options="[
            { label: t('task.arrivalReminder') || '到达提醒', value: 'arrival' },
            { label: t('task.departureReminder') || '离开提醒', value: 'departure' },
          ]"
          style="width: 100%"
        />
      </NFormItem>
      <NFormItem :label="t('task.locationCoords') || '位置坐标'">
        <NSpace vertical :size="8" style="width: 100%">
          <NSpace>
            <NInputNumber
              v-model:value="editingLocationReminder.latitude"
              :precision="6"
              :placeholder="t('task.latitude') || '纬度'"
              style="width: 140px"
            />
            <NInputNumber
              v-model:value="editingLocationReminder.longitude"
              :precision="6"
              :placeholder="t('task.longitude') || '经度'"
              style="width: 140px"
            />
          </NSpace>
          <NButton size="small" dashed @click="useCurrentLocation">
            {{ t('task.useCurrentLocation') || '使用当前 GPS 位置' }}
          </NButton>
        </NSpace>
      </NFormItem>
      <NFormItem :label="t('task.fenceRadius') || '围栏半径'">
        <NSpace vertical :size="4">
          <NSpace :size="4">
            <NInputNumber
              v-model:value="editingLocationReminder.radius"
              :min="10"
              :max="1000"
              :step="10"
              style="width: 120px"
            />
            <NText depth="3" style="line-height: 32px">{{ t('task.meters') || '米' }}</NText>
          </NSpace>
          <NText depth="3" style="font-size: 12px">{{ t('task.fenceRadiusHint') || '进入或离开此范围时触发提醒' }}</NText>
        </NSpace>
      </NFormItem>
      <NFormItem :label="t('common.enabled') || '启用'">
        <NSwitch v-model:value="editingLocationReminder.enabled" />
      </NFormItem>
      <NText v-if="locationReminderError" depth="3" style="font-size: 12px; display: block; margin-top: 4px">
        {{ locationReminderError }}
      </NText>
    </NForm>
    <template #footer>
      <NSpace justify="end">
        <NButton @click="showLocationReminderModal = false">{{ t('common.cancel') }}</NButton>
        <NButton type="primary" @click="saveLocationReminder">{{ t('common.save') }}</NButton>
      </NSpace>
    </template>
  </NModal>

  <NModal
    v-model:show="showReminderModal"
    preset="card"
    :title="t('task.todayFocusReminder') || 'Today Focus Reminder'"
    style="width: min(520px, 92vw)"
    :mask-closable="false"
  >
    <NText depth="3" style="display: block; margin-bottom: 14px; font-size: 13px">
      {{ t('task.todayFocusReminderHint') || 'Tasks marked as Important, Due Today/Overdue, or Daily are sorted to the top of the list.' }}
    </NText>
    <div class="reminder-list">
      <div v-for="row in reminderEntries" :key="row.task.id" class="reminder-row">
        <div class="reminder-title">{{ row.task.title }}</div>
        <NSpace :size="6" style="margin-top: 6px; flex-wrap: wrap">
          <NTag v-for="k in row.kinds" :key="k" size="small" round :type="k === 'important' ? 'error' : k === 'today' ? 'warning' : 'success'">
            {{ t(`task.${k}`) }}
          </NTag>
        </NSpace>
      </div>
    </div>
    <template #footer>
      <NSpace justify="end">
        <NButton type="primary" @click="dismissReminder">{{ t('common.ok') }}</NButton>
      </NSpace>
    </template>
  </NModal>

  <!-- 习惯创建/编辑模态框 -->
  <NModal
    v-model:show="showAddHabitModal"
    preset="card"
    :title="editingHabit ? (t('habit.edit') || '编辑习惯') : (t('habit.create') || '新建习惯')"
    style="width: min(400px, 90vw)"
  >
    <NForm label-placement="left" label-width="72">
      <NFormItem :label="t('habit.name') || '名称'">
        <NInput v-model:value="habitFormName" :placeholder="t('habit.namePlaceholder') || '习惯名称，如：每天运动'" />
      </NFormItem>
      <NFormItem :label="t('habit.frequency') || '频率'">
        <NSelect
          v-model:value="habitFormFreq"
          :options="[
            { label: t('habit.daily') || '每天', value: 'daily' },
            { label: t('habit.weekly') || '每周', value: 'weekly' },
            { label: t('habit.custom') || '自定义', value: 'custom' },
          ]"
        />
      </NFormItem>
      <NFormItem v-if="habitFormFreq === 'weekly'" :label="t('habit.repeatOn') || '重复于'">
        <NSpace vertical :size="4">
          <NSpace :size="4">
            <NCheckbox
              v-for="(day, idx) in WEEKDAY_OPTIONS"
              :key="idx"
              :checked="habitFormWeekDays.includes(idx)"
              @update:checked="(checked: boolean) => {
                if (checked) habitFormWeekDays = [...habitFormWeekDays, idx];
                else habitFormWeekDays = habitFormWeekDays.filter(d => d !== idx);
              }"
            >
              {{ t('habit.week') }}{{ day }}
            </NCheckbox>
          </NSpace>
        </NSpace>
      </NFormItem>
      <NFormItem :label="t('tag.color')">
        <NSpace :size="4">
          <span
            v-for="color in PRESET_COLORS.slice(0, 8)"
            :key="color"
            class="color-swatch"
            :class="{ 'color-swatch--active': habitFormColor === color }"
            :style="{ background: color }"
            @click="habitFormColor = color"
          ></span>
        </NSpace>
      </NFormItem>
    </NForm>
    <template #footer>
      <NSpace justify="end">
        <NButton @click="showAddHabitModal = false">{{ t('common.cancel') }}</NButton>
        <NButton type="primary" @click="submitHabit">{{ t('common.confirm') }}</NButton>
      </NSpace>
    </template>
  </NModal>

  <!-- 笔记对话框 -->
  <NModal v-model:show="showNoteModal">
    <NCard
      :title="editingNote ? (t('note.edit') || '编辑笔记') : (t('note.create') || '新建笔记')"
      style="width: min(600px, 95vw)"
      :bordered="false"
    >
      <NForm>
        <NFormItem :label="t('note.title') || '标题'" required>
          <NInput v-model:value="noteFormTitle" :placeholder="t('note.titlePlaceholder') || '输入笔记标题'" />
        </NFormItem>
        <NFormItem :label="t('note.markdown') || 'Markdown'">
          <NSpace vertical :size="8">
            <NSwitch v-model:value="noteFormIsMarkdown">
              <template #checked>{{ t('note.enableMarkdown') || '启用 Markdown' }}</template>
              <template #unchecked>{{ t('note.plainText') || '纯文本' }}</template>
            </NSwitch>
            <NSpace v-if="noteFormIsMarkdown" :size="4">
              <NButton size="tiny" :type="!notePreviewMode ? 'primary' : 'default'" @click="notePreviewMode = false">
                {{ t('note.edit') || '编辑' }}
              </NButton>
              <NButton size="tiny" :type="notePreviewMode ? 'primary' : 'default'" @click="notePreviewMode = true">
                {{ t('note.preview') || '预览' }}
              </NButton>
            </NSpace>
          </NSpace>
        </NFormItem>
        <NFormItem v-if="noteFormIsMarkdown && notePreviewMode" :label="t('note.content') || '内容'">
          <div class="markdown-preview" v-html="noteFormContent ? marked(noteFormContent) : '<span style=\'color:#888\'>' + (t('note.noContent') || '无内容') + '</span>'" />
        </NFormItem>
        <NFormItem v-else :label="t('note.content') || '内容'">
          <NInput
            v-model:value="noteFormContent"
            type="textarea"
            :placeholder="noteFormIsMarkdown ? (t('note.markdownPlaceholder') || '输入 Markdown 内容...') : (t('note.contentPlaceholder') || '输入笔记内容（可选）')"
            :rows="8"
          />
        </NFormItem>
      </NForm>
      <template #footer>
        <NSpace justify="space-between">
          <NButton
            v-if="editingNote"
            type="error"
            quaternary
            @click="() => { deleteNote(editingNote!.id); showNoteModal = false; }"
          >
            {{ t('common.delete') }}
          </NButton>
          <NSpace justify="end">
            <NButton @click="showNoteModal = false">{{ t('common.cancel') }}</NButton>
            <NButton type="primary" @click="submitNote">{{ t('common.confirm') }}</NButton>
          </NSpace>
        </NSpace>
      </template>
    </NCard>
  </NModal>

  <!-- 智能清单编辑模态框 -->
  <NModal v-model:show="showSmartListModal" preset="card" :title="editingSmartList ? (t('smartlist.edit') || '编辑智能清单') : (t('smartlist.create') || '新建智能清单')" style="width: 480px" :bordered="false">
    <NSpace vertical :size="12">
      <NFormItem :label="t('smartlist.name') || '名称'" :show-feedback="false">
        <NInput v-model:value="smartListFormName" :placeholder="t('smartlist.namePlaceholder') || '例如：高优先级今日任务'" />
      </NFormItem>
      <NFormItem :label="t('smartlist.color') || '颜色'" :show-feedback="false">
        <NSpace>
          <div
            v-for="c in PRESET_COLORS"
            :key="c"
            class="color-swatch"
            :style="{ background: c }"
            :class="{ 'color-swatch--selected': smartListFormColor === c }"
            @click="smartListFormColor = c"
          ></div>
        </NSpace>
      </NFormItem>
      <NFormItem :label="t('smartlist.builtinView') || '内置视图'" :show-feedback="false">
        <NSelect
          v-model:value="smartListFormBuiltinView"
          :options="builtinViews.map(v => ({ label: v.label, value: v.key }))"
          :placeholder="t('smartlist.selectBuiltin') || '选择内置视图（可选）'"
          clearable
          style="width: 100%"
        />
      </NFormItem>
      <NFormItem :label="t('smartlist.projects') || '项目'" :show-feedback="false">
        <NSelect
          v-model:value="smartListFormProjectIds"
          :options="projects.map(p => ({ label: p.name, value: p.id }))"
          :placeholder="t('smartlist.selectProjects') || '选择项目（可选，多选）'"
          multiple
          clearable
          style="width: 100%"
        />
      </NFormItem>
      <NFormItem :label="t('smartlist.tags') || '标签'" :show-feedback="false">
        <NSelect
          v-model:value="smartListFormTagIds"
          :options="tagStore.activeTags.map(t => ({ label: t.name, value: t.id }))"
          :placeholder="t('smartlist.selectTags') || '选择标签（可选，多选）'"
          multiple
          clearable
          style="width: 100%"
        />
      </NFormItem>
      <NFormItem :label="t('smartlist.priorityRange') || '优先级范围'" :show-feedback="false">
        <NSpace>
          <NInputNumber v-model:value="smartListFormPriorityMin" :min="0" :max="3" :placeholder="t('smartlist.min') || '最低'" style="width: 80px" />
          <NText depth="3">{{ t('smartlist.to') || '至' }}</NText>
          <NInputNumber v-model:value="smartListFormPriorityMax" :min="0" :max="3" :placeholder="t('smartlist.max') || '最高'" style="width: 80px" />
        </NSpace>
      </NFormItem>
      <NFormItem :show-feedback="false">
        <NSpace vertical :size="4">
          <NSwitch v-model:value="smartListFormIsImportant" />
          <NText depth="3" style="font-size: 12px">{{ t('smartlist.importantOnly') || '仅显示重要任务' }}</NText>
        </NSpace>
      </NFormItem>
      <NFormItem :label="t('smartlist.dueDateRange') || '截止日期范围'" :show-feedback="false">
        <NSpace vertical :size="4" style="width: 100%">
          <NDatePicker v-model:value="smartListFormDueFrom" type="date" :placeholder="t('smartlist.from') || '从（可选）'" clearable style="width: 100%" />
          <NDatePicker v-model:value="smartListFormDueTo" type="date" :placeholder="t('smartlist.to') || '至（可选）'" clearable style="width: 100%" />
        </NSpace>
      </NFormItem>
      <NFormItem :label="t('smartlist.searchKeyword') || '搜索关键字'" :show-feedback="false">
        <NInput v-model:value="smartListFormSearchText" :placeholder="t('smartlist.searchPlaceholder') || '在标题/描述中搜索（可选）'" />
      </NFormItem>
    </NSpace>
    <template #footer>
      <NSpace justify="end">
        <NButton @click="showSmartListModal = false">{{ t('common.cancel') }}</NButton>
        <NButton type="primary" @click="submitSmartList">{{ t('common.confirm') }}</NButton>
      </NSpace>
    </template>
  </NModal>

  <!-- 创建团队对话框 -->
  <NModal v-model:show="showCreateTeamDialog">
    <NCard :title="t('team.create') as string" style="width: 400px" :bordered="false">
      <NFormItem :label="t('team.name')">
        <NInput v-model:value="newTeamName" :placeholder="t('team.namePlaceholder') || '输入团队名称'" @keydown.enter.prevent="handleCreateTeam" />
      </NFormItem>
      <template #footer>
        <NSpace justify="end">
          <NButton @click="showCreateTeamDialog = false">{{ t('common.cancel') }}</NButton>
          <NButton type="primary" :disabled="!newTeamName.trim()" @click="handleCreateTeam">{{ t('common.create') || '创建' }}</NButton>
        </NSpace>
      </template>
    </NCard>
  </NModal>

  <!-- 邀请成员对话框 -->
  <NModal v-model:show="showInviteDialog">
    <NCard :title="t('team.invite') || '邀请成员'" style="width: 400px" :bordered="false">
      <NFormItem :label="t('auth.email') || '邮箱'">
        <NInput v-model:value="inviteEmail" :placeholder="t('team.emailPlaceholder') || '输入成员邮箱'" />
      </NFormItem>
      <NFormItem :label="t('team.role') || '角色'">
        <NRadioGroup v-model:value="inviteRole">
          <NRadioButton value="admin">{{ t('team.admin') || '管理员' }}</NRadioButton>
          <NRadioButton value="member">{{ t('team.member') || '成员' }}</NRadioButton>
          <NRadioButton value="guest">{{ t('team.guest') || '访客' }}</NRadioButton>
        </NRadioGroup>
      </NFormItem>
      <template #footer>
        <NSpace justify="end">
          <NButton @click="showInviteDialog = false">{{ t('common.cancel') }}</NButton>
          <NButton type="primary" :disabled="!inviteEmail.trim()" @click="handleInviteMember">{{ t('team.invite') || '邀请' }}</NButton>
        </NSpace>
      </template>
    </NCard>
  </NModal>

  <!-- 成员管理对话框 -->
  <NModal v-model:show="showTeamMembersDialog">
    <NCard :title="t('team.members') || '成员管理'" style="width: 480px" :bordered="false">
      <NSpace vertical :size="12">
        <template v-if="teamStore.myRole === 'owner'">
          <NText depth="3" style="font-size: 12px;">{{ t('team.transferOwnerHint') || '转让队长所有权给其他成员，转让后你将成为管理员' }}</NText>
          <NSelect
            v-model:value="transferOwnerTarget"
            :options="teamStore.members.filter(m => m.role !== 'owner').map(m => ({ label: m.userUsername || m.userEmail, value: m.id }))"
            :placeholder="t('team.selectNewOwner') || '选择新队长'"
            size="small"
            style="width: 100%"
          />
          <NButton
            type="warning"
            size="small"
            :disabled="!transferOwnerTarget"
            @click="void handleTransferOwnership()"
          >{{ t('team.confirmTransfer') || '确认转让' }}</NButton>
          <NDivider />
        </template>
        <div v-for="member in teamStore.members" :key="member.id" style="display: flex; align-items: center; gap: 12px;">
          <div style="flex: 1;">
            <NText>{{ member.userUsername || member.userEmail }}</NText>
            <NText depth="3" style="font-size: 12px; margin-left: 8px;">{{ roleLabel(member.role) }}</NText>
          </div>
          <NSelect
            v-if="teamStore.canManageTeam"
            :value="member.role"
            :options="[
              { label: t('team.admin') || '管理员', value: 'admin' },
              { label: t('team.member') || '成员', value: 'member' },
              { label: t('team.guest') || '访客', value: 'guest' },
            ]"
            size="tiny"
            style="width: 100px"
            @update:value="(role) => teamStore.updateMemberRole(teamStore.activeTeamId!, member.id, role)"
          />
          <NButton
            v-if="teamStore.canManageTeam && member.role !== 'owner'"
            size="tiny"
            type="error"
            @click="teamStore.removeMember(teamStore.activeTeamId!, member.id)"
          >{{ t('common.remove') }}</NButton>
        </div>
        <NDivider />
        <NInput v-model:value="inviteEmail" :placeholder="t('team.emailPlaceholder') || '输入邮箱邀请成员'" />
        <NSelect
          v-model:value="inviteRole"
          :options="[
            { label: t('team.admin') || '管理员', value: 'admin' },
            { label: t('team.member') || '成员', value: 'member' },
            { label: t('team.guest') || '访客', value: 'guest' },
          ]"
          :placeholder="t('team.selectRole') || '选择角色'"
          style="width: 100%"
        />
        <NButton type="primary" @click="void teamStore.inviteMember(teamStore.activeTeamId!, inviteEmail, inviteRole)">{{ t('team.sendInvite') || '发送邀请' }}</NButton>
      </NSpace>
    </NCard>
  </NModal>

  <!-- 自定义时长对话框 -->
  <NModal v-model:show="showCustomDurationModal">
    <NCard :title="t('pomodoro.customDuration') || '自定义时长'" style="width: 320px" :bordered="false">
      <NSpace vertical :size="12">
        <NSpace align="center" :size="12">
          <NText>{{ t('pomodoro.minutes') || '分钟' }}</NText>
          <NInputNumber v-model:value="customDurationVal" :min="1" :max="180" size="small" />
        </NSpace>
        <NSpace justify="end">
          <NButton @click="showCustomDurationModal = false">{{ t('common.cancel') }}</NButton>
          <NButton type="primary" @click="confirmCustomDuration">{{ t('common.confirm') }}</NButton>
        </NSpace>
      </NSpace>
    </NCard>
  </NModal>

  <!-- 浮动按钮组 — 在清单视图显示 -->
  <div v-if="activeNav === 'list'" style="position: fixed; bottom: 24px; right: 24px; z-index: 1000; display: flex; flex-direction: column; gap: 12px; align-items: flex-end;">
    <!-- 创建任务按钮 -->
    <button
      class="create-task-fab"
      :title="t('task.create')"
      @click="openCreate"
    >
      <span style="font-size: 28px; line-height: 1;">+</span>
    </button>
    <!-- 番茄钟 -->
    <PomodoroWidget />
  </div>
</template>

<style scoped>
.quick-add-bar {
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  z-index: 500;
  padding: 10px 20px;
  background: var(--tt-app-bg, #0a0a0f);
  border-bottom: 1px solid rgba(255, 255, 255, 0.06);
}
.quick-add-bar :deep(.n-input) {
  max-width: 720px;
  margin: 0 auto;
  border-radius: 10px;
  box-shadow: 0 2px 12px rgba(0, 0, 0, 0.25);
}
.empty {
  padding: 48px 12px;
  text-align: center;
}
.inbox-empty {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding: 56px 16px 40px;
  gap: 20px;
}
.inbox-fab {
  width: 72px;
  height: 72px;
  border-radius: 50%;
  border: none;
  cursor: pointer;
  font-size: 40px;
  line-height: 1;
  font-weight: 300;
  color: #fff;
  background: linear-gradient(145deg, #36ad6a 0%, #2080f0 100%);
  box-shadow: 0 8px 28px rgba(32, 128, 240, 0.45);
  transition: transform 0.15s ease, box-shadow 0.15s ease;
}
.inbox-fab:hover {
  transform: scale(1.06);
  box-shadow: 0 10px 32px rgba(32, 128, 240, 0.55);
}
.inbox-fab:active {
  transform: scale(0.98);
}
.create-task-fab {
  width: 56px;
  height: 56px;
  border-radius: 50%;
  background: linear-gradient(145deg, #36ad6a 0%, #2080f0 100%);
  border: none;
  cursor: pointer;
  color: #fff;
  display: flex;
  align-items: center;
  justify-content: center;
  box-shadow: 0 6px 24px rgba(32, 128, 240, 0.4);
  transition: transform 0.15s ease, box-shadow 0.15s ease;
}
.create-task-fab:hover {
  transform: scale(1.08);
  box-shadow: 0 8px 28px rgba(32, 128, 240, 0.5);
}
.create-task-fab:active {
  transform: scale(0.96);
}
.inbox-empty-hint {
  max-width: 320px;
  text-align: center;
  line-height: 1.5;
}
.sidebar-builtin-btns {
  display: flex;
  flex-direction: column;
  gap: 4px;
}
.sidebar-project-btns {
  display: flex;
  flex-direction: column;
  gap: 4px;
}
.sidebar-project-item {
  display: flex;
  align-items: center;
  gap: 4px;
  padding: 4px 8px;
  border-radius: 6px;
  cursor: pointer;
  user-select: none;
  transition: background 0.15s;
}
.sidebar-project-item:hover {
  background: var(--tt-row-hover-bg, rgba(255, 255, 255, 0.06));
}
.sidebar-project-item--active {
  background: var(--tt-accent-bg, rgba(24, 160, 255, 0.15));
}
.sidebar-project-item--drag-over {
  background: var(--tt-accent-bg, rgba(24, 160, 255, 0.25));
  outline: 2px dashed var(--tt-hover-border, rgba(24, 160, 255, 0.6));
}
.sidebar-project-item--dragging {
  opacity: 0.5;
}
.sidebar-project-name {
  flex: 1;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.project-group-header {
  display: flex;
  align-items: center;
  gap: 4px;
  padding: 2px 4px;
  cursor: pointer;
  border-radius: 6px;
  user-select: none;
}
.project-group-header:hover {
  background: var(--tt-row-hover-bg, rgba(255,255,255,0.06));
}
.project-group-header--drag-over {
  background: var(--tt-accent-bg, rgba(24, 160, 255, 0.2));
  outline: 2px dashed var(--tt-hover-border, rgba(24, 160, 255, 0.6));
}
.project-group-arrow {
  font-size: 10px;
  color: var(--tt-sidebar-text-muted, #7a8fa8);
  width: 14px;
  text-align: center;
}
.sidebar-tag-btns {
  display: flex;
  flex-direction: column;
  gap: 2px;
}
.tag-item {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 4px 6px;
  border-radius: 6px;
  cursor: pointer;
  transition: background 0.15s;
}
.tag-item:hover {
  background: var(--tt-row-hover-bg, rgba(255, 255, 255, 0.06));
}
.tag-item--selected {
  background: var(--tt-accent-bg, rgba(24, 160, 255, 0.15));
}
.tag-color-dot {
  width: 10px;
  height: 10px;
  border-radius: 50%;
  flex-shrink: 0;
}
.tag-name {
  font-size: 13px;
  color: var(--tt-sidebar-text, #e8edf4);
}
/* Themed sidebar — uses CSS variables set by useTheme() on :root */
.sidebar-themed {
  background: var(--tt-sidebar-bg) !important;
  border-color: var(--tt-sidebar-border) !important;
  min-height: 100vh !important;
}
/* Ensure the entire sidebar background reaches the bottom */
.sidebar-themed > .n-layout-sider-scroll-wrapper,
.sidebar-themed > .n-layout-sider-scroll-wrapper > .n-layout-sider-scroll-content {
  background: var(--tt-sidebar-bg) !important;
  min-height: 100vh !important;
}
.sidebar-themed .n-text {
  color: var(--tt-sidebar-text-muted) !important;
}
.sidebar-themed .n-button {
  color: var(--tt-sidebar-text) !important;
}
.sidebar-themed .n-button:hover {
  background: var(--tt-sidebar-active-bg) !important;
  color: var(--tt-sidebar-text) !important;
}
.sidebar-themed .n-button.primary,
.sidebar-themed .n-button--primary-type {
  color: var(--tt-sidebar-active-text) !important;
  background: var(--tt-sidebar-active-bg) !important;
}
.sidebar-themed .n-divider {
  border-color: var(--tt-sidebar-border) !important;
}
.sidebar-themed .n-space {
  --n-text-color: var(--tt-sidebar-text) !important;
  --n-text-color-hover: var(--tt-sidebar-active-text) !important;
  --n-text-color-pressed: var(--tt-sidebar-active-text) !important;
  --n-text-color-focus: var(--tt-sidebar-active-text) !important;
}
/* App-level background — changes with light/dark mode */
.app-themed {
  background: var(--tt-app-bg, #0a0a0f) !important;
}
.app-themed .n-layout {
  background: var(--tt-app-bg, #0a0a0f) !important;
}
/* Inner sidebar — same bg as right content, text follows theme */
.sidebar-inner-themed {
  background: var(--tt-app-bg, #0a0a0f) !important;
  border: none !important;
}
.sidebar-inner-themed .n-text {
  color: var(--tt-sidebar-text, #e8edf4) !important;
}
.sidebar-inner-themed .n-text[direction="up"] {
  color: var(--tt-sidebar-text-muted, #7a8fa8) !important;
}
.sidebar-inner-themed .n-button {
  color: var(--tt-sidebar-text, #e8edf4) !important;
}
.sidebar-inner-themed .n-button:hover {
  background: var(--tt-sidebar-active-bg) !important;
  color: var(--tt-sidebar-active-text) !important;
}
.sidebar-inner-themed .n-divider {
  border-color: var(--tt-subtle-border, rgba(255, 255, 255, 0.08)) !important;
}
/* Task list — text follows theme */
.task-title {
  color: var(--tt-sidebar-text, #e8edf4) !important;
}
.task-desc {
  color: var(--tt-sidebar-text-muted, #7a8fa8) !important;
}
.task-main {
  flex: 1;
  color: var(--tt-sidebar-text, #e8edf4) !important;
}
/* Reminder modal — card bg follows theme */
.reminder-list {
  background: var(--tt-card-bg, #18181c) !important;
}
.project-list {
  display: flex;
  flex-direction: column;
  gap: 4px;
}
.project-row {
  display: flex;
  align-items: stretch;
  gap: 4px;
  border-radius: 8px;
  padding: 2px 4px;
}
.project-row--active {
  background: rgba(24, 160, 88, 0.14);
}
.project-drag {
  cursor: grab;
  user-select: none;
  opacity: 0.5;
  font-size: 11px;
  line-height: 1.2;
  display: flex;
  align-items: center;
  padding: 0 2px;
  flex-shrink: 0;
  letter-spacing: -0.12em;
}
.project-drag:active {
  cursor: grabbing;
}
.project-row-main {
  flex: 1;
  min-width: 0;
}
.project-row-label {
  display: flex;
  align-items: center;
  min-height: 34px;
  padding: 0 4px;
}
.project-row-actions {
  display: flex;
  flex-direction: column;
  gap: 2px;
  flex-shrink: 0;
  justify-content: center;
}
.task-list {
  display: flex;
  flex-direction: column;
  gap: 12px;
  width: 100%;
  scrollbar-width: none;
}
.task-list::-webkit-scrollbar {
  display: none;
}
.task-row {
  border: 1px solid var(--tt-row-border, rgba(255, 255, 255, 0.1));
  border-radius: 12px;
  padding: 14px 16px;
  background: var(--tt-row-bg, linear-gradient(145deg, rgba(255, 255, 255, 0.05) 0%, rgba(255, 255, 255, 0.02) 100%));
  transition: border-color 0.15s ease, background 0.15s ease, box-shadow 0.15s ease;
  display: flex;
  flex-direction: column;
  gap: 8px;
}
.task-row:hover {
  border-color: var(--tt-row-hover-border, rgba(24, 160, 255, 0.35));
  box-shadow: 0 0 0 1px var(--tt-row-hover-border, rgba(24, 160, 255, 0.12));
}
.task-row--done {
  opacity: 0.72;
}
.task-row--pinned {
  box-shadow: inset 3px 0 0 var(--tt-accent, rgba(250, 173, 20, 0.9));
}
.task-row--drag-over {
  border-color: var(--tt-hover-border, rgba(24, 160, 255, 0.6)) !important;
  box-shadow: 0 0 0 2px var(--tt-hover-border, rgba(24, 160, 255, 0.25));
}
.task-row[draggable="true"] {
  cursor: grab;
}
.task-row[draggable="true"]:active {
  cursor: grabbing;
}
.reminder-list {
  display: flex;
  flex-direction: column;
  gap: 12px;
  max-height: min(52vh, 420px);
  overflow: auto;
}
.reminder-row {
  padding: 10px 12px;
  border-radius: 8px;
  background: var(--tt-subtle-bg, rgba(255, 255, 255, 0.04));
  border: 1px solid var(--tt-subtle-border, rgba(255, 255, 255, 0.08));
}
.reminder-title {
  font-weight: 600;
  font-size: 14px;
  line-height: 1.4;
  word-break: break-word;
  color: var(--tt-sidebar-text, #e8edf4) !important;
}
.task-row-inner {
  display: flex;
  align-items: center;
  gap: 12px;
  width: 100%;
}
.task-att-slot {
  flex: 1 1 0;
  min-width: 0;
  max-width: none;
  align-self: center;
  padding: 0 4px;
  overflow: hidden;
}
.att-cards-grid--task-inline {
  display: flex;
  flex-direction: row;
  flex-wrap: nowrap;
  align-items: center;
  gap: 8px;
  width: 100%;
  max-width: 100%;
  max-height: 62px;
  overflow-x: auto;
  overflow-y: hidden;
  scrollbar-width: thin;
  padding: 2px 0;
}
.att-card--inline {
  flex: 0 0 auto;
  display: flex;
  flex-direction: row;
  align-items: stretch;
  width: 168px;
  min-width: 152px;
  max-width: 188px;
  min-height: 52px;
  max-height: 56px;
  padding: 6px 8px 6px 6px;
  gap: 8px;
  box-sizing: border-box;
}
.att-card-icon--inline {
  width: 36px;
  min-width: 36px;
  height: 36px;
  align-self: flex-start;
  flex-shrink: 0;
  font-size: 20px;
  border-radius: 6px;
  background: var(--tt-subtle-bg, rgba(255, 255, 255, 0.12));
  border: 1px solid var(--tt-subtle-border, rgba(255, 255, 255, 0.22));
  box-shadow: inset 0 1px 0 var(--tt-subtle-border, rgba(255, 255, 255, 0.08));
}
.att-card-main--inline {
  flex: 1 1 auto;
  min-width: 0;
  padding: 0;
  gap: 2px;
  justify-content: center;
  align-items: stretch;
}
.att-card-name--inline {
  flex-shrink: 1;
}
.att-card-type--inline {
  overflow: hidden;
  white-space: nowrap;
  text-overflow: ellipsis;
}
.att-card--inline .att-card-actions--inline {
  flex-direction: column;
  flex-wrap: nowrap;
  justify-content: center;
  align-items: stretch;
  gap: 4px;
  padding-left: 8px;
  margin-left: 0;
  border-left: 1px solid var(--tt-subtle-border, rgba(255, 255, 255, 0.12));
  min-width: 52px;
}
.att-card--inline .att-card-actions--inline :deep(.n-button) {
  padding-left: 6px;
  padding-right: 6px;
  font-size: 11px;
}
.task-check {
  flex-shrink: 0;
  display: flex;
  align-items: flex-start;
  padding-top: 2px;
}
.task-main {
  flex: 0 1 auto;
  min-width: 0;
  max-width: min(52%, 520px);
  cursor: pointer;
  text-align: left;
  border-radius: 8px;
  margin: -4px;
  padding: 4px;
  outline: none;
}
.task-main:hover {
  background: var(--tt-subtle-bg, rgba(255, 255, 255, 0.04));
}
.task-main:focus-visible {
  box-shadow: 0 0 0 2px var(--tt-accent-bg, rgba(24, 160, 255, 0.45));
}
.task-title {
  font-weight: 600;
  font-size: 15px;
  line-height: 1.45;
  word-break: break-word;
}
.task-desc {
  display: block;
  margin-top: 6px;
  font-size: 13px;
  line-height: 1.5;
  white-space: pre-wrap;
  word-break: break-word;
}
.task-meta {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 8px;
  margin-top: 10px;
}
.task-meta-tag {
  max-width: 100%;
}
.task-actions {
  flex-shrink: 0;
  display: flex;
  align-items: center;
  align-self: center;
  padding-left: 4px;
  margin-left: auto;
}
.att-line {
  display: flex;
  align-items: flex-start;
  gap: 12px;
  flex-wrap: nowrap;
  padding: 10px 12px;
  border-radius: 8px;
  background: var(--tt-subtle-bg, rgba(255, 255, 255, 0.04));
  border: 1px solid var(--tt-subtle-border, rgba(255, 255, 255, 0.08));
}
.att-line--pending {
  align-items: center;
}
.att-line--done {
  align-items: center;
}
.att-line-body {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 6px;
}
.att-line-name {
  font-weight: 500;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.att-line-size {
  flex-shrink: 0;
  font-size: 12px;
}
.att-cards-grid {
  display: flex;
  flex-wrap: wrap;
  gap: 10px;
  width: 100%;
}
.att-cards-grid--form {
  margin-top: 4px;
}
.att-card {
  display: flex;
  align-items: stretch;
  gap: 10px;
  flex: 1 1 220px;
  min-width: min(220px, 100%);
  max-width: 320px;
  padding: 10px 12px;
  border-radius: 10px;
  border: 1px solid var(--tt-subtle-border, rgba(255, 255, 255, 0.12));
  background: var(--tt-subtle-bg, linear-gradient(160deg, rgba(255, 255, 255, 0.07) 0%, rgba(255, 255, 255, 0.03) 100%));
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.2);
  transition: border-color 0.15s ease, box-shadow 0.15s ease;
}
.att-card:hover {
  border-color: var(--tt-hover-border, rgba(24, 160, 255, 0.45));
  box-shadow: 0 0 0 1px var(--tt-hover-border, rgba(24, 160, 255, 0.15));
}
.att-card--form {
  max-width: 100%;
}
.att-card-icon {
  width: 44px;
  min-width: 44px;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 26px;
  line-height: 1;
  border-radius: 8px;
  background: rgba(0, 0, 0, 0.25);
  border: 1px solid var(--tt-subtle-border, rgba(255, 255, 255, 0.08));
  align-self: center;
}
.att-card-main {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
  justify-content: center;
  gap: 4px;
  padding: 2px 0;
}
.att-card-name {
  font-size: 13px;
  font-weight: 600;
  line-height: 1.3;
  overflow: hidden;
  white-space: nowrap;
  text-overflow: ellipsis;
  min-width: 0;
}
.att-card-type {
  font-size: 11px;
  line-height: 1.25;
  color: var(--tt-sidebar-text-muted, rgba(255, 255, 255, 0.55));
}
.att-card--form .att-card-name {
  white-space: normal;
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
  word-break: break-word;
}
.att-card-actions {
  display: flex;
  flex-direction: column;
  justify-content: center;
  gap: 6px;
  flex-shrink: 0;
  padding-left: 4px;
  border-left: 1px solid var(--tt-subtle-border, rgba(255, 255, 255, 0.08));
}
.att-card-actions--form {
  min-width: 64px;
}
.preview-image-wrap {
  text-align: center;
  min-height: 120px;
}
.preview-image {
  max-width: 100%;
  max-height: min(72vh, 680px);
  object-fit: contain;
  border-radius: 8px;
}
.preview-iframe {
  width: 100%;
  min-height: min(75vh, 720px);
  height: min(75vh, 720px);
  border: 0;
  border-radius: 8px;
  background: var(--tt-subtle-bg, rgba(255, 255, 255, 0.04));
}
.preview-text {
  margin: 0;
  padding: 12px 14px;
  font-size: 13px;
  line-height: 1.55;
  font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
  white-space: pre-wrap;
  word-break: break-word;
}
.tag-row {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 8px 10px;
  border-radius: 8px;
  background: var(--tt-subtle-bg, rgba(255, 255, 255, 0.04));
  border: 1px solid var(--tt-subtle-border, rgba(255, 255, 255, 0.08));
  min-height: 40px;
}
.tag-color-dot {
  width: 14px;
  height: 14px;
  border-radius: 50%;
  flex-shrink: 0;
}
.tag-row-name {
  flex: 1;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  color: var(--tt-sidebar-text, #e8edf4);
}
.color-swatch {
  width: 22px;
  height: 22px;
  border-radius: 50%;
  border: 2px solid transparent;
  cursor: pointer;
  transition: transform 0.12s, box-shadow 0.12s;
  padding: 0;
}
.color-swatch:hover {
  transform: scale(1.15);
}
.color-swatch--active {
  border-color: #fff;
  box-shadow: 0 0 0 2px var(--tt-accent-border, rgba(255, 255, 255, 0.4));
}

/* 子任务 */
.task-row--subtask {
  margin-left: 32px;
  border-left: 2px solid rgba(24, 160, 255, 0.35);
  background: rgba(24, 160, 255, 0.04);
}
.subtask-add-inline {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 4px 8px 6px;
  margin-left: 32px;
}

/* Outer left sidebar */
.avatar-circle {
  width: 40px;
  height: 40px;
  border-radius: 50%;
  background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 18px;
  font-weight: 700;
  color: #fff;
  cursor: pointer;
  user-select: none;
  flex-shrink: 0;
}

.nav-icon-btn {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 2px;
  padding: 8px 6px;
  border-radius: 10px;
  font-size: 20px;
  transition: background 0.15s;
  min-width: 48px;
}
.nav-icon-btn:hover,
.nav-icon-btn.active {
  background: rgba(24, 160, 255, 0.12);
}
.nav-icon-btn.active {
  color: #18a0ff;
}
.nav-icon {
  font-size: 20px;
  line-height: 1;
}
.nav-label {
  font-size: 10px;
  line-height: 1;
  color: #18a0ff;
}

.nav-pomodoro-badge {
  position: absolute;
  top: 2px;
  right: 2px;
  background: #ef4444;
  color: #fff;
  border-radius: 8px;
  font-size: 9px;
  font-weight: 700;
  padding: 1px 4px;
  min-width: 16px;
  text-align: center;
  line-height: 14px;
}

/* Search view */
.search-view {
  max-width: 640px;
  margin: 0 auto;
}
.search-results .task-row {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 10px 12px;
  border-radius: 8px;
  background: var(--tt-subtle-bg, rgba(255, 255, 255, 0.04));
  border: 1px solid var(--tt-subtle-border, rgba(255, 255, 255, 0.08));
  margin-bottom: 6px;
  cursor: pointer;
  transition: background 0.15s;
}
.search-results .task-row:hover {
  background: var(--tt-row-hover-bg, rgba(255, 255, 255, 0.08));
}
.search-results .task-title {
  flex: 1;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.project-create-inline {
  display: flex;
  gap: 6px;
  padding: 4px 0 2px;
  align-items: center;
}
.project-create-inline .n-input {
  flex: 1;
}
.tag-create-inline {
  display: flex;
  flex-direction: column;
  gap: 6px;
  padding: 4px 0 2px;
}
.tag-create-inline .n-input {
  width: 100%;
}
.tag-color-row {
  display: flex;
  gap: 4px;
  flex-wrap: wrap;
}
.color-swatch {
  width: 16px;
  height: 16px;
  border-radius: 50%;
  cursor: pointer;
  border: 2px solid transparent;
  transition: transform 0.1s;
}
.color-swatch:hover {
  transform: scale(1.15);
}
.color-swatch--active {
  border-color: #fff;
  box-shadow: 0 0 0 2px rgba(255,255,255,0.3);
}

/* Habits view */
.habits-view {
  max-width: 600px;
}
.habits-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 20px;
}

/* Habit stats */
.habits-stats {
  background: var(--tt-card-bg, #1e1e24);
  border: 1px solid var(--tt-row-border, rgba(255, 255, 255, 0.08));
  border-radius: 10px;
  padding: 16px;
  margin-bottom: 20px;
}
.habits-stats-summary {
  display: flex;
  gap: 16px;
  margin-bottom: 20px;
}
.habits-stat-card {
  flex: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 4px;
  padding: 12px 8px;
  background: var(--tt-subtle-bg, rgba(255, 255, 255, 0.04));
  border-radius: 8px;
  border: 1px solid var(--tt-subtle-border, rgba(255, 255, 255, 0.06));
}
.habits-stat-num {
  font-size: 24px;
  font-weight: 700;
  color: var(--tt-text, #e8edf4);
}
.habits-weekly-chart {
  margin-bottom: 20px;
}
.habits-bar-chart {
  display: flex;
  gap: 8px;
  align-items: flex-end;
  height: 100px;
}
.habits-bar-col {
  flex: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 4px;
}
.habits-bar-wrap {
  height: 80px;
  display: flex;
  align-items: flex-end;
  width: 100%;
}
.habits-bar {
  width: 100%;
  background: var(--tt-accent, #3b82f6);
  border-radius: 4px 4px 0 0;
  min-height: 4px;
  transition: height 0.3s ease;
}
.habits-heatmap {
  margin-top: 4px;
}
.habits-heatmap-grid {
  display: flex;
  flex-direction: column;
  gap: 3px;
}
.habits-heatmap-row {
  display: flex;
  gap: 3px;
}
.habits-heatmap-label {
  width: 14px;
  font-size: 10px;
  color: var(--tt-text-muted, #7a8fa8);
  text-align: center;
  line-height: 14px;
}
.habits-heatmap-cell {
  width: 14px;
  height: 14px;
  border-radius: 3px;
  cursor: default;
}
.heatmap-cell-none {
  background: var(--tt-subtle-bg, rgba(255, 255, 255, 0.06));
}
.heatmap-cell-low {
  background: rgba(59, 130, 246, 0.35);
}
.heatmap-cell-mid {
  background: rgba(59, 130, 246, 0.6);
}
.heatmap-cell-high {
  background: var(--tt-accent, #3b82f6);
}
.heatmap-cell-future {
  background: transparent;
  border: 1px dashed var(--tt-subtle-border, rgba(255, 255, 255, 0.08));
}
.habits-heatmap-legend {
  display: flex;
  align-items: center;
  gap: 4px;
  margin-top: 6px;
}
.heatmap-legend-item {
  width: 12px;
  height: 12px;
  border-radius: 2px;
}

/* Notes view */
.notes-view {
  width: 100%;
  max-width: 700px;
}
.notes-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 20px;
}
.notes-list {
  width: 100%;
}
.note-card {
  background: var(--tt-card-bg, #18181c);
  border: 1px solid var(--tt-subtle-border, rgba(255, 255, 255, 0.08));
  border-radius: 10px;
  padding: 14px 16px;
  cursor: pointer;
  transition: background 0.15s, border-color 0.15s;
}
.note-card:hover {
  background: var(--tt-subtle-bg, rgba(255, 255, 255, 0.05));
  border-color: var(--tt-hover-border, rgba(255, 255, 255, 0.15));
}
.note-card-title {
  font-size: 15px;
  font-weight: 600;
  color: var(--tt-sidebar-text, #e8edf4);
  margin-bottom: 4px;
}
.note-card-content {
  font-size: 13px;
  color: var(--tt-sidebar-text-muted, #7a8fa8);
  margin-bottom: 6px;
  overflow: hidden;
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
}
.note-card-time {
  font-size: 11px;
  color: var(--tt-sidebar-text-muted, #7a8fa8);
}

/* Stats view */
.stats-view {
  width: 100%;
  max-width: 900px;
}
.stats-view-title {
  font-size: 20px;
  font-weight: 700;
  color: var(--tt-sidebar-text, #e8edf4);
  margin-bottom: 20px;
}
.stats-grid-2 {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 16px;
  margin-bottom: 20px;
}
.stats-grid-4 {
  display: grid;
  grid-template-columns: repeat(4, 1fr);
  gap: 12px;
  margin-bottom: 20px;
}
.stats-card {
  background: var(--tt-card-bg, #18181c);
  border: 1px solid var(--tt-subtle-border, rgba(255, 255, 255, 0.08));
  border-radius: 12px;
  padding: 16px;
  display: flex;
  flex-direction: column;
  gap: 4px;
}
.stats-card-num {
  font-size: 28px;
  font-weight: 700;
  color: var(--tt-sidebar-text, #e8edf4);
}
.stats-section {
  margin-bottom: 20px;
}
.stats-section-title {
  font-size: 14px;
  font-weight: 600;
  color: var(--tt-sidebar-text-muted, #7a8fa8);
  margin-bottom: 12px;
}
.stats-priority-card {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 8px 12px;
  border-radius: 8px;
  background: var(--tt-subtle-bg, rgba(255, 255, 255, 0.04));
}
.stats-priority-dot {
  width: 10px;
  height: 10px;
  border-radius: 50%;
  flex-shrink: 0;
}
.stats-priority-name {
  font-size: 13px;
  color: var(--tt-sidebar-text, #e8edf4);
  flex: 1;
}
.stats-priority-count {
  font-size: 13px;
  font-weight: 600;
  color: var(--tt-sidebar-text-muted, #7a8fa8);
}
.stats-bar-list {
  display: flex;
  flex-direction: column;
  gap: 8px;
}
.stats-bar-row {
  display: flex;
  align-items: center;
  gap: 12px;
}
.stats-bar-label {
  font-size: 12px;
  color: var(--tt-sidebar-text-muted, #7a8fa8);
  min-width: 80px;
}
.stats-bar-track {
  flex: 1;
  height: 8px;
  border-radius: 4px;
  background: var(--tt-subtle-bg, rgba(255, 255, 255, 0.08));
  overflow: hidden;
}
.stats-bar-fill {
  height: 100%;
  border-radius: 4px;
  transition: width 0.3s;
}
.stats-bar-pct {
  font-size: 12px;
  font-weight: 600;
  color: var(--tt-sidebar-text-muted, #7a8fa8);
  min-width: 36px;
  text-align: right;
}
.stats-empty {
  color: var(--tt-sidebar-text-muted, #7a8fa8);
  font-size: 13px;
  text-align: center;
  padding: 20px;
}
.stats-completion-ring-wrap {
  position: relative;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  margin-bottom: 16px;
}
.stats-completion-ring-fill {
  position: absolute;
}
.stats-completion-ring-text {
  position: absolute;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 2px;
}
.stats-completion-pct {
  font-size: 28px;
  font-weight: 700;
  color: var(--tt-sidebar-text, #e8edf4);
}
.stats-completion-legend {
  display: flex;
  gap: 20px;
  justify-content: center;
}
.stats-completion-legend-item {
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 13px;
  color: var(--tt-sidebar-text-muted, #7a8fa8);
}
.stats-legend-dot {
  width: 10px;
  height: 10px;
  border-radius: 50%;
  flex-shrink: 0;
}
.stats-pomodoro-row {
  display: flex;
  align-items: center;
  gap: 24px;
}
.stats-pomodoro-ring-wrap,
.stats-pomodoro-ring-empty {
  position: relative;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
}
.stats-pomodoro-ring-text {
  position: absolute;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 2px;
}
.stats-pomodoro-ring-min {
  font-size: 20px;
  font-weight: 700;
  color: var(--tt-sidebar-text, #e8edf4);
}
.stats-pomodoro-side {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 12px 16px;
  flex: 1;
}
.stats-pomodoro-side-item {
  display: flex;
  flex-direction: column;
  gap: 2px;
}
.stats-pomodoro-side-num {
  font-size: 20px;
  font-weight: 700;
  color: var(--tt-sidebar-text, #e8edf4);
}
.stats-pomodoro-side-label {
  font-size: 11px;
  color: var(--tt-sidebar-text-muted, #7a8fa8);
}

/* Pomodoro view */
.pomodoro-view {
  width: 100%;
  display: flex;
  flex-direction: column;
  align-items: center;
}
.pomodoro-timer-wrap {
  display: flex;
  justify-content: center;
  align-items: center;
}
.pomodoro-big-time {
  font-size: 48px;
  font-weight: 700;
  font-variant-numeric: tabular-nums;
  color: var(--tt-sidebar-text, #e8edf4);
}
.pomodoro-stats-grid {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 16px;
  width: 100%;
  max-width: 400px;
}
.pomodoro-stat-card {
  background: var(--tt-subtle-bg, rgba(255, 255, 255, 0.04));
  border: 1px solid var(--tt-subtle-border, rgba(255, 255, 255, 0.08));
  border-radius: 12px;
  padding: 16px;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 4px;
}
.pomodoro-stat-num {
  font-size: 28px;
  font-weight: 700;
  color: var(--tt-sidebar-text, #e8edf4);
}
.habits-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 20px;
}
.habit-row {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 12px 16px;
  border-radius: 10px;
  background: var(--tt-card-bg, #18181c);
  border: 1px solid var(--tt-subtle-border, rgba(255,255,255,0.08));
  transition: background 0.15s;
}
.habit-row:hover {
  background: var(--tt-row-hover-bg, rgba(255,255,255,0.06));
}
.habit-row--done {
  opacity: 0.7;
}
.habit-check {
  width: 24px;
  height: 24px;
  border-radius: 50%;
  border: 2px solid var(--tt-subtle-border, rgba(255,255,255,0.3));
  display: flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  flex-shrink: 0;
  transition: all 0.15s;
}
.habit-row--done .habit-check {
  background: #22c55e;
  border-color: #22c55e;
}
.habit-check-done {
  color: #fff;
  font-size: 14px;
  font-weight: bold;
}
.habit-check-empty {
  width: 100%;
  height: 100%;
  border-radius: 50%;
}
.habit-info {
  flex: 1;
  display: flex;
  align-items: center;
  gap: 8px;
}
.habit-name {
  font-size: 14px;
  font-weight: 500;
}
.habit-streak {
  font-size: 12px;
  color: #f97316;
}
.habit-freq {
  flex-shrink: 0;
}
.habit-actions {
  flex-shrink: 0;
}
.form-selected-chips {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  padding: 4px 0 8px;
  margin-top: -4px;
}

/* Sidebar module drag states */
.nav-module-wrapper {
  cursor: grab;
  border-radius: 10px;
  transition: opacity 0.15s, transform 0.15s;
}
.nav-module-wrapper:active {
  cursor: grabbing;
}
.nav-module-wrapper--dragging {
  opacity: 0.4;
}
.nav-module-wrapper--drag-over {
  transform: scale(1.05);
  background: rgba(24, 160, 255, 0.1);
  border-radius: 10px;
}
.batch-action-bar {
  display: flex;
  align-items: center;
  padding: 8px 12px;
  margin-bottom: 8px;
  background: var(--tt-accent-bg, rgba(24, 160, 255, 0.12));
  border: 1px solid var(--tt-accent-border, rgba(24, 160, 255, 0.3));
  border-radius: 8px;
  flex-wrap: wrap;
  gap: 8px;
}
.sidebar-smartlist-item {
  display: flex;
  align-items: center;
  gap: 2px;
}
.sidebar-smartlist-item--active .n-button {
  font-weight: 600;
}
.color-swatch {
  width: 20px;
  height: 20px;
  border-radius: 4px;
  cursor: pointer;
  border: 2px solid transparent;
  transition: transform 0.1s;
}
.color-swatch:hover {
  transform: scale(1.15);
}
.color-swatch--selected {
  border-color: white;
  box-shadow: 0 0 0 2px rgba(255,255,255,0.4);
}
.location-reminder-list {
  display: flex;
  flex-direction: column;
  gap: 6px;
  margin-top: 4px;
}
.location-reminder-item {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 6px 8px;
  border-radius: 6px;
}
.markdown-preview {
  padding: 12px;
  border-radius: 6px;
  background: var(--tt-subtle-bg, rgba(255, 255, 255, 0.04));
  border: 1px solid var(--tt-subtle-border, rgba(255, 255, 255, 0.08));
  line-height: 1.6;
  font-size: 14px;
  min-height: 120px;
}
.markdown-preview :deep(h1),
.markdown-preview :deep(h2),
.markdown-preview :deep(h3) {
  margin: 0.5em 0;
}
.markdown-preview :deep(code) {
  background: rgba(255, 255, 255, 0.08);
  padding: 2px 6px;
  border-radius: 4px;
  font-size: 0.9em;
}
.markdown-preview :deep(pre) {
  background: var(--tt-code-bg, rgba(0, 0, 0, 0.3));
  padding: 12px;
  border-radius: 6px;
  overflow-x: auto;
}
.markdown-preview :deep(ul),
.markdown-preview :deep(ol) {
  padding-left: 20px;
}

/* Kanban board */
.kanban-board {
  display: flex;
  gap: 16px;
  padding: 16px;
  overflow-x: auto;
  min-height: calc(100vh - 120px);
}
.kanban-column {
  flex-shrink: 0;
  width: 280px;
  display: flex;
  flex-direction: column;
  background: var(--tt-subtle-bg, rgba(255, 255, 255, 0.04));
  border-radius: 10px;
  border: 1px solid var(--tt-subtle-border, rgba(255, 255, 255, 0.08));
  max-height: calc(100vh - 140px);
}
.kanban-column-header {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 12px 14px;
  border-bottom: 1px solid var(--tt-subtle-border, rgba(255, 255, 255, 0.08));
}
.kanban-column-dot {
  width: 10px;
  height: 10px;
  border-radius: 50%;
  flex-shrink: 0;
}
.kanban-column-name {
  font-size: 13px;
  font-weight: 600;
  color: var(--tt-text, #e8edf4);
  flex: 1;
}
.kanban-column-count {
  font-size: 12px;
  color: var(--tt-text-muted, #7a8fa8);
  background: var(--tt-subtle-bg, rgba(255, 255, 255, 0.06));
  padding: 1px 7px;
  border-radius: 10px;
}
.kanban-column-body {
  flex: 1;
  overflow-y: auto;
  padding: 8px;
  display: flex;
  flex-direction: column;
  gap: 6px;
}
.kanban-card {
  background: var(--tt-card-bg, #1e1e24);
  border: 1px solid var(--tt-row-border, rgba(255, 255, 255, 0.08));
  border-radius: 8px;
  padding: 10px 12px;
  cursor: pointer;
  display: flex;
  flex-direction: column;
  gap: 6px;
  transition: border-color 0.15s, box-shadow 0.15s;
}
.kanban-card:hover {
  border-color: var(--tt-accent, #3b82f6);
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.2);
}
.kanban-card--completed {
  opacity: 0.5;
}
.kanban-card-priority {
  width: 4px;
  height: 100%;
  position: absolute;
  left: 0;
  top: 0;
  border-radius: 8px 0 0 8px;
}
.kanban-card {
  position: relative;
  padding-left: 16px;
}
.kanban-card-priority.priority-1 {
  background: #22c55e;
}
.kanban-card-priority.priority-2 {
  background: #f59e0b;
}
.kanban-card-priority.priority-3 {
  background: #ef4444;
}
.kanban-card-priority.priority-0,
.kanban-card-priority:not([class*="priority-"]) {
  display: none;
}
.kanban-card-title {
  font-size: 13px;
  color: var(--tt-text, #e8edf4);
  line-height: 1.4;
  word-break: break-word;
}
.kanban-card--completed .kanban-card-title {
  text-decoration: line-through;
  color: var(--tt-text-muted, #7a8fa8);
}
.kanban-card-due {
  display: flex;
  align-items: center;
}

/* Trash view */
.trash-view {
  padding: 20px;
  max-width: 700px;
}
.trash-header {
  display: flex;
  align-items: center;
  margin-bottom: 8px;
}
.trash-task-row {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 12px;
  padding: 12px 16px;
  background: var(--tt-card-bg, #1e1e24);
  border: 1px solid var(--tt-row-border, rgba(255, 255, 255, 0.08));
  border-radius: 8px;
}
.trash-task-info {
  flex: 1;
  display: flex;
  flex-direction: column;
  gap: 2px;
}

/* Task comments */
.task-comments-section {
  padding: 4px 0;
}
.comment-list {
  display: flex;
  flex-direction: column;
  gap: 10px;
  max-height: 240px;
  overflow-y: auto;
  margin-bottom: 10px;
}
.comment-item {
  background: var(--tt-subtle-bg, rgba(255, 255, 255, 0.04));
  border: 1px solid var(--tt-subtle-border, rgba(255, 255, 255, 0.08));
  border-radius: 8px;
  padding: 10px 12px;
}
.comment-header {
  display: flex;
  align-items: center;
  margin-bottom: 6px;
}
.comment-content {
  font-size: 13px;
  color: var(--tt-text, #e8edf4);
  line-height: 1.5;
  white-space: pre-wrap;
  word-break: break-word;
}
.comment-add {
  display: flex;
  flex-direction: column;
  align-items: flex-end;
}
</style>
