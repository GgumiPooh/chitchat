import type { Nullable, Optional } from "../nullish";
import {
  A_DAY,
  parseDayKey,
  shiftDayKey,
  TIME_ZONE_OFFSET,
  TIME_ZONE_OFFSET_MS,
  toDayKey,
  toDayOfMonth,
  toWeekday,
} from "./time";

export type EventRecurrence = "none" | "daily" | "weekly" | "monthly" | "yearly" | "custom";

export type RecurrenceSpan = { startsAt: string; endsAt: string };

export type RecurringSpan = {
  allDay?: boolean;
  endsAt: string;
  exdates?: readonly string[];
  recurrence: EventRecurrence;
  recurrenceUntil?: Nullable<string>;
  rrule?: Nullable<string>;
  startsAt: string;
};

export type ParsedGoogleRecurrence = {
  exdates: string[];
  recurrence: EventRecurrence;
  recurrenceUntil: Nullable<string>;
  rrule: Nullable<string>;
};

const A_WEEK = 7 * A_DAY;
const MAX_RECURRENCE_COUNT = 5000;
const WEEKDAY_CODES = ["SU", "MO", "TU", "WE", "TH", "FR", "SA"] as const;
type WeekdayCode = (typeof WEEKDAY_CODES)[number];
const WEEKDAY_TO_INDEX: Record<WeekdayCode, number> = {
  SU: 0,
  MO: 1,
  TU: 2,
  WE: 3,
  TH: 4,
  FR: 5,
  SA: 6,
};

/**
 * REQUIREMENTS.md § 6. Every projection of a row onto the periods a day-key range
 * touches — widened by a period on each side, so the caller filters by overlap.
 */
export function projectRecurrence(
  row: RecurringSpan,
  fromKey: string,
  toKey: string,
): RecurrenceSpan[] {
  if (row.recurrenceUntil && row.recurrenceUntil < fromKey) {
    return [];
  }

  const effectiveEndKey =
    row.recurrenceUntil && row.recurrenceUntil < toKey ? row.recurrenceUntil : toKey;

  let candidates: RecurrenceSpan[];

  switch (row.recurrence) {
    case "yearly":
      candidates = projectYearly(row, fromKey, effectiveEndKey);
      break;
    case "monthly":
      candidates = projectMonthly(row, fromKey, effectiveEndKey);
      break;
    case "weekly":
      candidates = projectWeekly(row, fromKey, effectiveEndKey);
      break;
    case "daily":
      candidates = projectDaily(row, fromKey, effectiveEndKey);
      break;
    case "custom":
      candidates = projectCustomRRule(row, fromKey, effectiveEndKey);
      break;
    default:
      candidates = [{ startsAt: row.startsAt, endsAt: row.endsAt }];
      break;
  }

  if (row.recurrenceUntil) {
    const until = row.recurrenceUntil;
    candidates = candidates.filter((candidate) => toDayKey(candidate.startsAt) <= until);
  }

  if (row.exdates && row.exdates.length > 0) {
    const excludedDayKeys = new Set(row.exdates.map(normalizeExdateDayKey));
    candidates = candidates.filter(
      (candidate) => !excludedDayKeys.has(toDayKey(candidate.startsAt)),
    );
  }

  return candidates;
}

/**
 * WARN: The duration is carried across rather than the end date being rebuilt
 * from its own fields — a 12월 31일 → 1월 1일 event would otherwise project onto
 * a year where its end lands before its start.
 */
function projectYearly(row: RecurringSpan, fromKey: string, toKey: string): RecurrenceSpan[] {
  const anchorStart = new Date(row.startsAt);
  const duration = Date.parse(row.endsAt) - Date.parse(row.startsAt);
  // INFO: A year wider on each side than the range asks for, because the anchor is an instant and `TIME_ZONE` is ahead of UTC — an event just after midnight belongs to the next calendar year from the projection's point of view. `overlaps` drops whatever the widening let through.
  const fromYear = parseDayKey(fromKey).getUTCFullYear() - 1;
  const toYear = parseDayKey(toKey).getUTCFullYear() + 1;
  const occurrences: RecurrenceSpan[] = [];

  for (let year = fromYear; year <= toYear; year += 1) {
    const startsAt = new Date(anchorStart);

    startsAt.setUTCFullYear(year);

    occurrences.push(toSpan(startsAt.getTime(), duration));
  }

  return occurrences;
}

/**
 * REQUIREMENTS.md § 11.4. The anchor's day of month, clamped to the last day of a
 * shorter month, in `TIME_ZONE` wall-clock — a 31일 event lands on 2월 28일.
 *
 * WARN: Unlike `projectYearly`, this works in wall-clock and never UTC: an event at
 * 08:00 KST is the previous UTC day, so clamping the UTC day would move it a day.
 *
 * INFO: Never before the anchor, unlike `yearly` — a monthly bill starting in 12월 has no 11월.
 */
function projectMonthly(row: RecurringSpan, fromKey: string, toKey: string): RecurrenceSpan[] {
  const anchor = toWallClock(row.startsAt);
  const duration = Date.parse(row.endsAt) - Date.parse(row.startsAt);
  const anchorMonth = toMonthIndex(anchor);
  const fromMonth = Math.max(anchorMonth, toMonthIndex(parseDayKey(fromKey)) - 1);
  const toMonth = toMonthIndex(parseDayKey(toKey)) + 1;
  const occurrences: RecurrenceSpan[] = [];

  for (let month = fromMonth; month <= toMonth; month += 1) {
    const startsAt = new Date(anchor);

    startsAt.setUTCFullYear(Math.floor(month / 12), month % 12, 1);
    startsAt.setUTCDate(Math.min(anchor.getUTCDate(), daysInMonth(month)));

    occurrences.push(toSpan(fromWallClock(startsAt), duration));
  }

  return occurrences;
}

/** INFO: A fixed seven-day step is exact only because `TIME_ZONE` has no daylight saving. */
function projectWeekly(row: RecurringSpan, fromKey: string, toKey: string): RecurrenceSpan[] {
  const anchorMs = Date.parse(row.startsAt);
  const duration = Date.parse(row.endsAt) - anchorMs;
  const rangeEnd = parseDayKey(toKey).getTime() + A_DAY;
  const firstStep = Math.max(
    0,
    Math.floor((parseDayKey(fromKey).getTime() - A_DAY - duration - anchorMs) / A_WEEK),
  );
  const occurrences: RecurrenceSpan[] = [];

  for (let startsAt = anchorMs + firstStep * A_WEEK; startsAt <= rangeEnd; startsAt += A_WEEK) {
    occurrences.push(toSpan(startsAt, duration));
  }

  return occurrences;
}

/** INFO: A daily step never projects before the anchor and preserves exact KST wall-clock time. */
function projectDaily(row: RecurringSpan, fromKey: string, toKey: string): RecurrenceSpan[] {
  const anchorMs = Date.parse(row.startsAt);
  const duration = Date.parse(row.endsAt) - anchorMs;
  const anchorDayKey = toDayKey(anchorMs);

  if (toKey < anchorDayKey) {
    return [];
  }

  const rangeEnd = parseDayKey(toKey).getTime() + A_DAY;
  const firstStep = Math.max(
    0,
    Math.floor(
      (parseDayKey(fromKey).getTime() - A_DAY - duration - parseDayKey(anchorDayKey).getTime()) /
        A_DAY,
    ),
  );
  const occurrences: RecurrenceSpan[] = [];

  for (let startsAt = anchorMs + firstStep * A_DAY; startsAt <= rangeEnd; startsAt += A_DAY) {
    if (toDayKey(startsAt) > toKey) {
      break;
    }
    occurrences.push(toSpan(startsAt, duration));
  }

  return occurrences;
}

type ParsedRRule = {
  byDay?: Array<{ ord?: number; weekday: WeekdayCode }>;
  byMonth?: number[];
  byMonthDay?: number[];
  count?: number;
  freq: "DAILY" | "MONTHLY" | "WEEKLY" | "YEARLY";
  interval: number;
  untilDayKey?: string;
  untilMs?: number;
  wkst: WeekdayCode;
};

function parseRRule(rruleStr: string): Nullable<ParsedRRule> {
  const normalized = rruleStr.replace(/^RRULE:/i, "").trim();
  if (!normalized) {
    return null;
  }

  const parts = normalized.split(";");
  const params = new Map<string, string>();
  for (const part of parts) {
    const eqIdx = part.indexOf("=");
    if (eqIdx !== -1) {
      params.set(part.slice(0, eqIdx).toUpperCase(), part.slice(eqIdx + 1));
    }
  }

  const freq = params.get("FREQ");
  if (freq !== "DAILY" && freq !== "WEEKLY" && freq !== "MONTHLY" && freq !== "YEARLY") {
    return null;
  }

  const rawInterval = Number.parseInt(params.get("INTERVAL") ?? "1", 10);
  const interval = Number.isFinite(rawInterval) && rawInterval >= 1 ? rawInterval : 1;

  let count: Optional<number>;
  const rawCount = params.get("COUNT");
  if (rawCount) {
    const parsed = Number.parseInt(rawCount, 10);
    if (Number.isFinite(parsed) && parsed >= 1) {
      count = parsed;
    }
  }

  let untilMs: Optional<number>;
  let untilDayKey: Optional<string>;
  const rawUntil = params.get("UNTIL");
  if (rawUntil) {
    if (/^\d{8}$/.test(rawUntil)) {
      untilDayKey = `${rawUntil.slice(0, 4)}-${rawUntil.slice(4, 6)}-${rawUntil.slice(6, 8)}`;
      untilMs = Date.parse(`${untilDayKey}T23:59:59.999+09:00`);
    } else {
      const match = /^(\d{4})(\d{2})(\d{2})T(\d{2})(\d{2})(\d{2})(Z)?$/.exec(rawUntil);
      if (match) {
        const [, y, m, d, hh, mm, ss, z] = match;
        const iso = `${y}-${m}-${d}T${hh}:${mm}:${ss}${z ? "Z" : TIME_ZONE_OFFSET}`;
        untilMs = Date.parse(iso);
        untilDayKey = toDayKey(untilMs);
      } else {
        const parsed = Date.parse(rawUntil);
        if (!Number.isNaN(parsed)) {
          untilMs = parsed;
          untilDayKey = toDayKey(parsed);
        }
      }
    }
  }

  let byDay: Optional<Array<{ ord?: number; weekday: WeekdayCode }>>;
  const rawByDay = params.get("BYDAY");
  if (rawByDay) {
    byDay = [];
    for (const token of rawByDay.split(",")) {
      const match = /^([+-]?\d+)?(SU|MO|TU|WE|TH|FR|SA)$/i.exec(token.trim().toUpperCase());
      if (match) {
        const ord = match[1] ? Number.parseInt(match[1], 10) : undefined;
        byDay.push({ ord, weekday: match[2] as WeekdayCode });
      }
    }
  }

  let byMonthDay: Optional<number[]>;
  const rawByMonthDay = params.get("BYMONTHDAY");
  if (rawByMonthDay) {
    byMonthDay = rawByMonthDay
      .split(",")
      .map((d) => Number.parseInt(d.trim(), 10))
      .filter((n) => Number.isFinite(n) && n !== 0 && n >= -31 && n <= 31);
  }

  let byMonth: Optional<number[]>;
  const rawByMonth = params.get("BYMONTH");
  if (rawByMonth) {
    byMonth = rawByMonth
      .split(",")
      .map((m) => Number.parseInt(m.trim(), 10))
      .filter((n) => Number.isFinite(n) && n >= 1 && n <= 12);
  }

  const rawWkst = params.get("WKST")?.toUpperCase();
  const wkst: WeekdayCode =
    rawWkst === "SU" ||
    rawWkst === "MO" ||
    rawWkst === "TU" ||
    rawWkst === "WE" ||
    rawWkst === "TH" ||
    rawWkst === "FR" ||
    rawWkst === "SA"
      ? rawWkst
      : "MO";

  return {
    byDay,
    byMonth,
    byMonthDay,
    count,
    freq,
    interval,
    untilDayKey,
    untilMs,
    wkst,
  };
}

// INFO: RFC 5545 occurrence generator respecting anchor instant, COUNT, UNTIL and KST wall clock.
function projectCustomRRule(row: RecurringSpan, fromKey: string, toKey: string): RecurrenceSpan[] {
  if (!row.rrule) {
    return [{ startsAt: row.startsAt, endsAt: row.endsAt }];
  }

  const parsed = parseRRule(row.rrule);
  if (!parsed) {
    return [{ startsAt: row.startsAt, endsAt: row.endsAt }];
  }

  const anchorMs = Date.parse(row.startsAt);
  const duration = Date.parse(row.endsAt) - anchorMs;
  const anchorDayKey = toDayKey(anchorMs);

  if (toKey < anchorDayKey) {
    return [];
  }

  const timeOfDayMs = anchorMs - parseDayKey(anchorDayKey).getTime();
  const maxCount = Math.min(parsed.count ?? MAX_RECURRENCE_COUNT, MAX_RECURRENCE_COUNT);
  const effectiveUntilMs = parsed.untilMs;

  const generatedInstants: number[] = [];

  switch (parsed.freq) {
    case "DAILY": {
      for (
        let step = 0;
        generatedInstants.length < maxCount && step < MAX_RECURRENCE_COUNT;
        step += parsed.interval
      ) {
        const instantMs = anchorMs + step * A_DAY;
        if (effectiveUntilMs !== undefined && instantMs > effectiveUntilMs) {
          break;
        }

        const wall = toWallClock(new Date(instantMs).toISOString());
        if (parsed.byMonth && !parsed.byMonth.includes(wall.getUTCMonth() + 1)) {
          continue;
        }
        if (parsed.byDay) {
          const code = WEEKDAY_CODES[wall.getUTCDay()];
          if (!parsed.byDay.some((item) => item.weekday === code)) {
            continue;
          }
        }

        generatedInstants.push(instantMs);
        if (toDayKey(instantMs) > toKey) {
          break;
        }
      }
      break;
    }
    case "WEEKLY": {
      const anchorWeekdayIndex = toWeekday(anchorDayKey);
      const wkstIndex = WEEKDAY_TO_INDEX[parsed.wkst];
      const startOffset = (anchorWeekdayIndex - wkstIndex + 7) % 7;
      const weekStartKey = shiftDayKey(anchorDayKey, -startOffset);

      const targetWeekdays: WeekdayCode[] =
        parsed.byDay && parsed.byDay.length > 0
          ? parsed.byDay.map((d) => d.weekday)
          : [WEEKDAY_CODES[anchorWeekdayIndex]];

      let weekStep = 0;
      while (generatedInstants.length < maxCount && weekStep < MAX_RECURRENCE_COUNT) {
        const currentWeekStart = shiftDayKey(weekStartKey, weekStep * 7);
        const daysInWeek: number[] = [];

        for (const weekday of targetWeekdays) {
          const targetIndex = WEEKDAY_TO_INDEX[weekday];
          const dayOffset = (targetIndex - wkstIndex + 7) % 7;
          const dayKey = shiftDayKey(currentWeekStart, dayOffset);
          const instantMs = parseDayKey(dayKey).getTime() + timeOfDayMs;

          if (instantMs >= anchorMs) {
            daysInWeek.push(instantMs);
          }
        }

        daysInWeek.sort((a, b) => a - b);

        if (
          effectiveUntilMs !== undefined &&
          daysInWeek.length > 0 &&
          daysInWeek[0] > effectiveUntilMs
        ) {
          break;
        }

        let allPastRange = daysInWeek.length > 0;
        for (const instantMs of daysInWeek) {
          if (effectiveUntilMs !== undefined && instantMs > effectiveUntilMs) {
            allPastRange = true;
            break;
          }
          if (parsed.byMonth) {
            const wall = toWallClock(new Date(instantMs).toISOString());
            if (!parsed.byMonth.includes(wall.getUTCMonth() + 1)) {
              continue;
            }
          }

          generatedInstants.push(instantMs);
          if (toDayKey(instantMs) <= toKey) {
            allPastRange = false;
          }
          if (generatedInstants.length >= maxCount) {
            break;
          }
        }

        if (allPastRange && daysInWeek.length > 0 && toDayKey(daysInWeek[0]) > toKey) {
          break;
        }

        weekStep += parsed.interval;
      }
      break;
    }
    case "MONTHLY": {
      const anchorWall = toWallClock(row.startsAt);
      const anchorMonthIndex = toMonthIndex(anchorWall);
      const anchorDay = anchorWall.getUTCDate();

      let monthStep = 0;
      while (generatedInstants.length < maxCount && monthStep < MAX_RECURRENCE_COUNT) {
        const m = anchorMonthIndex + monthStep;
        const year = Math.floor(m / 12);
        const month = m % 12;

        if (
          effectiveUntilMs !== undefined &&
          `${year}-${String(month + 1).padStart(2, "0")}-01` > toDayKey(effectiveUntilMs)
        ) {
          break;
        }

        const totalDays = daysInMonth(m);

        if (!parsed.byMonth || parsed.byMonth.includes(month + 1)) {
          const daysToGenerate: number[] = [];

          if (parsed.byDay && parsed.byDay.length > 0) {
            for (const { ord, weekday } of parsed.byDay) {
              const targetWeekdayIdx = WEEKDAY_TO_INDEX[weekday];
              const matchingDays: number[] = [];
              for (let d = 1; d <= totalDays; d += 1) {
                if (new Date(Date.UTC(year, month, d)).getUTCDay() === targetWeekdayIdx) {
                  matchingDays.push(d);
                }
              }
              if (ord === undefined) {
                daysToGenerate.push(...matchingDays);
              } else if (ord > 0 && ord <= matchingDays.length) {
                daysToGenerate.push(matchingDays[ord - 1]);
              } else if (ord < 0 && matchingDays.length + ord >= 0) {
                daysToGenerate.push(matchingDays[matchingDays.length + ord]);
              }
            }
          } else if (parsed.byMonthDay && parsed.byMonthDay.length > 0) {
            for (const d of parsed.byMonthDay) {
              if (d > 0 && d <= totalDays) {
                daysToGenerate.push(d);
              } else if (d < 0 && totalDays + 1 + d >= 1) {
                daysToGenerate.push(totalDays + 1 + d);
              }
            }
          } else if (anchorDay <= totalDays) {
            daysToGenerate.push(anchorDay);
          }

          const uniqueDays = Array.from(new Set(daysToGenerate)).sort((a, b) => a - b);
          let allPastRange = uniqueDays.length > 0;

          for (const d of uniqueDays) {
            const dayKey = `${year}-${String(month + 1).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
            const instantMs = parseDayKey(dayKey).getTime() + timeOfDayMs;

            if (instantMs < anchorMs) {
              continue;
            }
            if (effectiveUntilMs !== undefined && instantMs > effectiveUntilMs) {
              allPastRange = true;
              break;
            }

            generatedInstants.push(instantMs);
            if (dayKey <= toKey) {
              allPastRange = false;
            }
            if (generatedInstants.length >= maxCount) {
              break;
            }
          }

          if (allPastRange && uniqueDays.length > 0) {
            const firstKey = `${year}-${String(month + 1).padStart(2, "0")}-${String(uniqueDays[0]).padStart(2, "0")}`;
            if (firstKey > toKey) {
              break;
            }
          }
        }

        monthStep += parsed.interval;
      }
      break;
    }
    case "YEARLY": {
      const anchorWall = toWallClock(row.startsAt);
      const anchorYear = anchorWall.getUTCFullYear();
      const anchorMonth = anchorWall.getUTCMonth();
      const anchorDay = anchorWall.getUTCDate();

      let yearStep = 0;
      while (generatedInstants.length < maxCount && yearStep < 500) {
        const year = anchorYear + yearStep;

        if (effectiveUntilMs !== undefined && `${year}-01-01` > toDayKey(effectiveUntilMs)) {
          break;
        }

        const targetMonths = parsed.byMonth ? parsed.byMonth.map((m) => m - 1) : [anchorMonth];

        let allPastRange = true;

        for (const month of targetMonths) {
          const m = year * 12 + month;
          const totalDays = daysInMonth(m);
          const daysToGenerate: number[] = [];

          if (parsed.byDay && parsed.byDay.length > 0) {
            for (const { ord, weekday } of parsed.byDay) {
              const targetWeekdayIdx = WEEKDAY_TO_INDEX[weekday];
              const matchingDays: number[] = [];
              for (let d = 1; d <= totalDays; d += 1) {
                if (new Date(Date.UTC(year, month, d)).getUTCDay() === targetWeekdayIdx) {
                  matchingDays.push(d);
                }
              }
              if (ord === undefined) {
                daysToGenerate.push(...matchingDays);
              } else if (ord > 0 && ord <= matchingDays.length) {
                daysToGenerate.push(matchingDays[ord - 1]);
              } else if (ord < 0 && matchingDays.length + ord >= 0) {
                daysToGenerate.push(matchingDays[matchingDays.length + ord]);
              }
            }
          } else if (parsed.byMonthDay && parsed.byMonthDay.length > 0) {
            for (const d of parsed.byMonthDay) {
              if (d > 0 && d <= totalDays) {
                daysToGenerate.push(d);
              } else if (d < 0 && totalDays + 1 + d >= 1) {
                daysToGenerate.push(totalDays + 1 + d);
              }
            }
          } else if (anchorDay <= totalDays) {
            daysToGenerate.push(anchorDay);
          }

          const uniqueDays = Array.from(new Set(daysToGenerate)).sort((a, b) => a - b);

          for (const d of uniqueDays) {
            const dayKey = `${year}-${String(month + 1).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
            const instantMs = parseDayKey(dayKey).getTime() + timeOfDayMs;

            if (instantMs < anchorMs) {
              continue;
            }
            if (effectiveUntilMs !== undefined && instantMs > effectiveUntilMs) {
              break;
            }

            generatedInstants.push(instantMs);
            if (dayKey <= toKey) {
              allPastRange = false;
            }
            if (generatedInstants.length >= maxCount) {
              break;
            }
          }
        }

        if (
          allPastRange &&
          generatedInstants.length > 0 &&
          toDayKey(generatedInstants[generatedInstants.length - 1]) > toKey
        ) {
          break;
        }

        yearStep += parsed.interval;
      }
      break;
    }
  }

  // INFO: DTSTART is occurrence #1 per RFC 5545 when COUNT is counting or anchor is omitted by expanded rules.
  if (generatedInstants.length === 0) {
    return [{ startsAt: row.startsAt, endsAt: row.endsAt }];
  }

  if (generatedInstants[0] > anchorMs) {
    generatedInstants.unshift(anchorMs);
  }

  const occurrences = (
    parsed.count !== undefined ? generatedInstants.slice(0, parsed.count) : generatedInstants
  )
    .map((instant) => toSpan(instant, duration))
    .filter((candidate) => toDayKey(candidate.endsAt) >= shiftDayKey(fromKey, -1));

  return occurrences;
}

export function fromGoogleRecurrence(
  lines: Optional<readonly string[]>,
  anchorStartsAt: string,
  allDay: boolean,
): ParsedGoogleRecurrence {
  void allDay;
  if (!lines || lines.length === 0) {
    return { exdates: [], recurrence: "none", recurrenceUntil: null, rrule: null };
  }

  const exdates: string[] = [];
  let rruleLine: Optional<string>;

  for (const line of lines) {
    const trimmed = line.trim();
    if (/^RRULE:/i.test(trimmed)) {
      rruleLine = trimmed;
    } else if (/^EXDATE/i.test(trimmed)) {
      const colonIdx = trimmed.indexOf(":");
      if (colonIdx !== -1) {
        const values = trimmed.slice(colonIdx + 1).split(",");
        for (const value of values) {
          const norm = normalizeExdateDayKey(value);
          if (norm) {
            exdates.push(norm);
          }
        }
      }
    }
  }

  const sortedExdates = Array.from(new Set(exdates)).sort();

  if (!rruleLine) {
    return { exdates: sortedExdates, recurrence: "none", recurrenceUntil: null, rrule: null };
  }

  const parsed = parseRRule(rruleLine);
  if (!parsed) {
    return {
      exdates: sortedExdates,
      recurrence: "custom",
      recurrenceUntil: null,
      rrule: rruleLine.startsWith("RRULE:") ? rruleLine : `RRULE:${rruleLine}`,
    };
  }

  const recurrenceUntil = parsed.untilDayKey ?? null;

  // INFO: Map standard single-cadence rules back to J&H native types so UI chips stay clean.
  if (parsed.count === undefined && parsed.interval === 1) {
    if (parsed.freq === "DAILY" && !parsed.byDay && !parsed.byMonth && !parsed.byMonthDay) {
      return { exdates: sortedExdates, recurrence: "daily", recurrenceUntil, rrule: null };
    }

    if (parsed.freq === "WEEKLY" && !parsed.byMonth && !parsed.byMonthDay) {
      const anchorWeekday = WEEKDAY_CODES[toWeekday(toDayKey(anchorStartsAt))];
      const matchesSingleWeekday =
        !parsed.byDay ||
        (parsed.byDay.length === 1 &&
          parsed.byDay[0].ord === undefined &&
          parsed.byDay[0].weekday === anchorWeekday);

      if (matchesSingleWeekday) {
        return { exdates: sortedExdates, recurrence: "weekly", recurrenceUntil, rrule: null };
      }
    }

    if (parsed.freq === "MONTHLY" && !parsed.byDay && !parsed.byMonth) {
      const anchorDay = toDayOfMonth(toDayKey(anchorStartsAt));
      const matchesDay =
        anchorDay <= 28 &&
        (!parsed.byMonthDay ||
          (parsed.byMonthDay.length === 1 && parsed.byMonthDay[0] === anchorDay));

      if (matchesDay) {
        return { exdates: sortedExdates, recurrence: "monthly", recurrenceUntil, rrule: null };
      }
    }

    if (parsed.freq === "YEARLY" && !parsed.byDay) {
      const anchorWall = toWallClock(anchorStartsAt);
      const anchorMonth = anchorWall.getUTCMonth() + 1;
      const anchorDay = anchorWall.getUTCDate();
      const matchesMonth =
        !parsed.byMonth || (parsed.byMonth.length === 1 && parsed.byMonth[0] === anchorMonth);
      const matchesDay =
        !parsed.byMonthDay ||
        (parsed.byMonthDay.length === 1 && parsed.byMonthDay[0] === anchorDay);

      if (matchesMonth && matchesDay) {
        return { exdates: sortedExdates, recurrence: "yearly", recurrenceUntil, rrule: null };
      }
    }
  }

  return {
    exdates: sortedExdates,
    recurrence: "custom",
    recurrenceUntil,
    rrule: rruleLine.startsWith("RRULE:") ? rruleLine : `RRULE:${rruleLine}`,
  };
}

export function toGoogleRecurrence(params: {
  allDay: boolean;
  anchorStartsAt?: string;
  exdates?: readonly string[];
  recurrence: EventRecurrence;
  recurrenceUntil?: Nullable<string>;
  rrule?: Nullable<string>;
}): Optional<string[]> {
  if (params.recurrence === "none") {
    return undefined;
  }

  let rruleLine: string;

  if (params.recurrence === "custom") {
    if (!params.rrule) {
      return undefined;
    }
    rruleLine = params.rrule.startsWith("RRULE:") ? params.rrule : `RRULE:${params.rrule}`;
  } else {
    let freq: string;
    switch (params.recurrence) {
      case "daily":
        freq = "FREQ=DAILY";
        break;
      case "weekly":
        freq = "FREQ=WEEKLY";
        break;
      case "monthly":
        freq = "FREQ=MONTHLY";
        break;
      case "yearly":
        freq = "FREQ=YEARLY";
        break;
    }

    rruleLine = `RRULE:${freq}`;

    if (params.recurrenceUntil) {
      if (params.allDay) {
        rruleLine += `;UNTIL=${params.recurrenceUntil.replace(/-/g, "")}`;
      } else {
        const untilMs = Date.parse(`${params.recurrenceUntil}T23:59:59+09:00`);
        const d = new Date(untilMs);
        const y = d.getUTCFullYear();
        const m = String(d.getUTCMonth() + 1).padStart(2, "0");
        const day = String(d.getUTCDate()).padStart(2, "0");
        const hh = String(d.getUTCHours()).padStart(2, "0");
        const mm = String(d.getUTCMinutes()).padStart(2, "0");
        const ss = String(d.getUTCSeconds()).padStart(2, "0");
        rruleLine += `;UNTIL=${y}${m}${day}T${hh}${mm}${ss}Z`;
      }
    }
  }

  const lines: string[] = [rruleLine];

  if (params.exdates && params.exdates.length > 0) {
    let timeSuffix = "";
    if (!params.allDay && params.anchorStartsAt) {
      const wall = toWallClock(params.anchorStartsAt);
      const hh = String(wall.getUTCHours()).padStart(2, "0");
      const mm = String(wall.getUTCMinutes()).padStart(2, "0");
      const ss = String(wall.getUTCSeconds()).padStart(2, "0");
      timeSuffix = `T${hh}${mm}${ss}`;
    }

    for (const exdate of params.exdates) {
      const norm = normalizeExdateDayKey(exdate);
      if (!norm) {
        continue;
      }
      const rawDate = norm.replace(/-/g, "");
      if (params.allDay || !timeSuffix) {
        lines.push(`EXDATE;VALUE=DATE:${rawDate}`);
      } else {
        lines.push(`EXDATE;TZID=Asia/Seoul:${rawDate}${timeSuffix}`);
      }
    }
  }

  return lines;
}

function normalizeExdateDayKey(raw: string): string {
  const trimmed = raw.trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) {
    return trimmed;
  }
  if (/^\d{8}$/.test(trimmed)) {
    return `${trimmed.slice(0, 4)}-${trimmed.slice(4, 6)}-${trimmed.slice(6, 8)}`;
  }
  const match = /^(\d{4})(\d{2})(\d{2})T(\d{2})(\d{2})(\d{2})(Z)?$/i.exec(trimmed);
  if (match) {
    const [, y, m, d, hh, mm, ss, z] = match;
    const iso = `${y}-${m}-${d}T${hh}:${mm}:${ss}${z ? "Z" : TIME_ZONE_OFFSET}`;
    return toDayKey(iso);
  }
  return toDayKey(trimmed);
}

function toSpan(startsAt: number, duration: number): RecurrenceSpan {
  return {
    endsAt: new Date(startsAt + duration).toISOString(),
    startsAt: new Date(startsAt).toISOString(),
  };
}

function toWallClock(iso: string): Date {
  return new Date(Date.parse(iso) + TIME_ZONE_OFFSET_MS);
}

function fromWallClock(wallClock: Date): number {
  return wallClock.getTime() - TIME_ZONE_OFFSET_MS;
}

function toMonthIndex(date: Date): number {
  return date.getUTCFullYear() * 12 + date.getUTCMonth();
}

function daysInMonth(monthIndex: number): number {
  return new Date(Date.UTC(Math.floor(monthIndex / 12), (monthIndex % 12) + 1, 0)).getUTCDate();
}
