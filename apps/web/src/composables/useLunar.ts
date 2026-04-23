/**
 * useLunar — 农历 + 节假日工具
 * Uses the `lunar` npm package for Gregorian ↔ Lunar conversion.
 * Holidays are hard-coded for accuracy (Chinese holidays are stable by law).
 */

import { toLunar, formatLunar } from "lunar";

/** 农历月份称呼 */
const LUNAR_MONTH_NAMES = ["正", "二", "三", "四", "五", "六", "七", "八", "九", "十", "冬", "腊"];
/** 农历日期称呼 */
const LUNAR_DAY_NAMES = [
  "初一", "初二", "初三", "初四", "初五", "初六", "初七", "初八", "初九", "初十",
  "十一", "十二", "十三", "十四", "十五", "十六", "十七", "十八", "十九", "二十",
  "廿一", "廿二", "廿三", "廿四", "廿五", "廿六", "廿七", "廿八", "廿九", "三十",
];

function isWeekend(d: Date): boolean {
  const dow = d.getDay();
  return dow === 0 || dow === 6;
}

/** 中国法定节假日（yyyy-mm-dd → 节日名称），仅标记核心节日当天 */
const FIXED_HOLIDAYS: Record<string, string> = {
  "2026-01-01": "元旦",
  "2026-04-04": "清明",
  "2026-04-05": "清明",
  "2026-04-06": "清明",
  "2026-05-01": "劳动",
  "2026-10-01": "国庆",
  "2026-10-02": "国庆",
  "2026-10-03": "国庆",
  "2026-10-04": "中秋",
  "2026-10-05": "国庆",
  "2026-10-06": "国庆",
  "2026-10-07": "国庆",
};

function localDateKey(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

/** 农历节日映射：key = "m-d"，value = 节日名 */
const LUNAR_HOLIDAYS: Record<string, string> = {
  "1-1": "春节",
  "1-15": "元宵",
  "5-5": "端午",
  "7-7": "七夕",
  "8-15": "中秋",
  "9-9": "重阳",
};

export interface LunarInfo {
  /** 农历日期文案，如 "正月初一"，"闰四月廿三" */
  label: string;
  /** 简写，如 "初一"，"十五" */
  shortLabel: string;
  /** 是否为农历节日 */
  isHoliday: boolean;
  /** 节日名称（如为节日） */
  holidayName: string;
  /** 是否为周末（周六/周日） */
  isWeekend: boolean;
  /** 是否为调休工作日（周末但需上班） */
  isWorkday: boolean;
}

/** 调休工作日（周末但要上班）：2026 年的调休安排 */
const WORKDAYS_2026 = new Set([
  // 春节：2月17日（周二，正月初十）上班
  "2026-02-17",
  // 清明：4月6日（周一）上班
  "2026-04-06",
  // 劳动节：4月30日（周四）上班
  "2026-04-30",
  // 国庆：10月8日（周四）上班
  "2026-10-08",
]);

export function getLunarInfo(date: Date): LunarInfo {
  const { lunar } = toLunar(date);
  const weekend = isWeekend(date);
  const dateKey = localDateKey(date);

  // 固定阳历节假日
  const holidayName = FIXED_HOLIDAYS[dateKey] ?? null;

  // 农历节假日
  const lunarKey = `${lunar.month}-${lunar.day}`;
  const lunarHolidayName = LUNAR_HOLIDAYS[lunarKey] ?? null;

  const finalHolidayName = holidayName ?? lunarHolidayName ?? "";

  return {
    label: formatLunar(lunar, { prefix: false }),
    shortLabel: lunar.isLeapMonth
      ? `闰${LUNAR_MONTH_NAMES[lunar.month - 1]}${LUNAR_DAY_NAMES[lunar.day - 1]}`
      : `${LUNAR_MONTH_NAMES[lunar.month - 1]}${LUNAR_DAY_NAMES[lunar.day - 1]}`,
    isHoliday: Boolean(finalHolidayName),
    holidayName: finalHolidayName,
    isWeekend: weekend,
    isWorkday: WORKDAYS_2026.has(dateKey) && weekend,
  };
}
