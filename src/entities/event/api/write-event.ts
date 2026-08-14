import "server-only";

import type { EventColor } from "@/shared/config";
import { events, getDb, nextSnowflake, type EventRecurrence, type EventScope } from "@/shared/db";
import type { EventId, Nullable, UserId } from "@/shared/lib";
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
  createdBy: UserId;
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

export async function getEvent(id: EventId): Promise<Nullable<CalendarEvent>> {
  const db = getDb();
  const [row] = await db.select().from(events).where(eq(events.id, id)).limit(1);

  return row ? toCalendarEvent(row) : null;
}

export async function createEvent(params: CreateEventParams): Promise<CalendarEvent> {
  const db = getDb();
  const [row] = await db
    .insert(events)
    .values({ id: nextSnowflake<EventId>(), ...params })
    .returning();

  return toCalendarEvent(row);
}

/**
 * REQUIREMENTS.md § 11.4. Not scoped to `created_by` — both users may edit every
 * event, so authorship is displayed and never enforced.
 *
 * Answers `null` when the row is gone, which the caller turns into a 404.
 */
export async function updateEvent(
  id: EventId,
  params: UpdateEventParams,
): Promise<Nullable<CalendarEvent>> {
  const db = getDb();
  const [row] = await db
    .update(events)
    // TODO: RESTRUCTURE.md § 6. `updated_at` is no longer stamped — nothing has ever read it, and § 6. _Timestamps_ only keeps such a column where it carries a version somebody reads (`emoticon_items.updated_at` is `Emoticon.version`). It stays declared until the drop that follows this build.
    .set(params)
    .where(eq(events.id, id))
    .returning();

  return row ? toCalendarEvent(row) : null;
}

/**
 * Answers the row it removed, because § 11.5.'s delete notice is composed from a
 * snapshot of it — by the time the message is written the row is gone.
 */
export async function deleteEvent(id: EventId): Promise<Nullable<CalendarEvent>> {
  const db = getDb();
  const [row] = await db.delete(events).where(eq(events.id, id)).returning();

  return row ? toCalendarEvent(row) : null;
}
