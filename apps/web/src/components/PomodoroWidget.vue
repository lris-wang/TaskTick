<script setup lang="ts">
/**
 * PomodoroWidget — 番茄钟浮动计时器
 *
 * 固定在右下角，点击展开计时器面板。
 * 可选择关联任务，设置时长，开始/暂停/停止计时。
 */

import { storeToRefs } from "pinia";
import { computed, ref } from "vue";

import { usePomodoroStore } from "../stores/pomodoro";
import { useTaskStore } from "../stores/task";

const pomodoroStore = usePomodoroStore();
const taskStore = useTaskStore();

const { currentTaskId, durationMinutes, isRunning, isPaused, remainingSeconds, progress } =
  storeToRefs(pomodoroStore);
const { todayPomodoros, todayMinutes, weekPomodoros, weekMinutes } = storeToRefs(pomodoroStore);

const isExpanded = ref(false);

const DURATION_OPTIONS = [
  { label: "25 分钟", value: 25 },
  { label: "30 分钟", value: 30 },
  { label: "45 分钟", value: 45 },
  { label: "50 分钟", value: 50 },
];

// Tasks available for association (exclude deleted)
const availableTasks = computed(() =>
  taskStore.visibleTasks.filter((t) => !t.deletedAt),
);

const timerDisplay = computed(() => {
  const m = Math.floor(remainingSeconds.value / 60);
  const s = remainingSeconds.value % 60;
  return `${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
});

const selectedTask = computed({
  get: () => currentTaskId.value,
  set: (v) => pomodoroStore.selectTask(v),
});

function onDurationChange(v: number) {
  pomodoroStore.setDuration(v);
}

function handleStart() {
  void pomodoroStore.startTimer();
}

function handlePause() {
  pomodoroStore.pauseTimer();
}

function handleResume() {
  void pomodoroStore.resumeTimer();
}

async function handleStop() {
  await pomodoroStore.stopTimer(false);
}

function closePanel() {
  isExpanded.value = false;
}
</script>

<template>
  <div class="pomodoro-widget">
    <!-- 收起态：FAB -->
    <div
      v-if="!isExpanded"
      class="pomodoro-fab"
      title="番茄钟"
      @click="isExpanded = true"
    >
      🍅
      <span v-if="todayPomodoros > 0" class="pomodoro-fab-badge">{{ todayPomodoros }}</span>
    </div>

    <!-- 展开态：面板 -->
    <div v-else class="pomodoro-panel">
      <div class="pomodoro-panel-header">
        <span class="pomodoro-panel-title">🍅 番茄钟</span>
        <button class="pomodoro-close-btn" @click="closePanel">✕</button>
      </div>

      <!-- 时长选择 -->
      <div class="pomodoro-row">
        <span class="pomodoro-label">时长</span>
        <NSelect
          :value="durationMinutes"
          :options="DURATION_OPTIONS"
          size="small"
          style="width: 120px"
          :disabled="isRunning || isPaused"
          @update:value="onDurationChange"
        />
      </div>

      <!-- 关联任务 -->
      <div class="pomodoro-row">
        <span class="pomodoro-label">关联任务</span>
        <NSelect
          v-model:value="selectedTask"
          :options="availableTasks.map((t) => ({ label: t.title, value: t.id }))"
          size="small"
          clearable
          placeholder="可选"
          style="flex: 1"
          :disabled="isRunning || isPaused"
        />
      </div>

      <!-- 计时器 -->
      <div class="pomodoro-timer-area">
        <NProgress
          type="circle"
          :percentage="progress"
          :stroke-width="8"
          :width="120"
          color="#ef4444"
          rail-color="rgba(255,255,255,0.1)"
        >
          <div class="pomodoro-timer-display">{{ timerDisplay }}</div>
        </NProgress>
      </div>

      <!-- 控制按钮 -->
      <div class="pomodoro-controls">
        <template v-if="!isRunning && !isPaused">
          <NButton type="primary" size="small" @click="handleStart">开始</NButton>
        </template>
        <template v-else-if="isRunning">
          <NButton size="small" @click="handlePause">暂停</NButton>
          <NButton size="small" type="warning" @click="handleStop">停止</NButton>
        </template>
        <template v-else>
          <NButton type="primary" size="small" @click="handleResume">继续</NButton>
          <NButton size="small" type="warning" @click="handleStop">停止</NButton>
        </template>
      </div>

      <!-- 统计 -->
      <div class="pomodoro-stats">
        <div class="pomodoro-stat-item">
          <span class="pomodoro-stat-num">{{ todayPomodoros }}</span>
          <span class="pomodoro-stat-label">今日</span>
        </div>
        <div class="pomodoro-stat-item">
          <span class="pomodoro-stat-num">{{ todayMinutes }}m</span>
          <span class="pomodoro-stat-label">今日时长</span>
        </div>
        <div class="pomodoro-stat-item">
          <span class="pomodoro-stat-num">{{ weekPomodoros }}</span>
          <span class="pomodoro-stat-label">本周</span>
        </div>
        <div class="pomodoro-stat-item">
          <span class="pomodoro-stat-num">{{ weekMinutes }}m</span>
          <span class="pomodoro-stat-label">本周时长</span>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.pomodoro-widget {
  position: relative;
}

.pomodoro-fab {
  width: 64px;
  height: 64px;
  border-radius: 50%;
  background: linear-gradient(145deg, #ef4444 0%, #f97316 100%);
  border: none;
  cursor: pointer;
  font-size: 32px;
  display: flex;
  align-items: center;
  justify-content: center;
  box-shadow: 0 6px 24px rgba(239, 68, 68, 0.4);
  transition: transform 0.15s ease, box-shadow 0.15s ease;
  position: relative;
}
.pomodoro-fab:hover {
  transform: scale(1.08);
  box-shadow: 0 8px 28px rgba(239, 68, 68, 0.5);
}

.pomodoro-fab-badge {
  position: absolute;
  top: -4px;
  right: -4px;
  background: #18a0ff;
  color: #fff;
  border-radius: 10px;
  font-size: 11px;
  font-weight: 700;
  padding: 2px 6px;
  min-width: 20px;
  text-align: center;
  box-shadow: 0 2px 8px rgba(24, 160, 255, 0.4);
}

.pomodoro-panel {
  width: 300px;
  background: var(--tt-card-bg, #18181c);
  border: 1px solid rgba(255, 255, 255, 0.1);
  border-radius: 16px;
  padding: 16px;
  box-shadow: 0 12px 40px rgba(0, 0, 0, 0.4);
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.pomodoro-panel-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
}

.pomodoro-panel-title {
  font-size: 15px;
  font-weight: 600;
  color: var(--tt-sidebar-text, #e8edf4);
}

.pomodoro-close-btn {
  background: none;
  border: none;
  cursor: pointer;
  color: var(--tt-sidebar-text-muted, #7a8fa8);
  font-size: 14px;
  padding: 2px 6px;
  border-radius: 4px;
}
.pomodoro-close-btn:hover {
  background: rgba(255, 255, 255, 0.08);
}

.pomodoro-row {
  display: flex;
  align-items: center;
  gap: 8px;
}

.pomodoro-label {
  font-size: 12px;
  color: var(--tt-sidebar-text-muted, #7a8fa8);
  min-width: 40px;
}

.pomodoro-timer-area {
  display: flex;
  justify-content: center;
  padding: 8px 0;
}

.pomodoro-timer-display {
  font-size: 28px;
  font-weight: 700;
  font-variant-numeric: tabular-nums;
  color: var(--tt-sidebar-text, #e8edf4);
  text-align: center;
  line-height: 1;
}

.pomodoro-controls {
  display: flex;
  gap: 8px;
  justify-content: center;
}

.pomodoro-stats {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 8px;
  padding-top: 8px;
  border-top: 1px solid rgba(255, 255, 255, 0.06);
}

.pomodoro-stat-item {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 2px;
}

.pomodoro-stat-num {
  font-size: 18px;
  font-weight: 700;
  color: var(--tt-sidebar-text, #e8edf4);
}

.pomodoro-stat-label {
  font-size: 10px;
  color: var(--tt-sidebar-text-muted, #7a8fa8);
}

/* Theme support */
.pomodoro-panel,
.pomodoro-panel-title {
  background: var(--tt-card-bg, #18181c) !important;
  color: var(--tt-sidebar-text, #e8edf4) !important;
}
</style>
