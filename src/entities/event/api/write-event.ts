import "server-only";

import type { EventColor } from "@/shared/config";
import { events, getDb, type EventRecurrence, type EventScope } from "@/shared/db";
import type { Nullable } from "@/shared/lib";
import { eq } from "drizzle-orm";
import { toCalendarEvent } from "../model/to-calendar-event";
import type { CalendarEvent } from "../model/types";

export type CreateEventParams = {
  title: string;
  description: Nullable<string>;
  startsAt: Date;
  endsAt: Date;
  allDay: boolean;
  color: Nullable<EventColor>;
  recurrence: EventRecurrence;
  scope: EventScope;
  createdBy: string;
};

/** REQUIREMENTS.md § 11.4. Every field is optional — an edit sends only what changed. */
export type UpdateEventParams = {
  title?: string;
  description?: Nullable<string>;
  startsAt?: Date;
  endsAt?: Date;
  allDay?: boolean;
  color?: Nullable<EventColor>;
  recurrence?: EventRecurrence;
  scope?: EventScope;
};

export async function getEvent(id: string): Promise<Nullable<CalendarEvent>> {
  const db = getDb();
  const [row] = await db.select().from(events).where(eq(events.id, id)).limit(1);

  return row ? toCalendarEvent(row) : null;
}

export async function createEvent(params: CreateEventParams): Promise<CalendarEvent> {
  const db = getDb();
  const [row] = await db.insert(events).values(params).returning();

  return toCalendarEvent(row);
}

/**
 * REQUIREMENTS.md § 11.4. Not scoped to `created_by` — both users may edit every
 * event, so authorship is displayed and never enforced.
 *
 * Answers `null` when the row is gone, which the caller turns into a 404.
 */
export async function updateEvent(
  id: string,
  params: UpdateEventParams,
): Promise<Nullable<CalendarEvent>> {
  const db = getDb();
  const [row] = await db
    .update(events)
    .set({ ...params, updatedAt: new Date() })
    .where(eq(events.id, id))
    .returning();

  return row ? toCalendarEvent(row) : null;
}

/**
 * Answers the row it removed, because § 11.5.'s delete notice is composed from a
 * snapshot of it — by the time the message is written the row is gone.
 */
export async function deleteEvent(id: string): Promise<Nullable<CalendarEvent>> {
  const db = getDb();
  const [row] = await db.delete(events).where(eq(events.id, id)).returning();

  return row ? toCalendarEvent(row) : null;
}
