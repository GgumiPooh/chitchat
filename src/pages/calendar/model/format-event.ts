import type { EventOccurrence } from "@/entities/event";
import { countDays, formatMonthDay, formatTime, toDayKey } from "@/shared/lib";

// INFO: REQUIREMENTS.md § 16.'s mirror renders the same event line, and a page may not import a sibling page — so the two that both need live in `shared/lib` and are re-exported here for this slice's existing readers.
export { formatMultiDaySpan, formatOccurrenceTime } from "@/shared/lib";

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
export function formatUpcomingWhen(occurrence: EventOccurrence, todayKey: string): string {
  const startDayKey = toDayKey(occurrence.startsAt);

  // INFO: DESIGN.md § 7.9. An event that began before today has no date to announce under a heading reading 다가오는, and its start date is a week in the past.
  if (startDayKey < todayKey) {
    return "진행 중";
  }

  const day = formatRelativeDay(startDayKey, todayKey);

  return occurrence.event.allDay ? day : `${day} ${formatTime(occurrence.startsAt)}`;
}
