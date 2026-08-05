import type { EventColor } from "@/shared/config";
import type { EventRecurrence, EventScope } from "@/shared/db";
import type { Nullable, UpcomingMilestone } from "@/shared/lib";

/**
 * An event as it crosses `/api/events`. Timestamps are ISO strings because the
 * wire format is JSON; the client parses them where it needs a `Date`.
 *
 * INFO: `startsAt` / `endsAt` are always the **stored** instants — for a `yearly`
 * row that is the anchor year it was created in, never the year being displayed.
 * The projection onto a displayed year is `EventOccurrence`.
 */
export type CalendarEvent = {
  title: string;
  description: Nullable<string>;
  startsAt: string;
  endsAt: string;
  allDay: boolean;
  // INFO: DESIGN.md § 4.1.7. Null is the common case, not an error — the cell falls back to `meta-soft`.
  color: Nullable<EventColor>;
  recurrence: EventRecurrence;
  scope: EventScope;
  // INFO: REQUIREMENTS.md § 11.4. A record of authorship, never a permission check — either user may edit any event.
  createdBy: string;
  id: string;
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
  event: CalendarEvent;
  startsAt: string;
  endsAt: string;
};

/**
 * REQUIREMENTS.md § 11.1. Everything above the month grid, resolved together.
 *
 * INFO: `todayKey` and `startDate` come from the server so a skewed device clock
 * cannot give the two users different numbers, and so the client can derive
 * milestone markers for any month it scrolls to without another request.
 */
export type CalendarSummary = {
  startDate: string;
  todayKey: string;
  /** Following the Korean convention, the start date itself is day 1. */
  dayCount: number;
  nextMilestone: Nullable<UpcomingMilestone>;
  upcoming: EventOccurrence[];
};
