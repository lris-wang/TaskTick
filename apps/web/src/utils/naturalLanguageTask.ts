import type { TaskPriority } from "@tasktick/shared";

export interface NaturalTaskDraft {
  title: string;
  description: string | null;
  dueAtMs: number | null;
  priority: TaskPriority;
  isImportant: boolean;
  repeatRule: string | null;
}

function addDays(d: Date, n: number): Date {
  const x = new Date(d);
  x.setDate(x.getDate() + n);
  return x;
}

function endOfLocalDayMs(d: Date): number {
  const x = new Date(d);
  x.setHours(23, 59, 59, 999);
  return x.getTime();
}

/**
 * 轻量规则解析（无需后端）：识别常见中文时间词、重要/每日、优先级与首句标题。
 * 复杂语义可后续接 LLM API，在此函数内替换实现即可。
 */
export function parseNaturalLanguageTask(raw: string): NaturalTaskDraft {
  const text = raw.trim();
  if (!text) {
    return {
      title: "",
      description: null,
      dueAtMs: null,
      priority: 0,
      isImportant: false,
      repeatRule: null,
    };
  }

  const src = text;
  let work = text.replace(/\r\n/g, "\n");

  const isImportant = /重要|紧急|优先处理|!!|高优/.test(src);
  const repeatDaily = /每天|每日|天天|每个工作日|every\s*day/i.test(src);
  const repeatRule: string | null = repeatDaily ? "FREQ=DAILY" : null;

  let priority: TaskPriority = 0;
  if (/高优先级|非常重要|priority\s*high|urgent/i.test(src)) priority = 3;
  else if (/中优先级|priority\s*medium/i.test(src)) priority = 2;
  else if (/低优先级|不重要|priority\s*low/i.test(src)) priority = 1;

  let dueAtMs: number | null = null;
  const now = new Date();

  const setDue = (d: Date) => {
    dueAtMs = endOfLocalDayMs(d);
  };

  if (/今天|今日/.test(work)) {
    setDue(now);
    work = work.replace(/今天|今日/g, " ");
  } else if (/明天|翌日/.test(work)) {
    setDue(addDays(now, 1));
    work = work.replace(/明天|翌日/g, " ");
  } else if (/后天/.test(work)) {
    setDue(addDays(now, 2));
    work = work.replace(/后天/g, " ");
  } else if (/大后天/.test(work)) {
    setDue(addDays(now, 3));
    work = work.replace(/大后天/g, " ");
  }

  if (!dueAtMs) {
    const iso = work.match(/(\d{4})[-/](\d{1,2})[-/](\d{1,2})/);
    if (iso) {
      const y = Number.parseInt(iso[1] ?? "0", 10);
      const mo = Number.parseInt(iso[2] ?? "0", 10) - 1;
      const da = Number.parseInt(iso[3] ?? "0", 10);
      const dt = new Date(y, mo, da, 23, 59, 59, 999);
      if (!Number.isNaN(dt.getTime())) {
        dueAtMs = dt.getTime();
        work = work.replace(iso[0], " ");
      }
    }
  }

  if (!dueAtMs) {
    const cn = work.match(/(\d{1,2})\s*月\s*(\d{1,2})\s*日/);
    if (cn) {
      const mo = Number.parseInt(cn[1] ?? "0", 10) - 1;
      const da = Number.parseInt(cn[2] ?? "0", 10);
      const y = now.getFullYear();
      const dt = new Date(y, mo, da, 23, 59, 59, 999);
      if (!Number.isNaN(dt.getTime())) {
        dueAtMs = dt.getTime();
        work = work.replace(cn[0], " ");
      }
    }
  }

  work = work.replace(/\s+/g, " ").trim();

  let title = work;
  let description: string | null = null;

  const nl = text.replace(/\r\n/g, "\n");
  const br = nl.indexOf("\n");
  if (br >= 0) {
    title = nl.slice(0, br).trim();
    description = nl.slice(br + 1).trim() || null;
    title = stripInlineDateWords(title);
    if (description) description = stripInlineDateWords(description);
  } else {
    const punct = nl.search(/[。！？]/);
    if (punct > 0 && punct < nl.length - 1) {
      title = nl.slice(0, punct + 1).trim();
      description = nl.slice(punct + 1).trim() || null;
      title = stripInlineDateWords(title);
      if (description) description = stripInlineDateWords(description);
    } else {
      title = stripInlineDateWords(work);
    }
  }

  title = title.replace(/\s+/g, " ").trim();
  if (description) description = description.replace(/\s+/g, " ").trim() || null;

  if (title.length > 200) {
    const rest = title.slice(200).trim();
    title = title.slice(0, 200).trim();
    description = [rest, description].filter(Boolean).join(" ").trim() || description;
  }

  if (!title) {
    title = src.replace(/\s+/g, " ").trim().slice(0, 80) || "新任务";
  }

  return {
    title,
    description,
    dueAtMs,
    priority,
    isImportant,
    repeatRule,
  };
}

function stripInlineDateWords(s: string): string {
  return s
    .replace(/今天|今日|明天|翌日|后天|大后天/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}
