import type { EventOccurrence } from "@/entities/event";
import type { EventColor } from "@/shared/config";
import type { EventRecurrence, EventScope } from "@/shared/db";
import { toDayKey, toInstant, toTimeField, type Maybe, type Nullable } from "@/shared/lib";
import type { EventBody } from "../api/write-event";

/**
 * The form's own shape: wall-clock fields, because that is what `<input type="date">`
 * and `<input type="time">` speak. `toEventBody` is the one place they become
 * instants.
 */
export type EventDraft = {
  title: string;
  description: string;
  startDayKey: string;
  startTime: string;
  endDayKey: string;
  endTime: string;
  allDay: boolean;
  color: Nullable<EventColor>;
  recurrence: EventRecurrence;
  scope: EventScope;
};

const DEFAULT_START_TIME = "12:00";

const DEFAULT_END_TIME = "13:00";

// INFO: REQUIREMENTS.md § 6. `ends_at` is NOT NULL, so a new event is given an end rather than being allowed to be open-ended.
const ALL_DAY_START = "00:00";

const ALL_DAY_END = "23:59";

/** A blank draft anchored on the day the user tapped. */
export function toNewDraft(dayKey: string): EventDraft {
  return {
    title: "",
    description: "",
    startDayKey: dayKey,
    startTime: DEFAULT_START_TIME,
    endDayKey: dayKey,
    endTime: DEFAULT_END_TIME,
    allDay: false,
    color: null,
    recurrence: "none",
    scope: "shared",
  };
}

/**
 * WARN: Seeded from the occurrence's **anchor** (`occurrence.event`), never from
 * its projected instants. A `yearly` event edited off the year in view would
 * otherwise be saved into that year and stop recurring from where it started.
 */
export function toEditDraft(occurrence: EventOccurrence): EventDraft {
  const { event } = occurrence;

  return {
    title: event.title,
    description: event.description ?? "",
    startDayKey: toDayKey(event.startsAt),
    startTime: toTimeField(event.startsAt),
    endDayKey: toDayKey(event.endsAt),
    endTime: toTimeField(event.endsAt),
    allDay: event.allDay,
    color: event.color,
    recurrence: event.recurrence,
    scope: event.scope,
  };
}

/**
 * Answers `null` when either end's fields do not name an instant, which a native
 * `date` or `time` input reaches by simply being **cleared** (`toInstant`).
 */
export function toEventBody(draft: EventDraft): Nullable<EventBody> {
  const startsAt = toInstant(draft.startDayKey, draft.allDay ? ALL_DAY_START : draft.startTime);
  const endsAt = toInstant(draft.endDayKey, draft.allDay ? ALL_DAY_END : draft.endTime);

  if (!startsAt || !endsAt) {
    return null;
  }

  return {
    title: draft.title.trim(),
    description: draft.description.trim() || null,
    startsAt,
    endsAt,
    allDay: draft.allDay,
    color: draft.color,
    recurrence: draft.recurrence,
    scope: draft.scope,
  };
}

/**
 * The submit button's gate: a title, two parsable ends, and an end that does not
 * precede its start.
 *
 * WARN: Called during render, so it must be total — an emptied date field used to
 * throw out of here and take the whole screen down with it.
 */
export function isDraftSubmittable(draft: Maybe<EventDraft>): boolean {
  if (!draft?.title.trim()) {
    return false;
  }

  const body = toEventBody(draft);

  return body !== null && body.startsAt <= body.endsAt;
}
