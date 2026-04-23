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
  NCheckbox,
  NDatePicker,
  NDivider,
  NInput,
  NModal,
  NSelect,
  NSpace,
  NTag,
  NText,
  useMessage,
  NPopconfirm,
  NButtonGroup,
} from "naive-ui";
import { computed, ref, watch } from "vue";

import { useTaskStore } from "../stores/task";
import { useScheduleStore } from "../stores/schedule";
import { useAuthStore } from "../stores/auth";
import { dueCalendarKey, localDateKey } from "../utils/date";
import { getOccurrencesInMonth, isRecurring } from "../utils/rrule";
import { getLunarInfo } from "../composables/useLunar";

const message = useMessage();
const store = useTaskStore();
const scheduleStore = useScheduleStore();

const projectSelectOptions = computed(() =>
  store.projects
    .filter((p) => !p.deletedAt)
    .map((p) => ({ label: p.name, value: p.id })),
);

// ---- 当前日历月 ----
const today = new Date();
const viewYear = ref(today.getFullYear());
const viewMonth = ref(today.getMonth()); // 0-indexed
const viewType = ref<"month" | "week" | "day">("month");
const viewDay = ref(today.getDate());
const isMonthView = computed(() => viewType.value === "month");
const isWeekView = computed(() => viewType.value === "week");
const isDayView = computed(() => viewType.value === "day");

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

const MONTH_NAMES = [
  "一月", "二月", "三月", "四月", "五月", "六月",
  "七月", "八月", "九月", "十月", "十一月", "十二月",
];
const DAY_NAMES = ["日", "一", "二", "三", "四", "五", "六"];

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

function prevWeek() {
  const d = new Date(viewYear.value, viewMonth.value, viewDay.value - 7);
  viewYear.value = d.getFullYear();
  viewMonth.value = d.getMonth();
  viewDay.value = d.getDate();
}
function nextWeek() {
  const d = new Date(viewYear.value, viewMonth.value, viewDay.value + 7);
  viewYear.value = d.getFullYear();
  viewMonth.value = d.getMonth();
  viewDay.value = d.getDate();
}
function prevDay() {
  const d = new Date(viewYear.value, viewMonth.value, viewDay.value - 1);
  viewYear.value = d.getFullYear();
  viewMonth.value = d.getMonth();
  viewDay.value = d.getDate();
}
function nextDay() {
  const d = new Date(viewYear.value, viewMonth.value, viewDay.value + 1);
  viewYear.value = d.getFullYear();
  viewMonth.value = d.getMonth();
  viewDay.value = d.getDate();
}

async function downloadIcal() {
  const BASE = import.meta.env.VITE_API_URL ?? "http://127.0.0.1:8000";
  const token = useAuthStore().token;
  try {
    const res = await fetch(`${BASE}/api/v1/sync/export-ical`, {
      headers: token ? { Authorization: `Bearer ${token}` } : {},
    });
    if (!res.ok) { message.error("导出失败"); return; }
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
    message.error("导出失败");
  }
}

const viewDateLabel = computed(() => {
  if (viewType.value === "day") {
    return `${viewYear.value}年 ${MONTH_NAMES[viewMonth.value]} ${viewDay.value}日`;
  }
  return `${viewYear.value}年 ${MONTH_NAMES[viewMonth.value]}`;
});

// ---- Week view data ----
interface WeekDayCell {
  date: Date;
  key: string;
  isToday: boolean;
  isCurrentMonth: boolean;
  dayOfWeek: string;
  tasks: Task[];
  schedules: Schedule[];
  lunar: ReturnType<typeof getLunarInfo>;
}

const weekCells = computed<WeekDayCell[]>(() => {
  const center = new Date(viewYear.value, viewMonth.value, viewDay.value);
  const startOfWeek = new Date(center);
  startOfWeek.setDate(center.getDate() - center.getDay()); // Sunday

  const cells: WeekDayCell[] = [];
  const todayKey = localDateKey(today);

  for (let i = 0; i < 7; i++) {
    const d = new Date(startOfWeek);
    d.setDate(startOfWeek.getDate() + i);
    const key = localDateKey(d);
    cells.push({
      date: d,
      key,
      isToday: key === todayKey,
      isCurrentMonth: d.getMonth() === viewMonth.value,
      dayOfWeek: DAY_NAMES[i],
      tasks: tasksByDate.value.get(key) ?? [],
      schedules: scheduleStore.schedulesByDate(key),
      lunar: getLunarInfo(d),
    });
  }
  return cells;
});

// ---- Day view: hourly timeline ----
const HOURS = Array.from({ length: 24 }, (_, i) => i);
const dayDateKey = computed(() => localDateKey(new Date(viewYear.value, viewMonth.value, viewDay.value)));
const dayHourTasks = computed(() => tasksByDate.value.get(dayDateKey.value) ?? []);
const dayHourSchedules = computed(() => scheduleStore.schedulesByDate(dayDateKey.value));

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

// ---- 选中日期弹窗 ----
const showDayModal = ref(false);
const selectedDate = ref<Date | null>(null);
const selectedDateKey = computed(() => selectedDate.value ? localDateKey(selectedDate.value) : null);
// 日弹窗的任务（不包括子任务，子任务显示在父任务下）
const selectedDateTasks = computed(() => {
  if (!selectedDateKey.value) return [];
  const key = selectedDateKey.value;
  const [y, m, day] = key.split("-").map(Number);
  const year = y;
  const month = m - 1; // localDateKey uses 1-indexed month
  const tasks: Task[] = [];
  for (const t of store.tasks) {
    if (t.deletedAt) continue;
    if (t.parentId) continue; // 子任务不独立显示
    if (isRecurring(t.repeatRule, false)) {
      const days = getOccurrencesInMonth(t.repeatRule, false, year, month);
      if (days.includes(day)) tasks.push(t);
      continue;
    }
    const dk = dueCalendarKey(t.dueAt);
    if (dk === key) tasks.push(t);
  }
  return tasks;
});

const formTitle = ref("");
const formDueMs = ref<number | null>(null);
const formProjectId = ref<string | null>(null);

// Schedule form in day modal
const showScheduleForm = ref(false);
const scheduleTitle = ref("");
const scheduleStartAt = ref<number | null>(null);
const scheduleEndAt = ref<number | null>(null);

// Project management in day modal
const showProjectManage = ref(false);
const pendingDeleteProjectId = ref<string | null>(null);

// Used in template
const askDeleteProject = (projectId: string) => {
  pendingDeleteProjectId.value = projectId;
};
void askDeleteProject;

async function confirmDeleteProject() {
  if (!pendingDeleteProjectId.value) return;
  const ok = await store.deleteProject(pendingDeleteProjectId.value);
  if (!ok) {
    message.error("删除失败");
  } else {
    message.success("已删除分类");
    // If deleted project was selected, clear selection
    if (formProjectId.value === pendingDeleteProjectId.value) {
      const alive = store.projects.filter((p) => !p.deletedAt);
      formProjectId.value = alive[0]?.id ?? null;
    }
  }
  pendingDeleteProjectId.value = null;
}

function isCustomProject(projectId: string): boolean {
  const p = store.projects.find((x) => x.id === projectId);
  return p ? !p.builtIn : false;
}

const selectedDateSchedules = computed(() => {
  if (!selectedDateKey.value) return [];
  return scheduleStore.schedulesByDate(selectedDateKey.value);
});

function openDayModal(date: Date) {
  selectedDate.value = date;
  formTitle.value = "";
  formDueMs.value = date.getTime();
  // Default to first category
  const alive = store.projects.filter((p) => !p.deletedAt);
  formProjectId.value = alive[0]?.id ?? null;
  scheduleTitle.value = "";
  scheduleStartAt.value = date.getTime();
  scheduleEndAt.value = null;
  showScheduleForm.value = false;
  showDayModal.value = true;
}

async function submitDaySchedule() {
  const title = scheduleTitle.value.trim();
  if (!title) {
    message.warning("请填写日程标题");
    return;
  }
  if (!selectedDate.value || scheduleStartAt.value === null) return;

  const ok = await scheduleStore.addSchedule({
    title,
    startAt: new Date(scheduleStartAt.value).toISOString(),
    endAt: scheduleEndAt.value ? new Date(scheduleEndAt.value).toISOString() : null,
  });
  if (!ok) {
    message.error("创建失败");
    return;
  }
  message.success("已创建日程");
  scheduleTitle.value = "";
  scheduleStartAt.value = selectedDate.value.getTime();
  scheduleEndAt.value = null;
  showScheduleForm.value = false;
}

async function submitDayTask() {
  const title = formTitle.value.trim();
  if (!title) {
    message.warning("请填写任务标题");
    return;
  }
  if (!selectedDate.value) return;

  const dueAt = new Date(selectedDate.value);
  dueAt.setHours(23, 59, 59, 0);
  const dueAtIso = dueAt.toISOString();

  const ok = await store.addTask({
    title,
    dueAt: dueAtIso,
    projectIds: formProjectId.value ? [formProjectId.value] : [],
  });
  if (!ok) {
    message.error("创建失败");
    return;
  }
  message.success("已创建任务");
  showDayModal.value = false;
}

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
</script>

<template>
  <div class="calendar-view">
    <!-- Header -->
    <div class="cal-header">
      <NSpace align="center" :size="12">
        <NButtonGroup size="small">
          <NButton :type="viewType === 'month' ? 'primary' : 'default'" @click="viewType = 'month'">月</NButton>
          <NButton :type="viewType === 'week' ? 'primary' : 'default'" @click="viewType = 'week'">周</NButton>
          <NButton :type="viewType === 'day' ? 'primary' : 'default'" @click="viewType = 'day'">日</NButton>
        </NButtonGroup>
        <NText strong style="font-size: 16px">{{ viewDateLabel }}</NText>
        <NButton size="small" quaternary @click="goToday">今天</NButton>
      </NSpace>
      <NSpace :size="8">
        <NButton v-if="isMonthView" size="small" quaternary @click="prevMonth">‹ 上月</NButton>
        <NButton v-if="isMonthView" size="small" quaternary @click="nextMonth">下月 ›</NButton>
        <NButton v-if="isWeekView" size="small" quaternary @click="prevWeek">‹ 上周</NButton>
        <NButton v-if="isWeekView" size="small" quaternary @click="nextWeek">下周 ›</NButton>
        <NButton v-if="isDayView" size="small" quaternary @click="prevDay">‹ 前日</NButton>
        <NButton v-if="isDayView" size="small" quaternary @click="nextDay">后日 ›</NButton>
        <NButton size="small" quaternary type="default" @click="downloadIcal">📥 导出iCal</NButton>
      </NSpace>
    </div>
    </div>

    <!-- Day-of-week header -->
    <div class="cal-weekdays">
      <div v-for="(name, i) in DAY_NAMES" :key="i" class="cal-weekday" :class="{ 'cal-weekday--weekend': i === 0 || i === 6 }">
        {{ name }}
      </div>
    </div>

    <!-- Month View -->
    <div v-if="isMonthView" class="cal-grid">
      <div
        v-for="cell in calendarCells"
        :key="cell.key"
        class="cal-cell"
        :class="{
          'cal-cell--other-month': !cell.isCurrentMonth,
          'cal-cell--today': cell.isToday,
          'cal-cell--has-tasks': dayHasTasks(cell),
        }"
        @click="cell.isCurrentMonth && openDayModal(cell.date)"
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
              +{{ cell.tasks.length - 3 }} 更多
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
              +{{ cell.schedules.length - 2 }} 日程
            </div>
          </template>
        </div>
        <div v-if="cell.isCurrentMonth && (cell.tasks.length > 0 || cell.schedules.length > 0)" class="cal-task-count">
          {{ taskCountLabel(cell) }}
        </div>
    </div>

    <!-- Week View -->
    <div v-if="isWeekView" class="week-grid">
      <div
        v-for="cell in weekCells"
        :key="cell.key"
        class="week-cell"
        :class="{
          'week-cell--other-month': !cell.isCurrentMonth,
          'week-cell--today': cell.isToday,
        }"
        @click="openDayModal(cell.date)"
      >
        <div class="week-cell-header">
          <NText depth="3" style="font-size: 11px">{{ cell.dayOfWeek }}</NText>
          <div
            class="week-cell-day"
            :class="{
              'week-cell-day--today': cell.isToday,
              'week-cell-day--weekend': cell.lunar.isWeekend,
            }"
          >
            {{ cell.date.getDate() }}
          </div>
          <div
            v-if="cell.lunar.isHoliday"
            class="week-cell-holiday"
            :class="{ 'week-cell-holiday--workday': cell.lunar.isWorkday }"
          >{{ cell.lunar.holidayName }}</div>
          <div v-else-if="cell.lunar.shortLabel" class="week-cell-lunar">{{ cell.lunar.shortLabel }}</div>
        </div>
        <div class="week-cell-tasks">
          <div
            v-for="t in cell.tasks.slice(0, 4)"
            :key="t.id"
            class="week-task-chip"
            :style="{ borderLeftColor: priorityColor(t.priority) }"
            :title="t.title"
            @click.stop="onEditTask(t)"
          >
            {{ t.title }}
          </div>
          <div v-if="cell.tasks.length > 4" class="week-task-overflow">
            +{{ cell.tasks.length - 4 }} 更多
          </div>
          <div
            v-for="s in cell.schedules.slice(0, 2)"
            :key="s.id"
            class="week-schedule-chip"
          >
            🗓 {{ s.title }}
          </div>
        </div>
      </div>
    </div>

    <!-- Day View -->
    <div v-if="isDayView" class="day-view">
      <div class="day-hour-column">
        <div
          v-for="hour in HOURS"
          :key="hour"
          class="day-hour-row"
        >
          <div class="day-hour-label">{{ String(hour).padStart(2, "0") }}:00</div>
          <div class="day-hour-content">
            <div
              v-for="s in dayHourSchedules.filter(s => {
                const h = new Date(s.startAt).getHours();
                return h === hour;
              })"
              :key="s.id"
              :style="scheduleStyle(s)"
              class="day-schedule-block"
            >
              <NText style="font-size: 11px; font-weight: 500">{{ s.title }}</NText>
              <NText depth="3" style="font-size: 10px">
                {{ new Date(s.startAt).toLocaleTimeString([], {hour:'2-digit',minute:'2-digit' }) }}
                <span v-if="s.endAt"> - {{ new Date(s.endAt).toLocaleTimeString([], {hour:'2-digit',minute:'2-digit' }) }}</span>
              </NText>
            </div>
            <div
              v-for="t in dayHourTasks"
              :key="t.id"
              class="day-task-item"
              :style="{ borderLeftColor: priorityColor(t.priority) }"
              @click.stop="onEditTask(t)"
            >
              <NCheckbox
                :checked="t.completed"
                size="small"
                @update:checked="() => store.toggleComplete(t.id)"
              />
              <NText :style="{ textDecoration: t.completed ? 'line-through' : 'none', opacity: t.completed ? 0.5 : 1 }">
                {{ t.title }}
              </NText>
            </div>
          </div>
        </div>
      </div>
    </div>

    <!-- 选中日期的任务列表（侧边/弹窗） -->
    <NModal
      v-model:show="showDayModal"
      :title="selectedDate ? `${selectedDate.getMonth()+1}月${selectedDate.getDate()}日 任务与日程` : ''"
      style="width: min(440px, 90vw)"
    >
      <NSpace vertical :size="12" style="width: 100%">
        <!-- 已有任务 -->
        <div v-if="selectedDateTasks.length > 0" class="day-task-list">
          <div
            v-for="t in selectedDateTasks"
            :key="t.id"
            class="day-task-row"
          >
            <NCheckbox
              :checked="t.completed"
              @update:checked="() => store.toggleComplete(t.id)"
            />
            <NText
              class="day-task-title"
              :style="{ textDecoration: t.completed ? 'line-through' : 'none', opacity: t.completed ? 0.5 : 1 }"
            >
              {{ t.title }}
            </NText>
            <NText v-if="t.priority > 0" depth="3" style="font-size:12px">
              {{ ["","低","中","高"][t.priority] }}
            </NText>
          </div>
        </div>
        <NText v-else depth="3" style="font-size:13px">暂无任务</NText>

        <!-- 已有日程 -->
        <div v-if="selectedDateSchedules.length > 0" class="day-task-list">
          <div
            v-for="s in selectedDateSchedules"
            :key="s.id"
            class="day-task-row"
          >
            <NText class="day-task-title">🗓 {{ s.title }}</NText>
            <NText depth="3" style="font-size:12px" v-if="s.endAt">
              {{ new Date(s.startAt).toLocaleTimeString([], {hour:'2-digit',minute:'2-digit' }) }}
              - {{ new Date(s.endAt).toLocaleTimeString([], {hour:'2-digit',minute:'2-digit' }) }}
            </NText>
          </div>
        </div>
        <NText v-else-if="selectedDateTasks.length > 0" depth="3" style="font-size:13px">暂无日程</NText>

        <NDivider style="margin: 4px 0" />

        <!-- 快速添加任务 -->
        <NSelect
          v-model:value="formProjectId"
          :options="projectSelectOptions"
          placeholder="选择分类"
          clearable
          size="small"
          style="width: 100%; margin-bottom: 6px"
        />
        <NInput
          v-model:value="formTitle"
          placeholder="快速添加任务，回车确认"
          size="small"
          @keydown.enter.prevent="submitDayTask"
        />
        <NSpace style="margin-top: 6px">
          <NButton type="primary" size="small" @click="submitDayTask">添加任务</NButton>
          <NButton size="small" @click="showScheduleForm = !showScheduleForm">
            {{ showScheduleForm ? '取消' : '+ 添加日程' }}
          </NButton>
          <NButton size="small" quaternary @click="showProjectManage = !showProjectManage">
            {{ showProjectManage ? '收起分类' : '管理分类' }}
          </NButton>
        </NSpace>

        <!-- 分类管理 -->
        <template v-if="showProjectManage">
          <NDivider style="margin: 8px 0 6px" />
          <div class="project-manage-list">
            <div
              v-for="p in store.projects.filter((x) => !x.deletedAt)"
              :key="p.id"
              class="project-manage-row"
            >
              <NText style="flex: 1; font-size: 13px">{{ p.name }}</NText>
              <NTag v-if="p.builtIn" size="small" round :bordered="false" type="default">默认</NTag>
              <NPopconfirm
                v-if="isCustomProject(p.id)"
                @positive-click="confirmDeleteProject"
              >
                <template #trigger>
                  <NButton size="tiny" quaternary type="error">删除</NButton>
                </template>
                确定删除「{{ p.name }}」？
              </NPopconfirm>
            </div>
          </div>
        </template>

        <!-- 日程表单 -->
        <template v-if="showScheduleForm">
          <NDivider style="margin: 4px 0" />
          <NInput
            v-model:value="scheduleTitle"
            placeholder="日程标题"
          />
          <NSpace>
            <NText depth="3" style="font-size:12px">开始</NText>
            <NDatePicker
              v-model:value="scheduleStartAt"
              type="datetime"
              :is-date="false"
              style="width: 220px"
            />
          </NSpace>
          <NSpace>
            <NText depth="3" style="font-size:12px">结束</NText>
            <NDatePicker
              v-model:value="scheduleEndAt"
              type="datetime"
              :is-date="false"
              style="width: 220px"
            />
          </NSpace>
          <NButton type="primary" size="small" @click="submitDaySchedule">确认添加日程</NButton>
        </template>
      </NSpace>
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
</style>
