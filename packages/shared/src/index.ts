/** 同步协议主版本，用于 pull/push 协商与逐步淘汰老客户端 */
export const SYNC_PROTOCOL_VERSION = 1 as const;

export type EntityType = "task" | "project" | "tag" | "note";

export type TaskId = string;
export type ProjectId = string;
export type TagId = string;
export type HabitId = string;
export type HabitLogId = string;

/** 0 普通 1 低 2 中 3 高 */
export type TaskPriority = 0 | 1 | 2 | 3;

/** 本地挂载附件（MVP：Data URL 存于 localStorage；大文件请后续接对象存储） */
export interface TaskAttachment {
  id: string;
  name: string;
  mimeType: string;
  size: number;
  /** data:<mime>;base64,... */
  dataUrl: string;
}

/** Human-friendly拆解 of an RRULE, used only in the UI builder (not stored) */
export interface RRuleConfig {
  freq: "DAILY" | "WEEKLY" | "MONTHLY" | "YEARLY";
  interval: number;
  endType: "NEVER" | "COUNT" | "UNTIL";
  count?: number;
  /** End date as Unix timestamp ms (used with NDatePicker) */
  until?: number | null;
  byweekday?: number[]; // 0=Mon..6=Sun
}

/** 提醒设置 */
export interface ReminderSettings {
  /** 预设提醒时间（分钟），如 5, 15, 30, 60, 1440 */
  presets: number[];
  /** 自定义提醒时间（分钟），与 presets 合并去重 */
  customMinutes: number[];
  /** 自定义提醒时间点（ISO 字符串），独立于截止时间 */
  customTimes: string[];
}

export interface Task {
  id: TaskId;
  title: string;
  description: string | null;
  completed: boolean;
  /** ISO 8601，无则视为无开始日期 */
  startAt: string | null;
  /** ISO 8601，无则视为无截止日期 */
  dueAt: string | null;
  priority: TaskPriority;
  /** 所属分类（可多选） */
  projectIds: ProjectId[];
  tagIds: TagId[];
  /** 软删除时间 ISO，null 表示未删除 */
  deletedAt: string | null;
  /** 客户端幂等键，用于 push 去重 */
  clientMutationId: string | null;
  /** 重要任务：列表置顶并进入登录后提醒 */
  isImportant: boolean;
  /** RFC 5545 RRULE string, e.g. "FREQ=DAILY;COUNT=10" or "FREQ=WEEKLY;BYDAY=MO,WE,FR".
   * null means non-recurring.
   * Backward compat: null + legacy repeatDaily:true === FREQ=DAILY.
   */
  repeatRule: string | null;
  /** 开启后到期时发送桌面通知（默认 false） */
  notifyEnabled: boolean;
  /** 提醒设置 */
  reminderSettings?: ReminderSettings | null;
  attachments: TaskAttachment[];
  /** 父任务 ID，null 表示顶层任务 */
  parentId: TaskId | null;
  /** 手动排序权重，浮点数，越小越靠前；null 表示按自动排序（pin score + dueAt） */
  sortOrder: number | null;
  /** 依赖的前置任务 ID 列表，前置任务未完成时当前任务无法标记完成 */
  dependsOn: string[];
  /** 任务指派给哪个团队成员（仅团队项目任务有效） */
  assigneeId: string | null;
  /** 地理位置提醒 */
  locationReminders: LocationReminder[];
  createdAt: string;
  updatedAt: string;
}

export interface Note {
  id: string;
  userId: string;
  title: string;
  content: string | null;
  /** Whether content is Markdown format (rendered in preview mode) */
  isMarkdown: boolean;
  deletedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

/** 任务评论 */
export interface Comment {
  id: string;
  taskId: string;
  userId: string;
  /** 显示名称（冗余存储避免每次查询用户表） */
  authorName: string;
  content: string;
  createdAt: string;
}

export interface Project {
  id: ProjectId;
  name: string;
  color: string | null;
  deletedAt: string | null;
  createdAt: string;
  updatedAt: string;
  /** 内置分类：不可改名、不可删除，可与自定义分类一起调整顺序 */
  builtIn?: boolean;
  /** 所属团队 ID，为 null 表示个人项目 */
  teamId?: string | null;
  /** 所属分组 ID */
  groupId?: string | null;
  /** 是否归档（归档后不在默认视图中显示） */
  archived?: boolean;
  /** 是否静音（静音后不提醒） */
  muted?: boolean;
}

export interface ProjectGroup {
  id: string;
  userId: string;
  name: string;
  color: string | null;
  order: number;
  deletedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface Tag {
  id: TagId;
  name: string;
  color: string | null;
  deletedAt: string | null;
  createdAt: string;
  updatedAt: string;
  /** 所属团队 ID，为 null 表示个人标签 */
  teamId?: string | null;
}

/** 团队 */
export interface Team {
  id: string;
  name: string;
  ownerUserId: string;
  createdAt: string;
  updatedAt: string;
}

/** 团队成员角色 */
export type TeamRole = "owner" | "admin" | "member" | "guest";

/** 团队成员 */
export interface TeamMember {
  id: string;
  teamId: string;
  userId: string;
  role: TeamRole;
  joinedAt: string;
  userEmail?: string;
  userUsername?: string;
  userAvatarUrl?: string;
}

/** 日程（用户日历事件） */
export interface Schedule {
  id: string;
  title: string;
  description: string | null;
  startAt: string;  // ISO 8601
  endAt: string | null;  // ISO 8601
  timezone: string;
  location: string | null;
  createdAt: string;
  updatedAt: string;
}

/** 习惯追踪 */
export interface Habit {
  id: HabitId;
  name: string;
  /** 习惯描述 */
  description: string | null;
  /** 预设颜色 */
  color: string | null;
  /** 频率：daily=每天, weekly=每周特定天, custom=自定义 */
  frequency: "daily" | "weekly" | "custom";
  /** 每周重复的星期（0=周一, 6=周日），用于 weekly 模式 */
  weekDays?: number[];
  /** 每天的具体时间提醒（HH:mm 格式），为空则不提醒 */
  reminderTime: string | null;
  /** 创建时间 */
  createdAt: string;
  updatedAt: string;
  /** 软删除 */
  deletedAt: string | null;
}

/** 习惯完成记录 */
export interface HabitLog {
  id: string;
  habitId: HabitId;
  /** 完成日期（YYYY-MM-DD） */
  date: string;
  completedAt: string;
  note: string | null;
}

/** 番茄钟专注记录 */
export interface PomodoroSession {
  id: string;
  taskId: string | null;
  startedAt: string;
  endedAt: string | null;
  durationMinutes: number;
  completed: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface SyncPushEnvelopeV1 {
  protocolVersion: typeof SYNC_PROTOCOL_VERSION;
  deviceId: string;
  mutations: SyncMutationV1[];
}

export interface SyncMutationV1 {
  entityType: EntityType;
  entityId: string;
  clientMutationId: string;
  /** upsert 或软删 */
  op: "upsert" | "delete";
  payload: Record<string, unknown> | null;
  /** 客户端记录的实体更新时间，供 LWW 参考 */
  clientUpdatedAt: string;
}

export interface SyncPullQueryV1 {
  protocolVersion: typeof SYNC_PROTOCOL_VERSION;
  /** 服务端游标或 since 时间戳，由实现约定 */
  since: string | null;
}

export interface SyncPullResponseV1 {
  protocolVersion: typeof SYNC_PROTOCOL_VERSION;
  nextCursor: string | null;
  tasks: Task[];
  projects: Project[];
  tags: Tag[];
}

export type BuiltinView = "today" | "planned" | "engaged" | "next" | "all" | "completed" | "inbox";

export interface SmartListFilter {
  builtinView?: BuiltinView | null;
  projectIds?: string[];
  tagIds?: string[];
  priorityRange?: [number, number];
  isImportant?: boolean;
  dueFrom?: string;
  dueTo?: string;
  searchText?: string;
}

export interface SmartList {
  id: string;
  name: string;
  color: string | null;
  filter: SmartListFilter;
  createdAt: string;
  updatedAt: string;
}

/** 地理位置提醒 */
export interface LocationReminder {
  id: string;
  taskId: string;
  locationName: string;
  latitude: number;
  longitude: number;
  /** 电子围栏半径（米） */
  radius: number;
  /** "arrival" = 进入时提醒, "departure" = 离开时提醒 */
  reminderType: "arrival" | "departure";
  enabled: boolean;
  createdAt: string;
}
