import { rrulestr } from "rrule";
import type { RRuleConfig } from "@tasktick/shared";

export function isRecurring(repeatRule: string | null, repeatDaily: boolean): boolean {
  if (repeatRule) return true;
  return repeatDaily; // backward compat
}

/** Parse an RRULE string into a human-readable config using simple string extraction */
export function parseRRule(rruleString: string | null): RRuleConfig | null {
  if (!rruleString) return null;
  try {
    const cfg: RRuleConfig = {
      freq: "DAILY",
      interval: 1,
      endType: "NEVER",
    };

    // Extract FREQ
    const freqMatch = rruleString.match(/FREQ=(\w+)/);
    if (freqMatch) {
      const f = freqMatch[1]!.toUpperCase();
      if (f === "DAILY" || f === "WEEKLY" || f === "MONTHLY" || f === "YEARLY") {
        cfg.freq = f as RRuleConfig["freq"];
      }
    }

    // Extract INTERVAL
    const intervalMatch = rruleString.match(/INTERVAL=(\d+)/);
    if (intervalMatch) {
      cfg.interval = Number.parseInt(intervalMatch[1]!, 10);
    }

    // Extract COUNT
    const countMatch = rruleString.match(/COUNT=(\d+)/);
    if (countMatch) {
      cfg.endType = "COUNT";
      cfg.count = Number.parseInt(countMatch[1]!, 10);
    }

    // Extract UNTIL
    const untilMatch = rruleString.match(/UNTIL=(\d{8}T?\d{6}Z?)/);
    if (untilMatch) {
      cfg.endType = "UNTIL";
      // Parse RRULE date format: YYYYMMDDTHHMMSSZ
      const s = untilMatch[1]!;
      const year = Number.parseInt(s.slice(0, 4), 10);
      const month = Number.parseInt(s.slice(4, 6), 10) - 1;
      const day = Number.parseInt(s.slice(6, 8), 10);
      let hour = 0, minute = 0, second = 0;
      if (s.length >= 15 && s[8] === "T") {
        hour = Number.parseInt(s.slice(9, 11), 10);
        minute = Number.parseInt(s.slice(11, 13), 10);
        second = Number.parseInt(s.slice(13, 15), 10);
      }
      cfg.until = new Date(year, month, day, hour, minute, second).getTime();
    }

    // Extract BYDAY
    if (cfg.freq === "WEEKLY") {
      const bydayMatch = rruleString.match(/BYDAY=([A-Z,]+)/);
      if (bydayMatch) {
        const dayMap: Record<string, number> = { MO: 0, TU: 1, WE: 2, TH: 3, FR: 4, SA: 5, SU: 6 };
        cfg.byweekday = bydayMatch[1]!.split(",").map((d) => dayMap[d] ?? 0);
      }
    }

    return cfg;
  } catch {
    return null;
  }
}

/** Build an RRULE string from a config */
export function buildRRuleString(config: RRuleConfig): string {
  const parts: string[] = [`FREQ=${config.freq}`];
  if (config.interval > 1) {
    parts.push(`INTERVAL=${config.interval}`);
  }
  if (config.endType === "COUNT" && config.count && config.count > 0) {
    parts.push(`COUNT=${config.count}`);
  } else if (config.endType === "UNTIL" && config.until) {
    const d = new Date(config.until);
    // Format as RRULE UNTIL: YYYYMMDDTHHMMSSZ (UTC)
    const y = d.getUTCFullYear();
    const m = String(d.getUTCMonth() + 1).padStart(2, "0");
    const day = String(d.getUTCDate()).padStart(2, "0");
    const hh = String(d.getUTCHours()).padStart(2, "0");
    const mm = String(d.getUTCMinutes()).padStart(2, "0");
    const ss = String(d.getUTCSeconds()).padStart(2, "0");
    parts.push(`UNTIL=${y}${m}${day}T${hh}${mm}${ss}Z`);
  }
  if (config.freq === "WEEKLY" && config.byweekday && config.byweekday.length > 0) {
    const dayCodes = ["MO", "TU", "WE", "TH", "FR", "SA", "SU"];
    const days = config.byweekday.map((d) => dayCodes[d]).join(",");
    parts.push(`BYDAY=${days}`);
  }
  return parts.join(";");
}

/** Get day-of-month numbers that have occurrences in a given month.
 * @param repeatRule - the RRULE string or null
 * @param repeatDaily - legacy boolean for backward compat
 * @param year - target year
 * @param month - target month (0-indexed)
 * @returns sorted array of day-of-month numbers (1-indexed)
 */
export function getOccurrencesInMonth(
  repeatRule: string | null,
  repeatDaily: boolean,
  year: number,
  month: number,
): number[] {
  if (!isRecurring(repeatRule, repeatDaily)) return [];

  const ruleStr = repeatRule ?? (repeatDaily ? "FREQ=DAILY" : null);
  if (!ruleStr) return [];

  const dtstart = new Date(year, month, 1);
  const lastDay = new Date(year, month + 1, 0).getDate();
  const before = new Date(year, month, lastDay, 23, 59, 59);

  try {
    const rule = rrulestr(ruleStr, { dtstart });
    const occs = rule.between(dtstart, before, true);
    const days = new Set<number>();
    for (const d of occs) {
      days.add(d.getDate());
    }
    return Array.from(days).sort((a, b) => a - b);
  } catch {
    // Fallback for legacy: if repeatDaily is true and no rule string, return all days
    if (repeatDaily && !repeatRule) {
      return Array.from({ length: lastDay }, (_, i) => i + 1);
    }
    return [];
  }
}
