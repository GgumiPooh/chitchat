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
    title: row.title,
    description: row.description,
    startsAt: row.startsAt.toISOString(),
    endsAt: row.endsAt.toISOString(),
    allDay: row.allDay,
    color: isEventColor(row.color) ? row.color : null,
    recurrence: row.recurrence,
    scope: row.scope,
    createdBy: row.createdBy,
    id: row.id,
  };
}
