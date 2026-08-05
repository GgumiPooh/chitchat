export const A_SECOND = 1_000;
export const A_MINUTE = 60 * A_SECOND;
export const AN_HOUR = 60 * A_MINUTE;
export const A_DAY = 24 * AN_HOUR;

// INFO: REQUIREMENTS.md § 11.3. Pinned on both server and client so a skewed device cannot shift the day.
export const TIME_ZONE = "Asia/Seoul";
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
