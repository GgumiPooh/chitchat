import type { CalendarEvent, EventOccurrence } from "@/entities/event";

/**
 * REQUIREMENTS.md § 11.5. The occurrence a chat notice opens: the row itself for a
 * `none` event, and for a `yearly` one its projection onto the year the notice
 * names — `projectYearly`'s own arithmetic, so a 2월 29일 anchor overflows the same way.
 */
export function toNoticeOccurrence(event: CalendarEvent, noticeStartsAt: string): EventOccurrence {
  if (event.recurrence !== "yearly") {
    return { event, startsAt: event.startsAt, endsAt: event.endsAt };
  }

  const startsAt = new Date(event.startsAt);
  const duration = Date.parse(event.endsAt) - Date.parse(event.startsAt);

  startsAt.setUTCFullYear(new Date(noticeStartsAt).getUTCFullYear());

  return {
    event,
    startsAt: startsAt.toISOString(),
    endsAt: new Date(startsAt.getTime() + duration).toISOString(),
  };
}
