import type { CalendarEvent, EventOccurrence } from "@/entities/event";
import { projectRecurrence, toDayKey } from "@/shared/lib";

/**
 * REQUIREMENTS.md § 11.5. The occurrence a chat notice opens: the row itself for a
 * `none` event, and for a recurring one its projection onto the day the notice names.
 *
 * INFO: `projectRecurrence` widens by a period each side, so the span containing the notice's day is picked out here.
 */
export function toNoticeOccurrence(event: CalendarEvent, noticeStartsAt: string): EventOccurrence {
  const dayKey = toDayKey(noticeStartsAt);
  const span =
    projectRecurrence(event, dayKey, dayKey).find(
      ({ startsAt, endsAt }) => toDayKey(startsAt) <= dayKey && toDayKey(endsAt) >= dayKey,
    ) ?? event;

  return { event, startsAt: span.startsAt, endsAt: span.endsAt };
}
