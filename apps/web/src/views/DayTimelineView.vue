<script setup lang="ts">
/**
 * DayTimelineView — 日期时间轴视图
 * 显示指定日期的24小时时间线，包含任务和日程。
 */

import type { Schedule, Task } from "@tasktick/shared";
import { computed, onMounted, ref, watch } from "vue";
import { useI18n } from "vue-i18n";
import { useRoute, useRouter } from "vue-router";
import {
  NButton,
  NCheckbox,
  NInput,
  NModal,
  NSelect,
  NSpace,
  NTag,
  NText,
  useMessage,
} from "naive-ui";
import { useTaskStore } from "../stores/task";
import { useScheduleStore } from "../stores/schedule";
import { localDateKey } from "../utils/date";
import { getOccurrencesInMonth, isRecurring } from "../utils/rrule";
import { getLunarInfo } from "../composables/useLunar";
import { parseNaturalLanguageTask } from "../utils/naturalLanguageTask";

const { t } = useI18n();
const route = useRoute();
const router = useRouter();
const message = useMessage();
const store = useTaskStore();
const scheduleStore = useScheduleStore();

const HOURS = Array.from({ length: 24 }, (_, i) => i);

const selectedDate = computed(() => {
  const dateStr = route.params.date as string;
  if (!dateStr) return new Date();
  const [y, m, d] = dateStr.split("-").map(Number);
  return new Date(y, m - 1, d);
});

const selectedDateKey = computed(() => localDateKey(selectedDate.value));

const lunarInfo = computed(() => getLunarInfo(selectedDate.value));

const viewYear = computed(() => selectedDate.value.getFullYear());
const viewMonth = computed(() => selectedDate.value.getMonth());

onMounted(() => {
  void scheduleStore.hydrateFromApi(viewYear.value, viewMonth.value);
});

watch([viewYear, viewMonth], () => {
  void scheduleStore.hydrateFromApi(viewYear.value, viewMonth.value);
});

const PRIORITY_LABELS = computed(() => [
  "",
  t("calendar.priorityLow"),
  t("calendar.priorityMedium"),
  t("calendar.priorityHigh"),
]);

function priorityColor(p: number): string {
  if (p === 3) return "#ef4444";
  if (p === 2) return "#f97316";
  if (p === 1) return "#22c55e";
  return "#6b7280";
}

const tasksForDay = computed(() => {
  const key = selectedDateKey.value;
  const [y, m, day] = key.split("-").map(Number);
  const year = y;
  const month = m - 1;
  const tasks: Task[] = [];
  for (const t of store.tasks) {
    if (t.deletedAt) continue;
    if (t.parentId) continue;
    if (isRecurring(t.repeatRule, false)) {
      const days = getOccurrencesInMonth(t.repeatRule, false, year, month);
      if (days.includes(day)) tasks.push(t);
      continue;
    }
    const dk = localDateKey(new Date(t.dueAt!));
    if (dk === key) tasks.push(t);
  }
  return tasks;
});

const schedulesForDay = computed(() => scheduleStore.schedulesByDate(selectedDateKey.value));

function scheduleStyle(s: Schedule): Record<string, string> {
  const start = new Date(s.startAt);
  const end = s.endAt ? new Date(s.endAt) : new Date(start.getTime() + 60 * 60 * 1000);
  const startMin = start.getHours() * 60 + start.getMinutes();
  const endMin = end.getHours() * 60 + end.getMinutes();
  const top = (startMin / (24 * 60)) * 100;
  const height = Math.max(((endMin - startMin) / (24 * 60)) * 100, 2);
  return {
    position: "absolute",
    top: `${top}%`,
    height: `${height}%`,
    left: "0",
    right: "0",
    background: "rgba(59, 130, 246, 0.15)",
    borderLeft: `2px solid var(--tt-accent, #3b82f6)`,
    borderRadius: "4px",
    padding: "2px 6px",
    fontSize: "12px",
    overflow: "hidden",
    color: "var(--tt-sidebar-text, #e8edf4)",
  };
}

function goBack() {
  router.push("/");
}

function prevDay() {
  const d = new Date(selectedDate.value);
  d.setDate(d.getDate() - 1);
  router.push(`/calendar/${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`);
}

function nextDay() {
  const d = new Date(selectedDate.value);
  d.setDate(d.getDate() + 1);
  router.push(`/calendar/${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`);
}

function goToday() {
  const today = new Date();
  router.push(`/calendar/${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, "0")}-${String(today.getDate()).padStart(2, "0")}`);
}

const showEditModal = ref(false);
const editingTask = ref<Task | null>(null);
const editFormTitle = ref("");
const editFormProjectId = ref<string | null>(null);

const projectSelectOptions = computed(() =>
  store.projects.filter((p) => !p.deletedAt).map((p) => ({ label: p.name, value: p.id })),
);

function openEdit(task: Task) {
  editingTask.value = task;
  editFormTitle.value = task.title;
  editFormProjectId.value = task.projectIds?.[0] ?? null;
  showEditModal.value = true;
}

async function submitEdit() {
  if (!editingTask.value || !editFormTitle.value.trim()) return;
  const ok = await store.updateTask(editingTask.value.id, { title: editFormTitle.value.trim() });
  if (ok) {
    message.success(t("task.updateSuccess"));
    showEditModal.value = false;
  } else {
    message.error(t("task.updateFailed"));
  }
}

async function toggleComplete(task: Task) {
  await store.toggleComplete(task.id);
}

// Natural language create
const showNlModal = ref(false);
const nlRaw = ref("");

function goHomeOpenForm() {
  showNlModal.value = false;
  window.location.href = "/?blankForm=1";
}

function openFormFromNl() {
  const draft = parseNaturalLanguageTask(nlRaw.value);
  if (!draft.title.trim()) {
    message.warning(t("task.nlHint") || "请描述任务内容");
    return;
  }
  void store.addTask({
    title: draft.title,
    description: draft.description,
    dueAt: draft.dueAtMs ? new Date(draft.dueAtMs).toISOString() : null,
    priority: draft.priority,
    isImportant: draft.isImportant,
    repeatRule: draft.repeatRule,
  });
  message.success(t("task.taskCreatedFromNl") || "任务已创建");
  nlRaw.value = "";
  showNlModal.value = false;
}

function scheduleForHour(hour: number) {
  return schedulesForDay.value.filter((s) => {
    const h = new Date(s.startAt).getHours();
    return h === hour;
  });
}

const dateLabel = computed(() => {
  const d = selectedDate.value;
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
});
</script>

<template>
  <div class="day-timeline-view">
    <!-- Header -->
    <div class="timeline-header">
      <NSpace align="center" :size="12">
        <NButton size="small" quaternary @click="goBack">‹ {{ t("common.back") }}</NButton>
        <NText strong style="font-size: 16px">{{ dateLabel }}</NText>
        <NTag v-if="lunarInfo.shortLabel" size="small" :bordered="false">{{ lunarInfo.shortLabel }}</NTag>
        <NTag v-if="lunarInfo.isHoliday" size="small" type="error" :bordered="false">{{ lunarInfo.holidayName }}</NTag>
      </NSpace>
      <NSpace :size="8">
        <NButton size="small" quaternary @click="goToday">{{ t("calendar.today") }}</NButton>
        <NButton size="small" quaternary @click="prevDay">‹ {{ t("calendar.previousDay") }}</NButton>
        <NButton size="small" quaternary @click="nextDay">{{ t("calendar.nextDay") }} ›</NButton>
      </NSpace>
    </div>

    <!-- Day timeline -->
    <div class="day-timeline">
      <div class="day-hour-column">
        <div
          v-for="hour in HOURS"
          :key="hour"
          class="day-hour-row"
        >
          <div class="day-hour-label">{{ String(hour).padStart(2, "0") }}:00</div>
          <div class="day-hour-content">
            <div
              v-for="s in scheduleForHour(hour)"
              :key="s.id"
              :style="scheduleStyle(s)"
              class="day-schedule-block"
            >
              <NText style="font-size: 11px; font-weight: 500">{{ s.title }}</NText>
              <NText depth="3" style="font-size: 10px">
                {{ new Date(s.startAt).toLocaleTimeString([], {hour:'2-digit',minute:'2-digit'}) }}
                <span v-if="s.endAt"> - {{ new Date(s.endAt).toLocaleTimeString([], {hour:'2-digit',minute:'2-digit'}) }}</span>
              </NText>
            </div>
          </div>
        </div>
      </div>
    </div>

    <!-- Task sidebar -->
    <div class="task-sidebar">
      <div class="task-sidebar-header">
        <NText strong>{{ t("calendar.tasks") }} ({{ tasksForDay.length }})</NText>
      </div>
      <div v-if="tasksForDay.length === 0" class="no-tasks">
        <NText depth="3" style="font-size: 13px">{{ t("calendar.noTasks") }}</NText>
      </div>
      <div
        v-for="task in tasksForDay"
        :key="task.id"
        class="task-item"
        :style="{ borderLeftColor: priorityColor(task.priority) }"
      >
        <NCheckbox
          :checked="task.completed"
          size="small"
          @update:checked="() => toggleComplete(task)"
        />
        <NText
          :style="{ textDecoration: task.completed ? 'line-through' : 'none', opacity: task.completed ? 0.5 : 1, flex: 1 }"
          @click="openEdit(task)"
        >
          {{ task.title }}
        </NText>
        <NText v-if="task.priority > 0" depth="3" style="font-size: 11px">
          {{ PRIORITY_LABELS[task.priority] }}
        </NText>
      </div>
    </div>

    <!-- Edit task modal -->
    <NModal
      v-model:show="showEditModal"
      :title="t('task.edit')"
      style="width: min(440px, 90vw)"
    >
      <NSpace vertical :size="12" style="width: 100%">
        <NInput
          v-model:value="editFormTitle"
          :placeholder="t('task.enterContent')"
          size="small"
          @keydown.enter.prevent="submitEdit"
        />
        <NSelect
          v-model:value="editFormProjectId"
          :options="projectSelectOptions"
          :placeholder="t('calendar.selectProject')"
          clearable
          size="small"
          style="width: 100%"
        />
        <NButton type="primary" size="small" @click="submitEdit">{{ t("common.save") }}</NButton>
      </NSpace>
    </NModal>

    <!-- Floating + FAB -->
    <div style="position: fixed; bottom: 24px; right: 24px; z-index: 1000;">
      <button class="create-task-fab" :title="t('task.create')" @click="nlRaw = ''; showNlModal = true">
        <span style="font-size: 28px; line-height: 1;">+</span>
      </button>
    </div>

    <!-- NL Create Modal -->
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
          <NButton quaternary @click="goHomeOpenForm">{{ t('task.nlSkipBlank') }}</NButton>
          <NSpace>
            <NButton @click="showNlModal = false">{{ t('common.cancel') }}</NButton>
            <NButton type="primary" @click="openFormFromNl">{{ t('task.nlParseAndFill') }}</NButton>
          </NSpace>
        </NSpace>
      </template>
    </NModal>
  </div>
</template>

<style scoped>
.day-timeline-view {
  display: flex;
  flex-direction: column;
  height: 100%;
  user-select: none;
  padding: 0 8px;
}

.timeline-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 16px;
}

.day-timeline {
  display: flex;
  flex: 1;
  overflow-y: auto;
  border: 1px solid var(--tt-subtle-border, rgba(255, 255, 255, 0.08));
  border-radius: 8px;
}

.day-hour-column {
  display: flex;
  flex-direction: column;
  flex: 1;
}

.day-hour-row {
  display: flex;
  min-height: 48px;
  border-bottom: 1px solid var(--tt-subtle-border, rgba(255, 255, 255, 0.05));
}

.day-hour-row:last-child {
  border-bottom: none;
}

.day-hour-label {
  width: 52px;
  font-size: 11px;
  color: var(--tt-sidebar-text-muted, #7a8fa8) !important;
  padding: 4px 8px;
  flex-shrink: 0;
  border-right: 1px solid var(--tt-subtle-border, rgba(255, 255, 255, 0.06));
}

.day-hour-content {
  flex: 1;
  position: relative;
  padding: 2px 6px;
}

.day-schedule-block {
  border-radius: 4px;
  overflow: hidden;
}

.task-sidebar {
  margin-top: 16px;
  padding: 12px;
  background: var(--tt-subtle-bg, rgba(255, 255, 255, 0.03));
  border: 1px solid var(--tt-subtle-border, rgba(255, 255, 255, 0.08));
  border-radius: 8px;
  max-height: 200px;
  overflow-y: auto;
}

.task-sidebar-header {
  margin-bottom: 8px;
}

.no-tasks {
  padding: 8px 0;
}

.task-item {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 4px 0;
  border-left: 2px solid #6b7280;
  margin-bottom: 4px;
}
.create-task-fab {
  width: 56px;
  height: 56px;
  border-radius: 50%;
  background: var(--tt-accent);
  border: none;
  cursor: pointer;
  color: #fff;
  display: flex;
  align-items: center;
  justify-content: center;
  box-shadow: 0 6px 24px rgba(0, 0, 0, 0.25);
  transition: transform 0.15s ease, box-shadow 0.15s ease;
}
.create-task-fab:hover {
  background: var(--tt-accent-hover);
  transform: scale(1.08);
  box-shadow: 0 8px 28px rgba(0, 0, 0, 0.3);
}
.create-task-fab:active {
  transform: scale(0.96);
}
</style>