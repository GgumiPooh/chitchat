import "server-only";

import type { EventColor } from "@/shared/config";
import {
  events,
  getDb,
  nextSnowflake,
  type EventRecurrence,
  type EventScope,
  type EventSource,
} from "@/shared/db";
import type { EventId, Nullable, UserId } from "@/shared/lib";
import { eq } from "drizzle-orm";
import { toCalendarEvent } from "../model/to-calendar-event";
import type { CalendarEvent } from "../model/types";

export type CreateEventParams = {
  allDay: boolean;
  color: Nullable<EventColor>;
  createdBy: UserId;
  description: Nullable<string>;
  endsAt: Date;
  exdates?: string[];
  iCalUid?: Nullable<string>;
  isReadOnly?: boolean;
  recurrence: EventRecurrence;
  recurrenceUntil?: Nullable<string>;
  reminderEnabled: boolean;
  rrule?: Nullable<string>;
  scope: EventScope;
  source?: EventSource;
  startsAt: Date;
  title: string;
};

/** REQUIREMENTS.md § 11.4. Every field is optional — an edit sends only what changed. */
export type UpdateEventParams = {
  allDay?: boolean;
  color?: Nullable<EventColor>;
  description?: Nullable<string>;
  endsAt?: Date;
  exdates?: string[];
  iCalUid?: Nullable<string>;
  isReadOnly?: boolean;
  recurrence?: EventRecurrence;
  recurrenceUntil?: Nullable<string>;
  reminderEnabled?: boolean;
  rrule?: Nullable<string>;
  scope?: EventScope;
  source?: EventSource;
  startsAt?: Date;
  title?: string;
  updatedAt?: Date;
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
  const patch: UpdateEventParams = {
    ...params,
    updatedAt: new Date(),
  };

  if (
    params.recurrence !== undefined &&
    params.recurrence !== "custom" &&
    params.rrule === undefined
  ) {
    patch.rrule = null;
  }
  if (params.recurrence === "none") {
    if (params.recurrenceUntil === undefined) {
      patch.recurrenceUntil = null;
    }
    if (params.exdates === undefined) {
      patch.exdates = [];
    }
  }

  const [row] = await db.update(events).set(patch).where(eq(events.id, id)).returning();

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
