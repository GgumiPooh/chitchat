import type { Nullable } from "../nullish";

export const A_SECOND = 1_000;
// INFO: One 60Hz display frame — what `requestAnimationFrame` paces at on every mobile browser this app targets, ProMotion included.
export const A_FRAME = A_SECOND / 60;
export const A_MINUTE = 60 * A_SECOND;
export const AN_HOUR = 60 * A_MINUTE;
export const A_DAY = 24 * AN_HOUR;

// INFO: REQUIREMENTS.md § 11.3. Pinned on both server and client so a skewed device cannot shift the day.
export const TIME_ZONE = "Asia/Seoul";

/**
 * The fixed UTC offset of `TIME_ZONE`, for turning a form's wall-clock fields into
 * an instant.
 *
 * WARN: A literal offset is only sound because Korea observes no daylight saving.
 * Never reuse this shape for another zone — there the offset depends on the date
 * being converted, and a constant would be wrong for half the year.
 */
export const TIME_ZONE_OFFSET = "+09:00";
export const LOCALE = "ko-KR";

const dayKeyFormatter = new Intl.DateTimeFormat("en-CA", {
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
  timeZone: TIME_ZONE,
});

const dateFormatter = new Intl.DateTimeFormat(LOCALE, {
  dateStyle: "long",
  timeZone: TIME_ZONE,
});

const dateWithWeekdayFormatter = new Intl.DateTimeFormat(LOCALE, {
  dateStyle: "full",
  timeZone: TIME_ZONE,
});

const monthDayFormatter = new Intl.DateTimeFormat(LOCALE, {
  month: "long",
  day: "numeric",
  timeZone: TIME_ZONE,
});

const yearMonthFormatter = new Intl.DateTimeFormat(LOCALE, {
  year: "numeric",
  month: "long",
  timeZone: TIME_ZONE,
});

// INFO: `en-GB` for the 24-hour `HH:MM` an `<input type="time">` requires — never the Korean `오후 2:30` of `timeFormatter`.
const timeFieldFormatter = new Intl.DateTimeFormat("en-GB", {
  hour: "2-digit",
  minute: "2-digit",
  hour12: false,
  timeZone: TIME_ZONE,
});

const timeFormatter = new Intl.DateTimeFormat(LOCALE, {
  hour: "numeric",
  minute: "2-digit",
  hour12: true,
  timeZone: TIME_ZONE,
});

/** `2026년 8월 3일` */
export function formatDate(date: Date | number | string): string {
  return dateFormatter.format(new Date(date));
}

/** `2026년 8월 3일 월요일` — the chat date divider (DESIGN.md § 6.4.). */
export function formatDateWithWeekday(date: Date | number | string): string {
  return dateWithWeekdayFormatter.format(new Date(date));
}

/** `8월 3일` */
export function formatMonthDay(date: Date | number | string): string {
  return monthDayFormatter.format(new Date(date));
}

/** `2026년 8월` — the calendar month label. */
export function formatYearMonth(date: Date | number | string): string {
  return yearMonthFormatter.format(new Date(date));
}

/** `오후 3:24` — the timestamp beside a bubble (DESIGN.md § 6.3.). */
export function formatTime(date: Date | number | string): string {
  return timeFormatter.format(new Date(date));
}

/**
 * `2026-08-03` — the calendar day an instant falls on in `TIME_ZONE`. Message
 * grouping, date dividers, and the D-day count all key off this rather than off
 * the raw timestamp, so a message sent at 00:30 KST groups under the right day.
 */
export function toDayKey(date: Date | number | string): string {
  return dayKeyFormatter.format(new Date(date));
}

/** `0:07`, `1:42`, `12:05` — the running time on a video tile. */
export function formatDuration(durationMs: number): string {
  // WARN: Minutes are derived from the rounded seconds, not from the raw milliseconds — rounding them independently renders a 59.6s clip as `0:00`.
  const totalSeconds = Math.max(Math.round(durationMs / A_SECOND), 0);
  const secondsPerMinute = A_MINUTE / A_SECOND;
  const minutes = Math.floor(totalSeconds / secondsPerMinute);
  const seconds = totalSeconds % secondsPerMinute;

  return `${minutes}:${seconds.toString().padStart(2, "0")}`;
}

/**
 * Whole days from `from` to `to`, counted in `TIME_ZONE` calendar days. Same day
 * is `0`, so a D-day following the Korean convention that the start date is day 1
 * is `countDays(start, today) + 1`.
 */
export function countDays(from: Date | number | string, to: Date | number | string): number {
  const fromUtc = Date.parse(`${toDayKey(from)}T00:00:00Z`);
  const toUtc = Date.parse(`${toDayKey(to)}T00:00:00Z`);

  return Math.round((toUtc - fromUtc) / A_DAY);
}

/**
 * A day key as a UTC-midnight instant, which is what every calculation below
 * counts in.
 *
 * WARN: Not the instant the day begins in `TIME_ZONE` — it is a calendar date
 * carried in a `Date`, so it may only be read back through `toDayKey` and the
 * UTC getters. `getDay()` and friends would answer in the machine's zone.
 */
export function parseDayKey(dayKey: string): Date {
  return new Date(`${dayKey}T00:00:00Z`);
}

/** The day key `days` after `dayKey`; negative counts back. */
export function shiftDayKey(dayKey: string, days: number): string {
  return toDayKey(parseDayKey(dayKey).getTime() + days * A_DAY);
}

/** `2026-08` — the month a day key falls in. */
export function toMonthKey(dayKey: string): string {
  return dayKey.slice(0, 7);
}

/** The first day key of the month `monthKey` names. */
export function toMonthStart(monthKey: string): string {
  return `${monthKey}-01`;
}

/** The month key `months` after `monthKey`; negative counts back. */
export function shiftMonthKey(monthKey: string, months: number): string {
  const [year, month] = monthKey.split("-").map(Number);
  const shifted = new Date(Date.UTC(year, month - 1 + months, 1));

  return toMonthKey(toDayKey(shifted));
}

/**
 * The weekday of a day key as `0` (Sunday) – `6`, in `TIME_ZONE`.
 *
 * INFO: Read off the UTC instant of `parseDayKey`, so it describes the calendar
 * date rather than whatever moment the machine's zone maps it to.
 */
export function toWeekday(dayKey: string): number {
  return parseDayKey(dayKey).getUTCDay();
}

// WARN: `toWeekday`'s own index domain, and they live here so they cannot drift from it — the two are one fact, and a Monday-first day would have to move both together.
export const SUNDAY = 0;

export const SATURDAY = 6;

/** The day-of-month of a day key, for the numeral in a calendar cell. */
export function toDayOfMonth(dayKey: string): number {
  return parseDayKey(dayKey).getUTCDate();
}

/**
 * A form's `YYYY-MM-DD` and `HH:MM` fields as the instant they name in `TIME_ZONE`,
 * or `null` when they do not name one.
 *
 * WARN: Nullable rather than throwing, because native `date` and `time` inputs are
 * **clearable** — an emptied field reaches this as `""`, and `toISOString` on the
 * resulting Invalid Date throws a `RangeError`. Callers run inside render, where
 * that is a blank screen rather than a disabled button.
 */
export function toInstant(dayKey: string, time: string): Nullable<string> {
  const instant = new Date(`${dayKey}T${time}:00${TIME_ZONE_OFFSET}`);

  return Number.isNaN(instant.getTime()) ? null : instant.toISOString();
}

/** `14:30` — an instant as the `HH:MM` a time input takes, in `TIME_ZONE`. */
export function toTimeField(date: Date | number | string): string {
  return timeFieldFormatter.format(new Date(date));
}
