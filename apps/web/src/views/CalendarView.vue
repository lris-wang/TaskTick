<script setup lang="ts">
/**
 * CalendarView — 日历视图
 * 显示当月所有任务的截止日期和日程，支持月导航。
 * 点击日期可查看 / 新建该日任务或日程。
 * 点击任务可编辑该任务。
 */

import type { Schedule, Task } from "@tasktick/shared";

const emit = defineEmits<{
  (e: "edit-task", task: Task): void;
}>();

function onEditTask(task: Task) {
  emit("edit-task", task);
}
import {
  NButton,
  NInput,
  NModal,
  NSpace,
  NText,
  useMessage,
} from "naive-ui";
import { computed, ref, watch } from "vue";
import { useI18n } from "vue-i18n";
import { useRouter } from "vue-router";
import { useTaskStore } from "../stores/task";
import { useScheduleStore } from "../stores/schedule";
import { useAuthStore } from "../stores/auth";
import { dueCalendarKey, localDateKey } from "../utils/date";
import { getOccurrencesInMonth, isRecurring } from "../utils/rrule";
import { getLunarInfo } from "../composables/useLunar";
import { parseNaturalLanguageTask } from "../utils/naturalLanguageTask";

const { t } = useI18n();
const router = useRouter();
const message = useMessage();
const store = useTaskStore();
const scheduleStore = useScheduleStore();

// ---- 当前日历月 ----
const today = new Date();
const viewYear = ref(today.getFullYear());
const viewMonth = ref(today.getMonth()); // 0-indexed
const viewType = ref<"month" | "week" | "day">("month");
const viewDay = ref(today.getDate());

// Fetch schedules when month changes
watch(
  [viewYear, viewMonth],
  () => {
    void scheduleStore.hydrateFromApi(viewYear.value, viewMonth.value);
  },
  { immediate: true },
);

// Refetch when view changes
watch([viewType, viewDay], () => {
  if (viewType.value !== "month") {
    void scheduleStore.hydrateFromApi(viewYear.value, viewMonth.value);
  }
});

const MONTH_NAMES = computed(() => [
  t("calendar.january"), t("calendar.february"), t("calendar.march"),
  t("calendar.april"), t("calendar.may"), t("calendar.june"),
  t("calendar.july"), t("calendar.august"), t("calendar.september"),
  t("calendar.october"), t("calendar.november"), t("calendar.december"),
]);
const DAY_NAMES = computed(() => [
  t("calendar.sun"), t("calendar.mon"), t("calendar.tue"),
  t("calendar.wed"), t("calendar.thu"), t("calendar.fri"), t("calendar.sat"),
]);

// ---- 日历网格数据 ----
interface DayCell {
  date: Date;          // 该天 0:00:00
  isCurrentMonth: boolean;
  isToday: boolean;
  key: string;         // localDateKey
  tasks: Task[];
  schedules: Schedule[];
  lunar: ReturnType<typeof getLunarInfo>;
}

const calendarCells = computed<DayCell[]>(() => {
  const year = viewYear.value;
  const month = viewMonth.value;
  const firstDay = new Date(year, month, 1);
  const lastDay = new Date(year, month + 1, 0);
  const startDow = firstDay.getDay(); // 0=Sun
  const todayKey = localDateKey(today);

  const cells: DayCell[] = [];

  // 填充上月光斑
  const prevMonth = new Date(year, month, 0);
  const prevDays = prevMonth.getDate();
  for (let i = startDow - 1; i >= 0; i--) {
    const d = new Date(year, month - 1, prevDays - i);
    cells.push(makeCell(d, false, todayKey));
  }
  // 当月
  for (let d = 1; d <= lastDay.getDate(); d++) {
    const date = new Date(year, month, d);
    cells.push(makeCell(date, true, todayKey));
  }
  // 填充下月光斑（凑满 6 行 = 42 格）
  const remaining = 42 - cells.length;
  for (let d = 1; d <= remaining; d++) {
    const date = new Date(year, month + 1, d);
    cells.push(makeCell(date, false, todayKey));
  }

  return cells;
});

function makeCell(date: Date, isCurrentMonth: boolean, todayKey: string): DayCell {
  const key = localDateKey(date);
  return {
    date,
    isCurrentMonth,
    isToday: key === todayKey,
    key,
    tasks: tasksByDate.value.get(key) ?? [],
    schedules: scheduleStore.schedulesByDate(key),
    lunar: getLunarInfo(date),
  };
}

// ---- 按日期分组任务 ----
const tasksByDate = computed(() => {
  const map = new Map<string, Task[]>();
  const year = viewYear.value;
  const month = viewMonth.value;

  for (const t of store.tasks) {
    if (t.deletedAt) continue;
    if (t.parentId) continue; // 子任务不独立显示在日历格子里

    // 重复任务：按 RRULE 展开到当月各天
    if (isRecurring(t.repeatRule, false)) {
      const days = getOccurrencesInMonth(t.repeatRule, false, year, month);
      for (const d of days) {
        const date = new Date(year, month, d);
        const key = localDateKey(date);
        if (!map.has(key)) map.set(key, []);
        map.get(key)!.push(t);
      }
      continue;
    }

    // 普通任务：只在截止日期显示
    if (t.completed) continue; // 已完成的不在日历格子里显示
    const dk = dueCalendarKey(t.dueAt);
    if (!dk) continue;
    if (!map.has(dk)) map.set(dk, []);
    map.get(dk)!.push(t);
  }
  return map;
});

// ---- 月导航 ----
function goToDay(date: Date) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  router.push(`/calendar/${y}-${m}-${d}`);
}

function prevMonth() {
  if (viewMonth.value === 0) {
    viewMonth.value = 11;
    viewYear.value--;
  } else {
    viewMonth.value--;
  }
}
function nextMonth() {
  if (viewMonth.value === 11) {
    viewMonth.value = 0;
    viewYear.value++;
  } else {
    viewMonth.value++;
  }
}
function goToday() {
  viewYear.value = today.getFullYear();
  viewMonth.value = today.getMonth();
  viewDay.value = today.getDate();
}

async function downloadIcal() {
  const BASE = import.meta.env.VITE_API_URL ?? "http://127.0.0.1:8000";
  const token = useAuthStore().token;
  try {
    const res = await fetch(`${BASE}/api/v1/sync/export-ical`, {
      headers: token ? { Authorization: `Bearer ${token}` } : {},
    });
    if (!res.ok) { message.error(t("export.exportFailed")); return; }
    const blob = await res.blob();
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "tasktick-export.ics";
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  } catch {
    message.error(t("export.exportFailed"));
  }
}

const viewDateLabel = computed(() => {
  const monthName = MONTH_NAMES.value[viewMonth.value];
  if (viewType.value === "day") {
    return `${viewYear.value} ${monthName} ${viewDay.value}`;
  }
  return `${viewYear.value} ${monthName}`;
});


// ---- 高亮当日有任务 ----
function dayHasTasks(cell: DayCell): boolean {
  return cell.tasks.length > 0 && cell.isCurrentMonth;
}

// ---- 显示日期的任务数 ----
function taskCountLabel(cell: DayCell): string {
  if (!cell.isCurrentMonth) return "";
  const n = cell.tasks.length;
  if (n === 0) return "";
  return n > 99 ? "99+" : String(n);
}

// ---- 优先级颜色 ----
function priorityColor(p: number): string {
  if (p === 3) return "#ef4444";
  if (p === 2) return "#f97316";
  if (p === 1) return "#22c55e";
  return "#6b7280";
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
</script>

<template>
  <div class="calendar-view">
    <!-- Header -->
    <div class="cal-header">
      <NSpace align="center" :size="12">
        <NText strong style="font-size: 16px">{{ viewDateLabel }}</NText>
        <NButton size="small" quaternary @click="goToday">{{ t("calendar.today") }}</NButton>
      </NSpace>
      <NSpace :size="8">
        <NButton size="small" quaternary @click="prevMonth">‹ {{ t("calendar.previousMonth") }}</NButton>
        <NButton size="small" quaternary @click="nextMonth">{{ t("calendar.nextMonth") }} ›</NButton>
        <NButton size="small" quaternary type="default" @click="downloadIcal">📥 {{ t("calendar.exportICal") }}</NButton>
      </NSpace>
    </div>

    <!-- Day-of-week header -->
    <div class="cal-weekdays">
      <div v-for="(name, i) in DAY_NAMES" :key="i" class="cal-weekday" :class="{ 'cal-weekday--weekend': i === 0 || i === 6 }">
        {{ name }}
      </div>
    </div>

    <!-- Month View -->
    <div class="cal-grid">
      <div
        v-for="cell in calendarCells"
        :key="cell.key"
        class="cal-cell"
        :class="{
          'cal-cell--other-month': !cell.isCurrentMonth,
          'cal-cell--today': cell.isToday,
          'cal-cell--has-tasks': dayHasTasks(cell),
        }"
        @click="cell.isCurrentMonth && goToDay(cell.date)"
      >
        <div class="cal-cell-day" :class="{ 'cal-cell-day--weekend': cell.lunar.isWeekend }">
          <div class="cal-cell-day-num">{{ cell.date.getDate() }}</div>
          <div
            v-if="cell.lunar.isHoliday"
            class="cal-cell-holiday"
            :class="{ 'cal-cell-holiday--weekend': cell.lunar.isWeekend, 'cal-cell-holiday--workday': cell.lunar.isWorkday }"
          >{{ cell.lunar.holidayName }}</div>
          <div v-else-if="cell.lunar.shortLabel" class="cal-cell-lunar" :class="{ 'cal-cell-lunar--weekend': cell.lunar.isWeekend }">
            {{ cell.lunar.shortLabel }}
          </div>
        </div>
        <div class="cal-cell-tasks">
          <template v-if="cell.isCurrentMonth">
            <div
              v-for="t in cell.tasks.slice(0, 3)"
              :key="t.id"
              class="cal-task-chip"
              :style="{ borderLeftColor: priorityColor(t.priority) }"
              :title="t.title"
              @click.stop="onEditTask(t)"
            >
              {{ t.title }}
            </div>
            <div v-if="cell.tasks.length > 3" class="cal-task-overflow">
              +{{ cell.tasks.length - 3 }} {{ t("calendar.more") }}
            </div>
            <div
              v-for="s in cell.schedules.slice(0, 2)"
              :key="s.id"
              class="cal-schedule-chip"
              :title="s.title"
              @click.stop="() => {}"
            >
              🗓 {{ s.title }}
            </div>
            <div v-if="cell.schedules.length > 2" class="cal-task-overflow">
              +{{ cell.schedules.length - 2 }} {{ t("calendar.schedule") }}
            </div>
          </template>
        </div>
        <div v-if="cell.isCurrentMonth && (cell.tasks.length > 0 || cell.schedules.length > 0)" class="cal-task-count">
          {{ taskCountLabel(cell) }}
        </div>
    </div>
    </div>

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
.calendar-view {
  width: 100%;
  user-select: none;
}

.cal-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 16px;
}

.cal-weekdays {
  display: grid;
  grid-template-columns: repeat(7, 1fr);
  margin-bottom: 4px;
}

.cal-weekday {
  text-align: center;
  font-size: 12px;
  font-weight: 600;
  padding: 4px 0;
  color: var(--tt-sidebar-text-muted, #7a8fa8);
}
.cal-weekday--weekend {
  color: var(--tt-sidebar-text-muted, #7a8fa8);
  opacity: 0.6;
}

.cal-grid {
  display: grid;
  grid-template-columns: repeat(7, 1fr);
  gap: 2px;
  border-radius: 10px;
  overflow: hidden;
}

.cal-cell {
  min-height: 88px;
  padding: 6px 6px 4px;
  background: var(--tt-subtle-bg, rgba(255, 255, 255, 0.03));
  border: 1px solid var(--tt-subtle-border, rgba(255, 255, 255, 0.06));
  border-radius: 6px;
  cursor: pointer;
  transition: background 0.12s, border-color 0.12s;
  position: relative;
  display: flex;
  flex-direction: column;
  gap: 2px;
}
.cal-cell:hover {
  background: var(--tt-row-hover-bg, rgba(255, 255, 255, 0.06));
  border-color: var(--tt-accent, #18a0ff);
}
.cal-cell--other-month {
  opacity: 0.25;
  cursor: default;
}
.cal-cell--other-month:hover {
  background: var(--tt-subtle-bg, rgba(255, 255, 255, 0.03));
  border-color: var(--tt-subtle-border, rgba(255, 255, 255, 0.06));
}
.cal-cell--today .cal-cell-day {
  background: var(--tt-accent, #18a0ff);
  color: #fff;
  border-radius: 50%;
  width: 26px;
  height: 26px;
  display: flex;
  align-items: center;
  justify-content: center;
  font-weight: 700;
}
.cal-cell--today {
  border-color: var(--tt-accent, rgba(24, 160, 255, 0.5));
  background: rgba(24, 160, 255, 0.06);
}

.cal-cell-day {
  display: flex;
  flex-direction: column;
  align-items: center;
  width: 100%;
  margin-bottom: 2px;
}
.cal-cell-day-num {
  font-size: 13px;
  font-weight: 500;
  line-height: 22px;
  text-align: center;
  width: 22px;
  height: 22px;
  color: var(--tt-sidebar-text, #e8edf4);
}
.cal-cell-day--weekend .cal-cell-day-num {
  color: var(--tt-sidebar-text-muted, #7a8fa8) !important;
}
.cal-cell-lunar {
  font-size: 9px;
  line-height: 1;
  color: var(--tt-sidebar-text-muted, #7a8fa8);
  text-align: center;
  max-width: 40px;
  overflow: hidden;
  text-overflow: ell;
  white-space: nowrap;
}
.cal-cell-lunar--weekend {
  color: #e57373;
}
.cal-cell-holiday {
  font-size: 9px;
  line-height: 1;
  font-weight: 600;
  padding: 1px 3px;
  border-radius: 3px;
  text-align: center;
  background: #ff4d4f;
  color: #fff;
}
.cal-cell-holiday--weekend {
  background: #ff7875;
}
.cal-cell-holiday--workday {
  background: #52c41a;
  font-size: 8px;
}

.cal-cell-tasks {
  display: flex;
  flex-direction: column;
  gap: 2px;
  flex: 1;
  overflow: hidden;
}

.cal-task-chip {
  font-size: 11px;
  line-height: 1.3;
  padding: 1px 4px;
  border-radius: 3px;
  background: var(--tt-subtle-bg, rgba(255, 255, 255, 0.07));
  border-left: 2px solid var(--tt-subtle-border, #6b7280);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  color: var(--tt-sidebar-text, #e8edf4);
}

.cal-schedule-chip {
  font-size: 10px;
  line-height: 1.3;
  padding: 1px 4px;
  border-radius: 3px;
  background: rgba(59, 130, 246, 0.15);
  border-left: 2px solid #3b82f6;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  color: var(--tt-sidebar-text, #e8edf4);
}

.cal-task-overflow {
  font-size: 10px;
  color: var(--tt-sidebar-text-muted, #7a8fa8);
  padding: 0 2px;
}

.cal-task-count {
  position: absolute;
  top: 4px;
  right: 4px;
  font-size: 10px;
  font-weight: 600;
  color: var(--tt-accent, #18a0ff);
  background: rgba(24, 160, 255, 0.12);
  border-radius: 8px;
  padding: 0 4px;
  min-width: 18px;
  text-align: center;
  line-height: 16px;
}

/* 选中日期弹窗 */
.day-task-list {
  display: flex;
  flex-direction: column;
  gap: 8px;
  max-height: 40vh;
  overflow-y: auto;
}
.day-task-row {
  display: flex;
  align-items: center;
  gap: 10px;
}
.day-task-title {
  flex: 1;
  font-size: 14px;
  word-break: break-word;
}

/* Theme-aware colors — use CSS vars from useTheme */
.cal-header,
.cal-weekday,
.cal-cell-day,
.day-task-title,
.day-task-list .n-text {
  color: var(--tt-sidebar-text, #e8edf4) !important;
}
.cal-weekday--weekend,
.cal-cell-day--weekend {
  color: var(--tt-sidebar-text-muted, #7a8fa8) !important;
}
.cal-task-overflow {
  color: var(--tt-sidebar-text-muted) !important;
}
.cal-header {
  color: var(--tt-sidebar-text, #e8edf4) !important;
}
.cal-task-chip {
  color: var(--tt-sidebar-text, #e8edf4) !important;
}
.cal-task-count {
  color: var(--tt-accent, #18a0ff) !important;
}
.day-task-list {
  background: var(--tt-card-bg, #18181c) !important;
}
.cal-header .n-button {
  color: var(--tt-sidebar-text, #e8edf4) !important;
}
.cal-header .n-button:hover {
  background: var(--tt-sidebar-active-bg) !important;
  color: var(--tt-sidebar-active-text) !important;
}
.project-manage-list {
  display: flex;
  flex-direction: column;
  gap: 6px;
  max-height: 200px;
  overflow-y: auto;
}
.project-manage-row {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 4px 0;
  border-bottom: 1px solid var(--tt-subtle-border, rgba(255, 255, 255, 0.06));
}
.project-manage-row:last-child {
  border-bottom: none;
}

/* Week View */
.week-grid {
  display: grid;
  grid-template-columns: repeat(7, 1fr);
  gap: 4px;
}
.week-cell {
  background: var(--tt-subtle-bg, rgba(255, 255, 255, 0.03));
  border: 1px solid var(--tt-subtle-border, rgba(255, 255, 255, 0.06));
  border-radius: 8px;
  padding: 8px 6px;
  min-height: 120px;
  cursor: pointer;
  transition: background 0.12s;
}
.week-cell:hover {
  background: var(--tt-row-hover-bg, rgba(255, 255, 255, 0.06));
}
.week-cell--other-month {
  opacity: 0.3;
}
.week-cell--today {
  border-color: var(--tt-accent, rgba(24, 160, 255, 0.5));
  background: rgba(24, 160, 255, 0.06);
}
.week-cell-header {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 4px;
  margin-bottom: 6px;
}
.week-cell-day {
  width: 28px;
  height: 28px;
  border-radius: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 13px;
  font-weight: 600;
  color: var(--tt-sidebar-text, #e8edf4);
}
.week-cell-day--today {
  background: var(--tt-accent, #18a0ff);
  color: #fff;
}
.week-cell-day--weekend {
  color: var(--tt-sidebar-text-muted, #7a8fa8) !important;
}
.week-cell-holiday {
  font-size: 9px;
  font-weight: 600;
  padding: 1px 4px;
  border-radius: 3px;
  background: #ff4d4f;
  color: #fff;
  margin-top: 2px;
}
.week-cell-holiday--workday {
  background: #52c41a;
}
.week-cell-lunar {
  font-size: 9px;
  color: var(--tt-sidebar-text-muted, #7a8fa8);
  margin-top: 2px;
}
.week-cell-lunar--weekend {
  color: #e57373;
}
.week-cell-tasks {
  display: flex;
  flex-direction: column;
  gap: 3px;
}
.week-task-chip {
  font-size: 11px;
  padding: 2px 4px;
  border-radius: 3px;
  background: var(--tt-subtle-bg, rgba(255, 255, 255, 0.07));
  border-left: 2px solid var(--tt-subtle-border, #6b7280);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  color: var(--tt-sidebar-text, #e8edf4);
}
.week-schedule-chip {
  font-size: 10px;
  padding: 2px 4px;
  border-radius: 3px;
  background: rgba(59, 130, 246, 0.15);
  border-left: 2px solid #3b82f6;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  color: var(--tt-sidebar-text, #e8edf4);
}
.week-task-overflow {
  font-size: 10px;
  color: var(--tt-sidebar-text-muted, #7a8fa8);
}

/* Day View */
.day-view {
  display: flex;
  flex-direction: column;
  gap: 0;
  border: 1px solid var(--tt-subtle-border, rgba(255, 255, 255, 0.08));
  border-radius: 8px;
  overflow: hidden;
}
.day-hour-column {
  display: flex;
  flex-direction: column;
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
.day-task-item {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 2px 4px;
  border-left: 2px solid #6b7280;
  margin-bottom: 2px;
  cursor: pointer;
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
