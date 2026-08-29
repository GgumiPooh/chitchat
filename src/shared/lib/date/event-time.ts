import type { EventScope } from "@/shared/db";
import type { UserId } from "../identity/id";
import type { Nullable } from "../nullish";
import { AN_HOUR, A_DAY, countDays, formatMonthDay, formatTime, toDayKey } from "./time";

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

/** `오늘`, `내일`, `3일 뒤`, then the date itself once it is further out than a week — or already behind. */
export function formatRelativeDay(dayKey: string, todayKey: string): string {
  const daysLeft = countDays(todayKey, dayKey);

  if (daysLeft === 0) {
    return "오늘";
  }

  if (daysLeft === 1) {
    return "내일";
  }

  // INFO: A day already behind `todayKey` names itself — `3일 뒤` has no mirror, and a countdown that has run out is not a relative day.
  if (daysLeft < 0 || daysLeft > 7) {
    return formatMonthDay(dayKey);
  }

  return `${daysLeft}일 뒤`;
}

/** The line an upcoming entry carries: when it happens, at a glance. */
export function formatUpcomingWhen(occurrence: TimedOccurrence, todayKey: string): string {
  const startDayKey = toDayKey(occurrence.startsAt);

  // INFO: DESIGN.md § 7.9. An event that began before today has no date to announce under a heading reading 다가오는, and its start date is a week in the past.
  if (startDayKey < todayKey) {
    return "진행 중";
  }

  const day = formatRelativeDay(startDayKey, todayKey);

  return occurrence.event.allDay ? day : `${day} ${formatTime(occurrence.startsAt)}`;
}

/** REQUIREMENTS.md § 11.5.1. Whether the occurrence starts inside the day — 채팅's header blooms on the same window. */
export function isImminent(occurrence: TimedOccurrence, now: number): boolean {
  return Date.parse(occurrence.startsAt) - now <= A_DAY;
}

/**
 * REQUIREMENTS.md § 11.5.1. Whether an event is the reader's own to be
 * interrupted by — a 우리 일정, or a 개인 일정 they wrote themselves.
 *
 * INFO: § 11.5. The other person's 개인 일정 stays on the list to be read; what
 * this withholds is the panel opening itself over a conversation and the header
 * blooming. It lives here for `TimedOccurrence`'s own reason above — 채팅's screen
 * and its § 16.2. mirror both read it.
 */
export function isForReader(
  occurrence: { event: { scope: EventScope; createdBy: UserId } },
  readerId: UserId,
): boolean {
  return occurrence.event.scope === "shared" || occurrence.event.createdBy === readerId;
}

/** The countdown an imminent row carries in place of its date — `진행 중`, `곧 시작`, `3시간 뒤`. */
export function formatTimeLeft(occurrence: TimedOccurrence, now: number): string {
  const left = Date.parse(occurrence.startsAt) - now;

  if (left <= 0) {
    return "진행 중";
  }

  const hours = Math.floor(left / AN_HOUR);

  // INFO: The last hour reads `곧 시작` rather than counting minutes down — a label that moves every minute re-renders § 8.3.'s virtualizer for a number nobody watches tick.
  return hours === 0 ? "곧 시작" : `${hours}시간 뒤`;
}

/** The instant one of these rows next changes what it reads, so a screen showing them arms one timer instead of polling. */
export function nextTimeLeftChangeAt(
  occurrences: TimedOccurrence[],
  now: number,
): Nullable<number> {
  const instants = occurrences
    .map((occurrence) => toNextChangeAt(occurrence, now))
    .filter((at): at is number => at !== null);

  return instants.length === 0 ? null : Math.min(...instants);
}

// INFO: An hourly boundary while the countdown runs, the crossing into the window before that, and nothing at all once the event has started.
function toNextChangeAt(occurrence: TimedOccurrence, now: number): Nullable<number> {
  const startsAt = Date.parse(occurrence.startsAt);
  const left = startsAt - now;

  if (left <= 0) {
    return null;
  }

  return left > A_DAY ? startsAt - A_DAY : startsAt - Math.floor(left / AN_HOUR) * AN_HOUR;
}
