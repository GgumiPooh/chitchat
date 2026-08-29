import type { EventOccurrence } from "@/entities/event";
import type { EventColor } from "@/shared/config";
import type { EventRecurrence, EventScope } from "@/shared/db";
import { AN_HOUR, toDayKey, toInstant, toTimeField, type Maybe, type Nullable } from "@/shared/lib";
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
  reminderEnabled: boolean;
};

// INFO: A half-hour grid rather than the hour: at 14:05 the next hour boundary is 55 minutes out, which is never the thing being added right now.
const DEFAULT_SLOT = AN_HOUR / 2;

// INFO: The seed for every day the clock cannot speak for — another date entirely, or a rounding that would run the hour past midnight.
const FALLBACK_START_TIME = "12:00";

const FALLBACK_END_TIME = "13:00";

// INFO: REQUIREMENTS.md § 6. `ends_at` is NOT NULL, so a new event is given an end rather than being allowed to be open-ended.
const ALL_DAY_START = "00:00";

const ALL_DAY_END = "23:59";

/**
 * REQUIREMENTS.md § 11.4. A blank draft on the day the user tapped, seeded from the
 * clock when that day is the one the clock is on.
 *
 * WARN: `now` is a parameter rather than a `Date.now()` in here. The one caller
 * runs this inside a `useState` initializer, where the read is a mount-time
 * constant; taken in the module it would be an impure render hidden behind a
 * helper (`entities/event/api/list-events.ts`).
 */
export function toNewDraft(dayKey: string, now: number): EventDraft {
  const { startTime, endTime } = toSeedTimes(dayKey, now);

  return {
    title: "",
    description: "",
    startDayKey: dayKey,
    startTime,
    // INFO: The seed never leaves the tapped day (`toSeedTimes`), so the two ends always share it.
    endDayKey: dayKey,
    endTime,
    allDay: false,
    color: null,
    recurrence: "none",
    scope: "shared",
    reminderEnabled: true,
  };
}

/**
 * WARN: Both ends are checked against `dayKey`, not merely against each other. The
 * clock is only ever a useful default for the day it is telling the time of, and
 * rounding it up at 23:45 lands the hour on the *next* day — seeding a wall-clock
 * time the form's own date field does not show, which read as an event a full day
 * in the past.
 */
function toSeedTimes(dayKey: string, now: number): { startTime: string; endTime: string } {
  // WARN: The grid is epoch-aligned, and it lands on a `TIME_ZONE` half hour only because that zone's offset is whole hours (`TIME_ZONE_OFFSET`).
  const startsAt = Math.ceil(now / DEFAULT_SLOT) * DEFAULT_SLOT;
  const endsAt = startsAt + AN_HOUR;

  if (toDayKey(startsAt) !== dayKey || toDayKey(endsAt) !== dayKey) {
    return { startTime: FALLBACK_START_TIME, endTime: FALLBACK_END_TIME };
  }

  return { startTime: toTimeField(startsAt), endTime: toTimeField(endsAt) };
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
    reminderEnabled: event.reminderEnabled,
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
    reminderEnabled: draft.reminderEnabled,
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

/**
 * Why the submit button is dead, or `null` when it is not.
 *
 * INFO: A missing title is deliberately **not** a message — the field is right
 * there, empty, under its own placeholder. Only the two states a filled-in form can
 * reach without being able to say why say anything.
 */
export function toDraftIssue(draft: EventDraft): Nullable<string> {
  const body = toEventBody(draft);

  if (!body) {
    return draft.title.trim() ? "날짜와 시간을 채워 주세요" : null;
  }

  return body.startsAt > body.endsAt ? "종료가 시작보다 빨라요" : null;
}
