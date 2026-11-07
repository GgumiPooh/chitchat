import { isEventColor } from "@/shared/config";
import type { Event } from "@/shared/db";
import type { CalendarEvent } from "./types";

/**
 * WARN: `events.color` is a free `text` column, so the value is narrowed here
 * rather than asserted. A colour retired from DESIGN.md § 4.1.7. becomes `null`
 * and renders the fallback, instead of emitting a class name Tailwind never built.
 */
export function toCalendarEvent(row: Event): CalendarEvent {
  return {
    allDay: row.allDay,
    color: isEventColor(row.color) ? row.color : null,
    createdBy: row.createdBy,
    description: row.description,
    endsAt: row.endsAt.toISOString(),
    exdates: row.exdates ?? [],
    iCalUid: row.iCalUid,
    isReadOnly: row.isReadOnly,
    id: row.id,
    recurrence: row.recurrence,
    recurrenceUntil: row.recurrenceUntil,
    reminderEnabled: row.reminderEnabled,
    rrule: row.rrule,
    scope: row.scope,
    source: row.source,
    startsAt: row.startsAt.toISOString(),
    title: row.title,
  };
}
