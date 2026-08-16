import type { Nullable } from "../nullish";
import { formatMonthDay, formatTime, toDayKey } from "./time";

/**
 * What this module reads off one appearance of an event.
 *
 * WARN: Declared structurally rather than imported from `entities/event`, which
 * `shared` may not reach (REQUIREMENTS.md § 2.) — and which publishes its types
 * through a barrel whose api segment is `server-only`. `EventOccurrence` satisfies
 * this shape, so both callers pass one unchanged.
 *
 * INFO: It lives here for the reason `date/calendar.ts` does: two slices render the
 * same event line — 캘린더 and § 16.'s mirror of it — and a page may not import a
 * sibling page, so a fork was the only alternative to moving it.
 */
export type TimedOccurrence = {
  event: { allDay: boolean };
  startsAt: string;
  endsAt: string;
};

/**
 * The time line a row carries **on the day it is being shown** — `종일`,
 * `오후 2:30`, `오후 2:30 – 오후 4:00`, or one end of a multi-day span.
 *
 * WARN: `dayKey` is required rather than defaulted to the occurrence's own start
 * day. Formatted against its two instants alone, a 8월 3일 14:00 → 8월 12일 16:00
 * event reads as `오후 2:00 – 오후 4:00` on 8월 10일 — a two-hour afternoon on a day
 * it runs straight through.
 */
export function formatOccurrenceTime(occurrence: TimedOccurrence, dayKey: string): string {
  if (occurrence.event.allDay) {
    return "종일";
  }

  const startDayKey = toDayKey(occurrence.startsAt);
  const endDayKey = toDayKey(occurrence.endsAt);

  if (startDayKey === endDayKey) {
    const startsAt = formatTime(occurrence.startsAt);
    const endsAt = formatTime(occurrence.endsAt);

    // INFO: A same-instant end is what a zero-length event looks like; repeating the time would say nothing.
    return startsAt === endsAt ? startsAt : `${startsAt} – ${endsAt}`;
  }

  if (dayKey === startDayKey) {
    return `${formatTime(occurrence.startsAt)} 시작`;
  }

  // INFO: A middle day is covered end to end, so it says what an all-day event says; only the two edge days own a time.
  return dayKey === endDayKey ? `${formatTime(occurrence.endsAt)} 종료` : "종일";
}

/**
 * `8월 3일 – 8월 12일` when the occurrence covers more than one day, `null` when it
 * does not — a single-day row sits under a heading that already names the date.
 */
export function formatMultiDaySpan(occurrence: TimedOccurrence): Nullable<string> {
  const startDayKey = toDayKey(occurrence.startsAt);
  const endDayKey = toDayKey(occurrence.endsAt);

  return startDayKey === endDayKey
    ? null
    : `${formatMonthDay(startDayKey)} – ${formatMonthDay(endDayKey)}`;
}

// INFO: A multi-day event belongs to every day it covers, so a day's list cannot filter on its start alone.
export function occursOnDay(occurrence: TimedOccurrence, dayKey: string): boolean {
  return toDayKey(occurrence.startsAt) <= dayKey && toDayKey(occurrence.endsAt) >= dayKey;
}
