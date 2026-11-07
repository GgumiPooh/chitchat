import type { EventColor } from "@/shared/config";
import type { EventRecurrence, EventScope, EventSource } from "@/shared/db";
import type { EventId, Nullable, UpcomingMilestone, UserId } from "@/shared/lib";

/**
 * An event as it crosses `/api/events`. Timestamps are ISO strings because the
 * wire format is JSON; the client parses them where it needs a `Date`.
 *
 * INFO: `startsAt` / `endsAt` are always the **stored** instants — for a `yearly`
 * row that is the anchor year it was created in, never the year being displayed.
 * The projection onto a displayed year is `EventOccurrence`.
 */
export type CalendarEvent = {
  allDay: boolean;
  // INFO: DESIGN.md § 4.1.7. Null is the common case, not an error — the cell falls back to `meta-soft`.
  color: Nullable<EventColor>;
  // INFO: REQUIREMENTS.md § 11.4. A record of authorship, never a permission check — either user may edit any event.
  createdBy: UserId;
  description: Nullable<string>;
  endsAt: string;
  exdates: string[];
  iCalUid: Nullable<string>;
  isReadOnly: boolean;
  recurrence: EventRecurrence;
  recurrenceUntil: Nullable<string>;
  reminderEnabled: boolean;
  rrule: Nullable<string>;
  scope: EventScope;
  source: EventSource;
  startsAt: string;
  title: string;
  id: EventId;
};

/**
 * One appearance of an event on the calendar. A `none` event has exactly one and
 * its instants equal the row's; a `yearly` one has a separate occurrence per year
 * in view (REQUIREMENTS.md § 6. — projected on read, never stored).
 *
 * WARN: `event.startsAt` is the anchor and `startsAt` here is the projection. An
 * edit form must send the anchor back, or every save would walk a yearly event
 * forward into whatever year the user happened to be looking at.
 */
export type EventOccurrence = {
  endsAt: string;
  event: CalendarEvent;
  startsAt: string;
};

/**
 * REQUIREMENTS.md § 11.1. Everything above the month grid, resolved together.
 *
 * INFO: `todayKey` and `startDate` come from the server so a skewed device clock
 * cannot give the two users different numbers, and so the client can derive
 * milestone markers for any month it scrolls to without another request.
 */
export type CalendarSummary = {
  dayCount: number;
  /** REQUIREMENTS.md § 11.1. `couple_settings.first_user_id` / `second_user_id` — login order, not permission. */
  firstUserId: Nullable<UserId>;
  nextMilestone: Nullable<UpcomingMilestone>;
  secondUserId: Nullable<UserId>;
  startDate: string;
  todayKey: string;
  upcoming: EventOccurrence[];
};
