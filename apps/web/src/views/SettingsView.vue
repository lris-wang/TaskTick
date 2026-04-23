1<script setup lang="ts">
import { NButton, NCard, NDivider, NForm, NFormItem, NInput, NLayoutSider, NMenu, NSwitch, NText, NUpload, NSelect, useMessage } from "naive-ui";
import { ref, onMounted } from "vue";
import { useRouter } from "vue-router";

import type { Task, Project, Tag, Habit, HabitLog, Team, TeamMember } from "@tasktick/shared";
import { changeUsername, changePassword, getMe, changeAvatar, exportIcal } from "../api";
import { useAuthStore } from "../stores/auth";
import { useTaskStore } from "../stores/task";
import { useTagStore } from "../stores/tag";
import { useHabitStore } from "../stores/habit";
import { useTeamStore } from "../stores/team";
import { useTheme, COLOR_SCHEMES } from "../composables/useTheme";
import { usePushNotification } from "../composables/usePushNotification";
import { getLocale, setLocale, SUPPORTED_LOCALES } from "../locales";

const router = useRouter();
const auth = useAuthStore();
const message = useMessage();

const activeMenu = ref<string>("personal");

// Push notification state
const pushSupported = !!(navigator.serviceWorker && window.PushManager);
const pushComposable = usePushNotification();
const pushSubscribed = ref(pushComposable.isSubscribed);

async function togglePush(current: boolean) {
  if (current) {
    await pushComposable.unsubscribe();
    pushSubscribed.value = false;
    message.success("已关闭后台推送");
  } else {
    const ok = await pushComposable.subscribe();
    if (ok) {
      pushSubscribed.value = true;
      message.success("已开启后台推送");
    } else {
      message.error("开启推送失败，请检查通知权限");
    }
  }
}

onMounted(async () => {
  await pushComposable.init();
  pushSubscribed.value = pushComposable.isSubscribed;
});

// Theme / color scheme
const { themeMode, activeSchemeId } = useTheme();

// 强调色选项
const ACCENT_COLORS = [
  { name: "蓝色", value: "#18a0ff" },
  { name: "紫色", value: "#8b5cf6" },
  { name: "绿色", value: "#22c55e" },
  { name: "橙色", value: "#f97316" },
  { name: "粉色", value: "#ec4899" },
  { name: "青色", value: "#14b8a6" },
  { name: "红色", value: "#ef4444" },
  { name: "黄色", value: "#eab308" },
];
const activeAccentColor = ref(auth.themeAccentColor || "#18a0ff");

// 界面密度
const densityMode = ref<"compact" | "comfortable">("comfortable");

// 动画效果
const animationEnabled = ref(true);

// 圆角风格
const borderRadius = ref<"none" | "small" | "medium" | "large">("medium");

// ─── Backup / Restore ────────────────────────────────────────────────────────

const taskStore = useTaskStore();
const tagStore = useTagStore();
const habitStore = useHabitStore();
const teamStore = useTeamStore();

const exportLoading = ref(false);
const importLoading = ref(false);
const importFileName = ref("");
const importMode = ref<"merge" | "replace">("merge");

interface BackupData {
  version: 2;
  exportedAt: string; // ISO 8601
  tasks: Task[];
  projects: Project[];
  tags: Tag[];
  habits?: Habit[];
  habitLogs?: HabitLog[];
  teams?: Team[];
  teamMembers?: TeamMember[];
}

async function onExport() {
  exportLoading.value = true;
  try {
    const data: BackupData = {
      version: 2,
      exportedAt: new Date().toISOString(),
      tasks: taskStore.tasks,
      projects: taskStore.projects,
      tags: tagStore.tags,
      habits: habitStore.habits,
      habitLogs: habitStore.habitLogs,
      teams: teamStore.teams,
      teamMembers: teamStore.members,
    };
    const json = JSON.stringify(data, null, 2);
    const blob = new Blob([json], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    const dateStr = new Date().toISOString().slice(0, 10);
    a.download = `tasktick-backup-${dateStr}.json`;
    a.click();
    URL.revokeObjectURL(url);
    message.success("数据已导出");
  } catch (e) {
    console.error(e);
    message.error("导出失败");
  } finally {
    exportLoading.value = false;
  }
}

async function onExportIcal() {
  exportLoading.value = true;
  try {
    await exportIcal();
    message.success("iCalendar 已导出");
  } catch (e) {
    console.error(e);
    message.error("导出失败");
  } finally {
    exportLoading.value = false;
  }
}

interface ImportPreview {
  tasks: { added: number; updated: number; unchanged: number; total: number };
  projects: { added: number; updated: number; unchanged: number; total: number };
  tags: { added: number; updated: number; unchanged: number; total: number };
  habits?: { added: number; updated: number; unchanged: number; total: number };
  teams?: { added: number; updated: number; unchanged: number; total: number };
}

const importPreview = ref<ImportPreview | null>(null);
const pendingBackup = ref<BackupData | null>(null);
const showImportConfirm = ref(false);
const importResult = ref<{ ok: boolean; tasks: number; projects: number; tags: number; habits: number; teams: number } | null>(null);

function calcImportPreview(bd: BackupData): ImportPreview {
  const taskStats = { added: 0, updated: 0, unchanged: 0, total: bd.tasks.length };
  const projStats = { added: 0, updated: 0, unchanged: 0, total: bd.projects.length };
  const tagStats = { added: 0, updated: 0, unchanged: 0, total: bd.tags.length };

  for (const t of bd.tasks) {
    const existing = taskStore.tasks.find((x) => x.id === t.id);
    if (!existing) taskStats.added++;
    else if (new Date(t.updatedAt) > new Date(existing.updatedAt)) taskStats.updated++;
    else taskStats.unchanged++;
  }
  for (const p of bd.projects) {
    const existing = taskStore.projects.find((x) => x.id === p.id);
    if (!existing) projStats.added++;
    else if (new Date(p.updatedAt) > new Date(existing.updatedAt)) projStats.updated++;
    else projStats.unchanged++;
  }
  for (const t of bd.tags) {
    const existing = tagStore.tags.find((x) => x.id === t.id);
    if (!existing) tagStats.added++;
    else if (new Date(t.updatedAt) > new Date(existing.updatedAt)) tagStats.updated++;
    else tagStats.unchanged++;
  }

  const result: ImportPreview = { tasks: taskStats, projects: projStats, tags: tagStats };

  if (bd.habits) {
    const habitStats = { added: 0, updated: 0, unchanged: 0, total: bd.habits.length };
    for (const h of bd.habits) {
      const existing = habitStore.habits.find((x) => x.id === h.id);
      if (!existing) habitStats.added++;
      else if (new Date(h.updatedAt) > new Date(existing.updatedAt)) habitStats.updated++;
      else habitStats.unchanged++;
    }
    result.habits = habitStats;
  }

  if (bd.teams) {
    const teamStats = { added: 0, updated: 0, unchanged: 0, total: bd.teams.length };
    for (const tm of bd.teams) {
      const existing = teamStore.teams.find((x) => x.id === tm.id);
      if (!existing) teamStats.added++;
      else if (new Date(tm.updatedAt) > new Date(existing.updatedAt)) teamStats.updated++;
      else teamStats.unchanged++;
    }
    result.teams = teamStats;
  }

  return result;
}

async function onImportPreview(file: File): Promise<void> {
  importFileName.value = file.name;
  importResult.value = null;
  try {
    const text = await file.text();
    let parsed: unknown;
    try {
      parsed = JSON.parse(text);
    } catch {
      message.warning("文件格式错误，非有效 JSON");
      return;
    }
    if (!isBackupData(parsed)) {
      message.warning("文件格式错误，不是有效的 TaskTick 备份文件");
      return;
    }
    pendingBackup.value = parsed as BackupData;
    importPreview.value = calcImportPreview(parsed as BackupData);
    showImportConfirm.value = true;
  } catch {
    message.error("读取文件失败");
  }
}

async function onConfirmImport() {
  if (!pendingBackup.value) return;
  importLoading.value = true;
  showImportConfirm.value = false;

  try {
    const bd = pendingBackup.value;

    if (importMode.value === "replace") {
      taskStore.tasks = bd.tasks;
      taskStore.projects = bd.projects;
      tagStore.tags = bd.tags;
      if (bd.habits) habitStore.habits = bd.habits;
      if (bd.habitLogs) habitStore.habitLogs = bd.habitLogs;
      if (bd.teams) teamStore.teams = bd.teams;
      if (bd.teamMembers) teamStore.members = bd.teamMembers;
    } else {
      // LWW merge for tasks/projects/tags
      for (const t of bd.tasks) {
        const idx = taskStore.tasks.findIndex((x) => x.id === t.id);
        if (idx === -1) taskStore.tasks.push(t);
        else if (new Date(t.updatedAt) > new Date(taskStore.tasks[idx]!.updatedAt)) {
          taskStore.tasks[idx] = t;
        }
      }
      for (const p of bd.projects) {
        const idx = taskStore.projects.findIndex((x) => x.id === p.id);
        if (idx === -1) taskStore.projects.push(p);
        else if (new Date(p.updatedAt) > new Date(taskStore.projects[idx]!.updatedAt)) {
          taskStore.projects[idx] = p;
        }
      }
      for (const t of bd.tags) {
        const idx = tagStore.tags.findIndex((x) => x.id === t.id);
        if (idx === -1) tagStore.tags.push(t);
        else if (new Date(t.updatedAt) > new Date(tagStore.tags[idx]!.updatedAt)) {
          tagStore.tags[idx] = t;
        }
      }
      // Habits merge
      if (bd.habits) {
        for (const h of bd.habits) {
          const idx = habitStore.habits.findIndex((x) => x.id === h.id);
          if (idx === -1) habitStore.habits.push(h);
          else if (new Date(h.updatedAt) > new Date(habitStore.habits[idx]!.updatedAt)) {
            habitStore.habits[idx] = h;
          }
        }
      }
      // HabitLogs merge
      if (bd.habitLogs) {
        for (const log of bd.habitLogs) {
          const idx = habitStore.habitLogs.findIndex((x) => x.id === log.id);
          if (idx === -1) habitStore.habitLogs.push(log);
          else if (new Date(log.completedAt) > new Date(habitStore.habitLogs[idx]!.completedAt)) {
            habitStore.habitLogs[idx] = log;
          }
        }
      }
      // Teams merge
      if (bd.teams) {
        for (const tm of bd.teams) {
          const idx = teamStore.teams.findIndex((x) => x.id === tm.id);
          if (idx === -1) teamStore.teams.push(tm);
          else if (new Date(tm.updatedAt) > new Date(teamStore.teams[idx]!.updatedAt)) {
            teamStore.teams[idx] = tm;
          }
        }
      }
      // TeamMembers merge
      if (bd.teamMembers) {
        for (const m of bd.teamMembers) {
          const idx = teamStore.members.findIndex((x) => x.id === m.id);
          if (idx === -1) teamStore.members.push(m);
        }
      }
    }

    taskStore.persist();
    taskStore.persistProjects();
    tagStore.persist();
    habitStore.persist();
    teamStore.persist();

    const result = {
      ok: true,
      tasks: bd.tasks.length,
      projects: bd.projects.length,
      tags: bd.tags.length,
      habits: bd.habits?.length ?? 0,
      teams: bd.teams?.length ?? 0,
    };
    importResult.value = result;
    message.success(`导入完成：${result.tasks} 任务 / ${result.projects} 分类 / ${result.tags} 标签 / ${result.habits} 习惯 / ${result.teams} 团队`);
  } catch (e) {
    console.error(e);
    message.error("导入失败");
  } finally {
    importLoading.value = false;
    importFileName.value = "";
    pendingBackup.value = null;
    importPreview.value = null;
  }
}

function onCancelImport() {
  showImportConfirm.value = false;
  pendingBackup.value = null;
  importPreview.value = null;
  importFileName.value = "";
}

function isBackupData(v: unknown): v is BackupData {
  if (!v || typeof v !== "object") return false;
  const o = v as Record<string, unknown>;
  if (typeof o.version !== "number") return false;
  if (typeof o.exportedAt !== "string") return false;
  if (!Array.isArray(o.tasks)) return false;
  if (!Array.isArray(o.projects)) return false;
  if (!Array.isArray(o.tags)) return false;
  // v1 had no version field, but had tasks/projects/tags arrays
  // v2 adds habits, habitLogs, teams, teamMembers
  return true;
}

// 文件导入相关
const fileInputRef = ref<HTMLInputElement | null>(null);

function triggerFileInput() {
  fileInputRef.value?.click();
}

function onFileInputChange(e: Event) {
  const target = e.target as HTMLInputElement;
  const file = target.files?.[0];
  if (file) {
    void onImportPreview(file);
  }
  target.value = "";
}

// Current user info
const currentEmail = ref("");
const currentUsername = ref("");
const currentAvatarUrl = ref("");
const loadingUser = ref(true);

// Avatar change
const avatarLoading = ref(false);

// Username change
const newUsername = ref("");
const usernameLoading = ref(false);
const usernameError = ref("");
const usernameSuccess = ref("");

// Password change
const oldPassword = ref("");
const newPassword = ref("");
const confirmPassword = ref("");
const passwordLoading = ref(false);
const passwordError = ref("");
const passwordSuccess = ref("");

onMounted(async () => {
  const me = await getMe();
  if (me) {
    currentEmail.value = me.email;
    currentUsername.value = me.username;
    currentAvatarUrl.value = me.avatar_url || "";
    newUsername.value = me.username;
    auth.avatarUrl = me.avatar_url || null;
  } else {
    currentUsername.value = auth.username ?? "";
    newUsername.value = auth.username ?? "";
    currentAvatarUrl.value = auth.avatarUrl ?? "";
  }
  loadingUser.value = false;
});

async function onChangeAvatar(file: File) {
  avatarLoading.value = true;
  try {
    // For now, use a data URL for the avatar
    const reader = new FileReader();
    reader.onload = async (e) => {
      const dataUrl = e.target?.result as string;
      const data = await changeAvatar(dataUrl);
      if (data) {
        currentAvatarUrl.value = data.avatar_url;
        auth.avatarUrl = data.avatar_url;
        auth.persist();
        message.success("头像已更新");
      } else {
        message.error("头像更新失败");
      }
      avatarLoading.value = false;
    };
    reader.readAsDataURL(file);
  } catch {
    message.error("头像更新失败");
    avatarLoading.value = false;
  }
}

function handleAvatarChange(options: { file: import("naive-ui").UploadFileInfo }) {
  const nativeFile = options.file.file;
  if (nativeFile) {
    onChangeAvatar(nativeFile);
  }
  return false;
}

async function onChangeUsername() {
  usernameError.value = "";
  usernameSuccess.value = "";
  const u = newUsername.value.trim();
  if (!u) { usernameError.value = "用户名不能为空"; return; }
  if (u === currentUsername.value) { usernameError.value = "与当前用户名相同"; return; }

  usernameLoading.value = true;
  try {
    const data = await changeUsername(u);
    if (!data) {
      usernameError.value = "修改失败，用户名可能被占用";
      return;
    }
    currentUsername.value = data.username;
    auth.username = data.username;
    auth.persist();
    usernameSuccess.value = "用户名已更新";
  } finally {
    usernameLoading.value = false;
  }
}

async function onChangePassword() {
  passwordError.value = "";
  passwordSuccess.value = "";
  if (oldPassword.value.length < 4) { passwordError.value = "旧密码至少4位"; return; }
  if (newPassword.value.length < 4) { passwordError.value = "新密码至少4位"; return; }
  if (newPassword.value !== confirmPassword.value) { passwordError.value = "两次输入的新密码不一致"; return; }
  if (oldPassword.value === newPassword.value) { passwordError.value = "新密码不能与旧密码相同"; return; }

  passwordLoading.value = true;
  try {
    const ok = await changePassword(oldPassword.value, newPassword.value);
    if (!ok) {
      passwordError.value = "旧密码错误";
      return;
    }
    passwordSuccess.value = "密码已更新";
    oldPassword.value = "";
    newPassword.value = "";
    confirmPassword.value = "";
  } finally {
    passwordLoading.value = false;
  }
}

function onSwitchAccount() {
  auth.logout();
  router.push("/login");
}

const menuOptions = [
  { key: "personal", label: "个人信息" },
  { key: "language", label: "语言" },
  { key: "theme", label: "主题" },
  { key: "notification", label: "通知设置" },
  { key: "backup", label: "备份与恢复" },
];

// Language settings
const currentLocale = ref(getLocale());

function onLocaleChange(locale: string) {
  setLocale(locale);
  message.success(locale === "zh" ? "已切换到中文" : locale === "en" ? "Switched to English" : locale === "ja" ? "日本語に切り替えました" : "Language changed");
}
</script>

<template>
  <div class="settings-page">
    <div class="settings-header">
      <NButton text style="color:#18a0ff;font-size:13px" @click="router.back()">
        ← 返回
      </NButton>
      <NText strong style="font-size:18px">设置</NText>
      <div style="width:60px" />
    </div>

    <div class="settings-body">
      <!-- Left sidebar menu -->
      <NLayoutSider
        bordered
        :width="160"
        :native-scrollbar="false"
        content-style="padding: 12px 8px"
      >
        <NMenu
          v-model:value="activeMenu"
          :options="menuOptions"
          :indent="18"
        />
      </NLayoutSider>

      <!-- Right content area -->
      <div class="settings-content">
        <!-- 个人信息 -->
        <template v-if="activeMenu === 'personal'">
          <NCard class="settings-card" :bordered="false" size="large">
            <template #header>
              <NText strong style="font-size:15px">个人信息</NText>
            </template>

            <div v-if="loadingUser" class="loading-area">
              <NText depth="3">加载中…</NText>
            </div>

            <template v-else>
              <!-- Avatar -->
              <div class="avatar-section">
                <NText depth="3" style="font-size:13px;margin-bottom:8px;display:block">头像</NText>
                <div class="avatar-row">
                  <div class="avatar-preview">
                    <img
                      v-if="currentAvatarUrl"
                      :src="currentAvatarUrl"
                      alt="头像"
                      class="avatar-img"
                    />
                    <div v-else class="avatar-placeholder">
                      {{ currentUsername ? currentUsername[0].toUpperCase() : "?" }}
                    </div>
                  </div>
                  <NUpload
                    :custom="true"
                    :show-file-list="false"
                    @change="handleAvatarChange"
                  >
                    <NButton size="small" :loading="avatarLoading">
                      修改头像
                    </NButton>
                  </NUpload>
                </div>
              </div>

              <NDivider style="margin:12px 0" />

              <!-- Email (read-only) -->
              <div class="info-row">
                <NText depth="3" style="font-size:13px">邮箱</NText>
                <NText style="font-size:14px">{{ currentEmail }}</NText>
              </div>

              <NDivider style="margin:12px 0" />

              <!-- Change username -->
              <NForm @submit.prevent="onChangeUsername">
                <NFormItem label="用户名">
                  <NInput
                    v-model:value="newUsername"
                    placeholder="显示名称"
                    :disabled="usernameLoading"
                    size="large"
                  />
                </NFormItem>
                <NText v-if="usernameError" type="error" style="font-size:13px;display:block;margin-bottom:8px">{{ usernameError }}</NText>
                <NText v-if="usernameSuccess" type="success" style="font-size:13px;display:block;margin-bottom:8px">{{ usernameSuccess }}</NText>
                <NButton type="primary" size="small" :loading="usernameLoading" attr-type="submit">
                  保存用户名
                </NButton>
              </NForm>
            </template>
          </NCard>

          <NCard class="settings-card" :bordered="false" size="large" style="margin-top:16px">
            <template #header>
              <NText strong style="font-size:15px">修改密码</NText>
            </template>

            <NForm @submit.prevent="onChangePassword">
              <NFormItem label="旧密码">
                <NInput
                  v-model:value="oldPassword"
                  type="password"
                  show-password-on="click"
                  placeholder="请输入旧密码"
                  autocomplete="current-password"
                  :disabled="passwordLoading"
                  size="large"
                />
              </NFormItem>
              <NFormItem label="新密码">
                <NInput
                  v-model:value="newPassword"
                  type="password"
                  show-password-on="click"
                  placeholder="至少4位"
                  autocomplete="new-password"
                  :disabled="passwordLoading"
                  size="large"
                />
              </NFormItem>
              <NFormItem label="确认新密码">
                <NInput
                  v-model:value="confirmPassword"
                  type="password"
                  show-password-on="click"
                  placeholder="再次输入新密码"
                  autocomplete="new-password"
                  :disabled="passwordLoading"
                  size="large"
                />
              </NFormItem>
              <NText v-if="passwordError" type="error" style="font-size:13px;display:block;margin-bottom:8px">{{ passwordError }}</NText>
              <NText v-if="passwordSuccess" type="success" style="font-size:13px;display:block;margin-bottom:8px">{{ passwordSuccess }}</NText>
              <NButton type="primary" size="small" :loading="passwordLoading" attr-type="submit">
                修改密码
              </NButton>
            </NForm>
          </NCard>

          <NCard class="settings-card" :bordered="false" size="large" style="margin-top:16px">
            <template #header>
              <NText strong style="font-size:15px">切换账号</NText>
            </template>
            <NText depth="3" style="font-size:13px;display:block;margin-bottom:12px">
              退出当前账号，使用其他邮箱登录。
            </NText>
            <NButton type="warning" @click="onSwitchAccount">
              切换账号
            </NButton>
          </NCard>
        </template>

        <!-- 语言 -->
        <template v-else-if="activeMenu === 'language'">
          <NCard class="settings-card" :bordered="false" size="large">
            <template #header>
              <NText strong style="font-size:15px">语言设置</NText>
            </template>
            <NText depth="3" style="font-size:13px;display:block;margin-bottom:16px;line-height:1.6">
              选择界面显示语言。
            </NText>

            <NFormItem label="界面语言">
              <NSelect
                v-model:value="currentLocale"
                :options="SUPPORTED_LOCALES"
                style="width: 200px"
                @update:value="onLocaleChange"
              />
            </NFormItem>
          </NCard>
        </template>

        <!-- 主题 -->
        <template v-else-if="activeMenu === 'theme'">
          <NCard class="settings-card" :bordered="false" size="large">
            <template #header>
              <NText strong style="font-size:15px">主题设置</NText>
            </template>
            <NText depth="3" style="font-size:13px;display:block;margin-bottom:16px;line-height:1.6">
              选择深色或浅色模式，并搭配喜欢的主题颜色。
            </NText>

            <!-- 模式切换：深色 / 浅色 -->
            <NText strong depth="3" style="font-size:12px;display:block;margin-bottom:10px;letter-spacing:0.05em;text-transform:uppercase">
              模式
            </NText>
            <div class="mode-toggle">
              <button
                class="mode-btn"
                :class="{ 'mode-btn--active': themeMode === 'dark' }"
                @click="themeMode = 'dark'; auth.persist()"
              >
                <span class="mode-icon">🌙</span>
                <NText :depth="themeMode === 'dark' ? 1 : 3" style="font-size:13px">深色</NText>
              </button>
              <button
                class="mode-btn"
                :class="{ 'mode-btn--active': themeMode === 'light' }"
                @click="themeMode = 'light'; auth.persist()"
              >
                <span class="mode-icon">☀️</span>
                <NText :depth="themeMode === 'light' ? 1 : 3" style="font-size:13px">浅色</NText>
              </button>
            </div>

            <NDivider style="margin:16px 0" />

            <!-- 颜色色系 -->
            <NText strong depth="3" style="font-size:12px;display:block;margin-bottom:10px;letter-spacing:0.05em;text-transform:uppercase">
              基础色系
            </NText>
            <div class="scheme-grid">
              <button
                v-for="scheme in COLOR_SCHEMES"
                :key="scheme.id"
                class="scheme-btn"
                :class="{ 'scheme-btn--active': activeSchemeId === scheme.id }"
                @click="activeSchemeId = scheme.id; auth.persist()"
              >
                <div class="scheme-preview">
                  <div
                    class="scheme-preview-sidebar"
                    :style="{ background: themeMode === 'light' ? scheme.light.sidebarBg : scheme.dark.sidebarBg }"
                  >
                    <div
                      class="scheme-preview-dot"
                      :style="{ background: themeMode === 'light' ? scheme.light.accent : scheme.dark.accent }"
                    />
                    <div class="scheme-preview-line" />
                    <div class="scheme-preview-line scheme-preview-line--short" />
                  </div>
                </div>
                <NText
                  :depth="activeSchemeId === scheme.id ? 1 : 3"
                  style="font-size:12px;margin-top:6px;display:block;text-align:center"
                >
                  {{ scheme.name }}
                </NText>
              </button>
            </div>

            <NDivider style="margin:16px 0" />

            <!-- 自定义强调色 -->
            <NText strong depth="3" style="font-size:12px;display:block;margin-bottom:10px;letter-spacing:0.05em;text-transform:uppercase">
              强调色
            </NText>
            <div class="accent-colors">
              <button
                v-for="color in ACCENT_COLORS"
                :key="color.value"
                class="accent-btn"
                :class="{ 'accent-btn--active': activeAccentColor === color.value }"
                :style="{ background: color.value }"
                :title="color.name"
                @click="activeAccentColor = color.value"
              >
                <span v-if="activeAccentColor === color.value" class="accent-check">✓</span>
              </button>
            </div>
            <NText depth="3" style="font-size:11px;display:block;margin-top:6px">
              当前：{{ ACCENT_COLORS.find(c => c.value === activeAccentColor)?.name || '默认' }}
            </NText>

            <NDivider style="margin:16px 0" />

            <!-- 界面密度 -->
            <NText strong depth="3" style="font-size:12px;display:block;margin-bottom:10px;letter-spacing:0.05em;text-transform:uppercase">
              界面密度
            </NText>
            <div class="mode-toggle">
              <button
                class="mode-btn"
                :class="{ 'mode-btn--active': densityMode === 'compact' }"
                @click="densityMode = 'compact'"
              >
                <NText :depth="densityMode === 'compact' ? 1 : 3" style="font-size:13px">紧凑</NText>
              </button>
              <button
                class="mode-btn"
                :class="{ 'mode-btn--active': densityMode === 'comfortable' }"
                @click="densityMode = 'comfortable'"
              >
                <NText :depth="densityMode === 'comfortable' ? 1 : 3" style="font-size:13px">舒适</NText>
              </button>
            </div>

            <NDivider style="margin:16px 0" />

            <!-- 动画效果 -->
            <div style="display:flex;align-items:center;justify-content:space-between;">
              <div>
                <NText strong depth="3" style="font-size:13px;display:block">动画效果</NText>
                <NText depth="3" style="font-size:12px">开启页面过渡动画</NText>
              </div>
              <NSwitch v-model:value="animationEnabled" />
            </div>

            <NDivider style="margin:16px 0" />

            <!-- 圆角风格 -->
            <NText strong depth="3" style="font-size:12px;display:block;margin-bottom:10px;letter-spacing:0.05em;text-transform:uppercase">
              圆角风格
            </NText>
            <div class="mode-toggle">
              <button
                class="mode-btn"
                :class="{ 'mode-btn--active': borderRadius === 'none' }"
                @click="borderRadius = 'none'"
              >
                <NText :depth="borderRadius === 'none' ? 1 : 3" style="font-size:13px">无</NText>
              </button>
              <button
                class="mode-btn"
                :class="{ 'mode-btn--active': borderRadius === 'small' }"
                @click="borderRadius = 'small'"
              >
                <NText :depth="borderRadius === 'small' ? 1 : 3" style="font-size:13px">小</NText>
              </button>
              <button
                class="mode-btn"
                :class="{ 'mode-btn--active': borderRadius === 'medium' }"
                @click="borderRadius = 'medium'"
              >
                <NText :depth="borderRadius === 'medium' ? 1 : 3" style="font-size:13px">中</NText>
              </button>
              <button
                class="mode-btn"
                :class="{ 'mode-btn--active': borderRadius === 'large' }"
                @click="borderRadius = 'large'"
              >
                <NText :depth="borderRadius === 'large' ? 1 : 3" style="font-size:13px">大</NText>
              </button>
            </div>
          </NCard>
        </template>

        <!-- 通知设置 -->
        <template v-else-if="activeMenu === 'notification'">
          <NCard class="settings-card" :bordered="false" size="large">
            <template #header>
              <NText strong style="font-size:15px">通知设置</NText>
            </template>
            <NSpace vertical :size="16">
              <div>
                <NSpace align="center" :size="12">
                  <NSwitch
                    :value="pushSubscribed"
                    :disabled="!pushSupported"
                    @update:value="void togglePush(pushSubscribed)"
                  />
                  <NText>{{ pushSubscribed ? "后台推送已开启" : "后台推送已关闭" }}</NText>
                </NSpace>
                <NText depth="3" style="font-size:12px;display:block;margin-top:4px">
                  {{
                    !pushSupported
                      ? "您的浏览器不支持 Web Push 推送通知"
                      : pushSubscribed
                        ? "浏览器关闭后仍可收到任务到期提醒"
                        : "开启后，即使浏览器关闭，任务到期时也会收到系统通知"
                  }}
                </NText>
              </div>
              <NDivider />
              <div>
                <NSpace align="center" :size="12">
                  <NSwitch
                    :value="auth.desktopNotifyEnabled"
                    @update:value="void auth.toggleDesktopNotify()"
                  />
                  <NText>{{ auth.desktopNotifyEnabled ? "内置提醒已开启" : "内置提醒已关闭" }}</NText>
                </NSpace>
                <NText depth="3" style="font-size:12px;display:block;margin-top:4px">
                  开启后，打开浏览器时任务到期会在页面内弹出通知
                </NText>
              </div>
            </NSpace>
          </NCard>
        </template>

        <!-- 备份与恢复 -->
        <template v-else-if="activeMenu === 'backup'">
          <NCard class="settings-card" :bordered="false" size="large">
            <template #header>
              <NText strong style="font-size:15px">导出数据</NText>
            </template>
            <NText depth="3" style="font-size:13px;display:block;margin-bottom:12px;line-height:1.6">
              将所有任务、分类和标签导出为 JSON 文件。可用于备份或在另一台设备上恢复。
            </NText>
            <!-- 本地数据统计 -->
            <div class="backup-stats">
              <div class="backup-stat">
                <NText class="backup-stat-num">{{ taskStore.tasks.filter(t => !t.deletedAt).length }}</NText>
                <NText depth="3" style="font-size:12px">任务</NText>
              </div>
              <div class="backup-stat">
                <NText class="backup-stat-num">{{ taskStore.projects.filter(p => !p.deletedAt).length }}</NText>
                <NText depth="3" style="font-size:12px">分类</NText>
              </div>
              <div class="backup-stat">
                <NText class="backup-stat-num">{{ tagStore.tags.filter(t => !t.deletedAt).length }}</NText>
                <NText depth="3" style="font-size:12px">标签</NText>
              </div>
              <div class="backup-stat">
                <NText class="backup-stat-num">{{ habitStore.activeHabits.length }}</NText>
                <NText depth="3" style="font-size:12px">习惯</NText>
              </div>
              <div class="backup-stat">
                <NText class="backup-stat-num">{{ teamStore.teams.length }}</NText>
                <NText depth="3" style="font-size:12px">团队</NText>
              </div>
            </div>
            <NButton type="primary" :loading="exportLoading" @click="onExport">
              导出为 JSON 文件
            </NButton>
            <NButton style="margin-top:8px" :loading="exportLoading" @click="onExportIcal">
              导出为 iCalendar (.ics)
            </NButton>
          </NCard>

          <NCard class="settings-card" :bordered="false" size="large" style="margin-top:16px">
            <template #header>
              <NText strong style="font-size:15px">导入数据</NText>
            </template>
            <NText depth="3" style="font-size:13px;display:block;margin-bottom:12px;line-height:1.6">
              从备份文件导入数据。导入前可以预览数据变更，选择合并或覆盖模式。
            </NText>

            <!-- 导入模式选择 -->
            <div class="import-mode-toggle">
              <button
                class="import-mode-btn"
                :class="{ 'import-mode-btn--active': importMode === 'merge' }"
                @click="importMode = 'merge'"
              >
                <NText :depth="importMode === 'merge' ? 1 : 3" style="font-size:13px">智能合并</NText>
                <NText depth="3" style="font-size:11px">以最新修改时间合并，保留本地更新</NText>
              </button>
              <button
                class="import-mode-btn"
                :class="{ 'import-mode-btn--active': importMode === 'replace' }"
                @click="importMode = 'replace'"
              >
                <NText :depth="importMode === 'replace' ? 1 : 3" style="font-size:13px">完全覆盖</NText>
                <NText depth="3" style="font-size:11px">用备份文件完全替换本地数据</NText>
              </button>
            </div>

            <input
              ref="fileInputRef"
              type="file"
              accept=".json"
              style="display: none"
              @change="onFileInputChange"
            />
            <NButton :loading="importLoading" style="margin-top:12px" @click="triggerFileInput">
              选择备份文件
            </NButton>
            <NText v-if="importFileName" depth="3" style="font-size:12px;display:block;margin-top:8px">
              已选择：{{ importFileName }}
            </NText>

            <!-- 导入结果 -->
            <div v-if="importResult" class="import-result">
              <NText style="font-size:13px;color:#22c55e">
                ✓ 导入成功：{{ importResult.tasks }} 任务 / {{ importResult.projects }} 分类 / {{ importResult.tags }} 标签
              </NText>
            </div>
          </NCard>

          <!-- 导入确认弹窗 -->
          <NModal
            v-model:show="showImportConfirm"
            preset="card"
            title="导入预览"
            style="width: min(480px, 95vw)"
          >
            <NSpace vertical :size="10" style="width:100%">
              <NText depth="3" style="font-size:13px">
                文件：{{ importFileName }}
              </NText>

              <template v-if="importPreview">
                <!-- 任务预览 -->
                <div class="preview-section">
                  <NText strong style="font-size:14px">任务</NText>
                  <div class="preview-stats">
                    <span class="preview-badge preview-badge--add">+{{ importPreview.tasks.added }} 新增</span>
                    <span class="preview-badge preview-badge--update">~{{ importPreview.tasks.updated }} 更新</span>
                    <span class="preview-badge preview-badge--same">={{ importPreview.tasks.unchanged }} 不变</span>
                    <NText depth="3" style="font-size:12px;margin-left:4px">共 {{ importPreview.tasks.total }} 条</NText>
                  </div>
                </div>

                <!-- 分类预览 -->
                <div class="preview-section">
                  <NText strong style="font-size:14px">分类</NText>
                  <div class="preview-stats">
                    <span class="preview-badge preview-badge--add">+{{ importPreview.projects.added }} 新增</span>
                    <span class="preview-badge preview-badge--update">~{{ importPreview.projects.updated }} 更新</span>
                    <span class="preview-badge preview-badge--same">={{ importPreview.projects.unchanged }} 不变</span>
                    <NText depth="3" style="font-size:12px;margin-left:4px">共 {{ importPreview.projects.total }} 条</NText>
                  </div>
                </div>

                <!-- 标签预览 -->
                <div class="preview-section">
                  <NText strong style="font-size:14px">标签</NText>
                  <div class="preview-stats">
                    <span class="preview-badge preview-badge--add">+{{ importPreview.tags.added }} 新增</span>
                    <span class="preview-badge preview-badge--update">~{{ importPreview.tags.updated }} 更新</span>
                    <span class="preview-badge preview-badge--same">={{ importPreview.tags.unchanged }} 不变</span>
                    <NText depth="3" style="font-size:12px;margin-left:4px">共 {{ importPreview.tags.total }} 条</NText>
                  </div>
                </div>

                <!-- 习惯预览 -->
                <div v-if="importPreview.habits" class="preview-section">
                  <NText strong style="font-size:14px">习惯</NText>
                  <div class="preview-stats">
                    <span class="preview-badge preview-badge--add">+{{ importPreview.habits.added }} 新增</span>
                    <span class="preview-badge preview-badge--update">~{{ importPreview.habits.updated }} 更新</span>
                    <span class="preview-badge preview-badge--same">={{ importPreview.habits.unchanged }} 不变</span>
                    <NText depth="3" style="font-size:12px;margin-left:4px">共 {{ importPreview.habits.total }} 条</NText>
                  </div>
                </div>

                <!-- 团队预览 -->
                <div v-if="importPreview.teams" class="preview-section">
                  <NText strong style="font-size:14px">团队</NText>
                  <div class="preview-stats">
                    <span class="preview-badge preview-badge--add">+{{ importPreview.teams.added }} 新增</span>
                    <span class="preview-badge preview-badge--update">~{{ importPreview.teams.updated }} 更新</span>
                    <span class="preview-badge preview-badge--same">={{ importPreview.teams.unchanged }} 不变</span>
                    <NText depth="3" style="font-size:12px;margin-left:4px">共 {{ importPreview.teams.total }} 条</NText>
                  </div>
                </div>
              </template>

              <NDivider style="margin:4px 0" />

              <NSpace>
                <NButton @click="onCancelImport">取消</NButton>
                <NButton type="primary" :loading="importLoading" @click="onConfirmImport">
                  确认导入
                </NButton>
              </NSpace>
            </NSpace>
          </NModal>
        </template>
      </div>
    </div>
  </div>
</template>

<style scoped>
.settings-page {
  min-height: 100vh;
  background: var(--tt-app-bg, #0a0a0f);
  padding: 24px;
}
.settings-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 20px;
  max-width: 680px;
  margin-left: auto;
  margin-right: auto;
}
.settings-body {
  display: flex;
  gap: 16px;
  max-width: 680px;
  margin: 0 auto;
  align-items: flex-start;
}
.settings-content {
  flex: 1;
  min-width: 0;
}
.settings-card {
  border-radius: 14px;
  background: var(--tt-card-bg, #18181c);
  border-color: rgba(255,255,255,0.06);
}
.info-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 4px 0;
}
.loading-area {
  padding: 16px 0;
  text-align: center;
}
.coming-soon {
  padding: 32px 0;
  text-align: center;
}
.avatar-section {
  margin-bottom: 4px;
}
.avatar-row {
  display: flex;
  align-items: center;
  gap: 16px;
}
.avatar-preview {
  width: 64px;
  height: 64px;
  border-radius: 50%;
  overflow: hidden;
  background: #2a2a2e;
  display: flex;
  align-items: center;
  justify-content: center;
}
.avatar-img {
  width: 100%;
  height: 100%;
  object-fit: cover;
}
.avatar-placeholder {
  font-size: 24px;
  font-weight: 600;
  color: #666;
}
.scheme-grid {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 12px;
}
.scheme-btn {
  display: flex;
  flex-direction: column;
  align-items: center;
  padding: 10px 8px 12px;
  border-radius: 12px;
  border: 2px solid rgba(255, 255, 255, 0.08);
  background: rgba(255, 255, 255, 0.04);
  cursor: pointer;
  transition: all 0.2s ease;
}
.scheme-btn:hover {
  border-color: var(--tt-accent, #18a0ff);
  transform: translateY(-1px);
  box-shadow: 0 4px 12px rgba(0,0,0,0.15);
}
.scheme-btn--active {
  border-color: var(--tt-accent, #18a0ff);
  box-shadow: 0 0 0 3px rgba(24, 160, 255, 0.2);
}
.scheme-preview {
  width: 100%;
  height: 56px;
  border-radius: 8px;
  overflow: hidden;
  display: flex;
}
.scheme-preview-sidebar {
  flex: 1;
  padding: 10px 8px;
  display: flex;
  flex-direction: column;
  gap: 5px;
  align-items: flex-start;
  border-radius: 8px 0 0 8px;
}
.scheme-preview-dot {
  width: 12px;
  height: 12px;
  border-radius: 50%;
  margin-bottom: 2px;
}
.scheme-preview-line {
  width: 80%;
  height: 5px;
  border-radius: 3px;
  background: rgba(255, 255, 255, 0.2);
}
.scheme-preview-line--short {
  width: 50%;
}
.mode-toggle {
  display: flex;
  gap: 8px;
}
.mode-btn {
  flex: 1;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 6px;
  padding: 10px 16px;
  border-radius: 10px;
  border: 2px solid rgba(255, 255, 255, 0.08);
  background: rgba(255, 255, 255, 0.04);
  cursor: pointer;
  color: #888;
  transition: all 0.2s ease;
  font-size: 13px;
}
.mode-btn:hover {
  border-color: var(--tt-accent, #18a0ff);
  background: rgba(24, 160, 255, 0.06);
}
.mode-btn--active {
  border-color: var(--tt-accent, #18a0ff);
  background: rgba(24, 160, 255, 0.1);
  box-shadow: 0 0 0 3px rgba(24, 160, 255, 0.15);
  color: var(--tt-accent, #18a0ff);
}
.mode-icon {
  font-size: 18px;
}

/* Backup stats */
.backup-stats {
  display: flex;
  gap: 16px;
  margin-bottom: 14px;
}
.backup-stat {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 2px;
  background: rgba(255,255,255,0.04);
  border: 1px solid rgba(255,255,255,0.08);
  border-radius: 8px;
  padding: 8px 16px;
}
.backup-stat-num {
  font-size: 20px;
  font-weight: 700;
  color: var(--tt-accent, #18a0ff) !important;
}

/* Import mode toggle */
.import-mode-toggle {
  display: flex;
  gap: 8px;
  margin-bottom: 4px;
}
.import-mode-btn {
  flex: 1;
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  gap: 2px;
  padding: 10px 12px;
  border-radius: 8px;
  border: 2px solid rgba(255,255,255,0.08);
  background: rgba(255,255,255,0.04);
  cursor: pointer;
  transition: border-color 0.2s, box-shadow 0.2s;
  text-align: left;
}
.import-mode-btn:hover {
  border-color: rgba(24,160,255,0.3);
}
.import-mode-btn--active {
  border-color: var(--tt-accent, #18a0ff);
  background: rgba(24,160,255,0.06);
  box-shadow: 0 0 0 2px rgba(24,160,255,0.15);
}

/* Import result */
.import-result {
  margin-top: 10px;
  padding: 10px 12px;
  border-radius: 8px;
  background: rgba(34,197,94,0.1);
  border: 1px solid rgba(34,197,94,0.2);
}

/* Preview section */
.preview-section {
  display: flex;
  flex-direction: column;
  gap: 6px;
}
.preview-stats {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  align-items: center;
}
.preview-badge {
  font-size: 12px;
  padding: 2px 8px;
  border-radius: 4px;
  font-weight: 500;
}
.preview-badge--add {
  background: rgba(34,197,94,0.15);
  color: #4ade80;
}
.preview-badge--update {
  background: rgba(249,115,22,0.15);
  color: #fb923c;
}
.preview-badge--same {
  background: rgba(255,255,255,0.08);
  color: rgba(255,255,255,0.5);
}

/* 强调色选择器 */
.accent-colors {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
}
.accent-btn {
  width: 32px;
  height: 32px;
  border-radius: 50%;
  border: 2px solid transparent;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  transition: transform 0.15s, border-color 0.15s;
}
.accent-btn:hover {
  transform: scale(1.1);
}
.accent-btn--active {
  border-color: #fff;
  box-shadow: 0 0 0 2px rgba(255,255,255,0.3);
}
.accent-check {
  color: #fff;
  font-size: 14px;
  font-weight: bold;
  text-shadow: 0 1px 2px rgba(0,0,0,0.3);
}
</style>
