import type { EventOccurrence } from "@/entities/event";
import { countDays, formatMonthDay, formatTime, toDayKey } from "@/shared/lib";

/** `오늘`, `내일`, `3일 뒤`, then the date itself once it is further out than a week. */
export function formatRelativeDay(dayKey: string, todayKey: string): string {
  const daysLeft = countDays(todayKey, dayKey);

  if (daysLeft === 0) {
    return "오늘";
  }

  if (daysLeft === 1) {
    return "내일";
  }

  return daysLeft > 1 && daysLeft <= 7 ? `${daysLeft}일 뒤` : formatMonthDay(dayKey);
}

/** `종일`, `오후 2:30`, or `오후 2:30 – 오후 4:00` when the two differ. */
export function formatOccurrenceTime(occurrence: EventOccurrence): string {
  if (occurrence.event.allDay) {
    return "종일";
  }

  const startsAt = formatTime(occurrence.startsAt);
  const endsAt = formatTime(occurrence.endsAt);

  // INFO: A same-instant end is what a zero-length event looks like; repeating the time would say nothing.
  return startsAt === endsAt ? startsAt : `${startsAt} – ${endsAt}`;
}

/** The line an upcoming entry carries: when it happens, at a glance. */
export function formatUpcomingWhen(occurrence: EventOccurrence, todayKey: string): string {
  const day = formatRelativeDay(toDayKey(occurrence.startsAt), todayKey);

  return occurrence.event.allDay ? day : `${day} ${formatTime(occurrence.startsAt)}`;
}
