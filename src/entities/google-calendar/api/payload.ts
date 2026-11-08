import "server-only";

import {
  EVENT_COLOR_TO_GOOGLE_COLOR,
  isCuratedObservance,
  isEventColor,
  isGoogleBirthdayGreeting,
  isGooglePublicHoliday,
  isHolidayCalendarId,
  MAX_EVENT_DESCRIPTION_LENGTH,
  MAX_EVENT_TITLE_LENGTH,
  toEventColorFromGoogle,
  type EventColor,
} from "@/shared/config";
import type { Event } from "@/shared/db";
import {
  AN_HOUR,
  cleanseEventMemo,
  formatExternalAuthorTag,
  fromGoogleRecurrence,
  shiftDayKey,
  TIME_ZONE,
  toDayKey,
  toGoogleRecurrence,
  toInstant,
  type EventRecurrence,
  type Maybe,
  type Nullable,
  type Optional,
} from "@/shared/lib";
import type { SyncableCalendarEvent } from "../model/types";
import type { GoogleEventResource } from "./client";

export type MappedJandhEvent = {
  allDay: boolean;
  color: Nullable<EventColor>;
  description: Nullable<string>;
  endsAt: Date;
  exdates: string[];
  iCalUid: Nullable<string>;
  recurrence: EventRecurrence;
  recurrenceUntil: Nullable<string>;
  rrule: Nullable<string>;
  startsAt: Date;
  title: string;
};

export function toGoogleEventPayload(
  event: Event | SyncableCalendarEvent,
  options: boolean | { isPatch?: boolean; omitRecurrence?: boolean } = false,
): Record<string, unknown> {
  const isPatch = typeof options === "boolean" ? options : Boolean(options.isPatch);
  const omitRecurrence = typeof options === "boolean" ? false : Boolean(options.omitRecurrence);
  const isoStartsAt = new Date(event.startsAt).toISOString();
  const isoEndsAt = new Date(event.endsAt).toISOString();

  let start: Record<string, unknown>;
  let end: Record<string, unknown>;

  if (event.allDay) {
    const startDay = toDayKey(event.startsAt);
    const endDay = shiftDayKey(toDayKey(event.endsAt), 1);

    start = isPatch ? { date: startDay, dateTime: null } : { date: startDay };
    end = isPatch ? { date: endDay, dateTime: null } : { date: endDay };
  } else {
    start = isPatch
      ? { date: null, dateTime: isoStartsAt, timeZone: TIME_ZONE }
      : { dateTime: isoStartsAt, timeZone: TIME_ZONE };
    end = isPatch
      ? { date: null, dateTime: isoEndsAt, timeZone: TIME_ZONE }
      : { dateTime: isoEndsAt, timeZone: TIME_ZONE };
  }

  const recurrenceLines = toGoogleRecurrence({
    allDay: event.allDay,
    anchorStartsAt: isoStartsAt,
    exdates: event.exdates,
    recurrence: event.recurrence,
    recurrenceUntil: event.recurrenceUntil,
    rrule: event.rrule,
  });

  const recurrence = omitRecurrence ? undefined : (recurrenceLines ?? (isPatch ? [] : undefined));

  let description: Optional<string>;
  if (isPatch) {
    description = event.description ?? "";
  } else if (event.description) {
    description = event.description;
  }

  let colorId: Maybe<string>;
  if (event.color && isEventColor(event.color)) {
    colorId = EVENT_COLOR_TO_GOOGLE_COLOR[event.color];
  } else if (isPatch) {
    colorId = null;
  }

  const payload: Record<string, unknown> = {
    end,
    extendedProperties: {
      shared: {
        jandhEventId: String(event.id),
      },
    },
    start,
    summary: event.title,
  };

  if (description !== undefined) {
    payload.description = description;
  }
  if (colorId !== undefined) {
    payload.colorId = colorId;
  }
  if (recurrence !== undefined) {
    payload.recurrence = recurrence;
  }

  return payload;
}

// INFO: REQUIREMENTS.md § 11.8. Strip Google Calendar observance/holiday settings boilerplate so system imports do not show noisy duplicate memos.
export function cleanseRemoteDescription(
  rawDescription: Optional<Nullable<string>>,
): Nullable<string> {
  const memo = cleanseEventMemo(rawDescription);
  return memo ? memo.slice(0, MAX_EVENT_DESCRIPTION_LENGTH) : null;
}

export function fromRemotePayload(
  gEvent: GoogleEventResource,
  sourceBackgroundColor?: Nullable<string>,
  accessRole?: string,
  calendarId?: string,
): Nullable<MappedJandhEvent> {
  const summary = gEvent.summary?.trim() ?? "";

  if (
    gEvent.eventType === "workingLocation" ||
    gEvent.eventType === "focusTime" ||
    isGoogleBirthdayGreeting({ source: "google", title: summary })
  ) {
    return null;
  }

  // INFO: REQUIREMENTS.md § 11.7. On Google holiday calendars, public holidays are rendered natively by ChitChat (red numerals, no dot, static row), so duplicate events are skipped. Uncurated observances (24 solar terms, random observances) are filtered out.
  if (calendarId && isHolidayCalendarId(calendarId)) {
    if (isGooglePublicHoliday(summary)) {
      return null;
    }
    if (!isCuratedObservance(summary)) {
      return null;
    }
  }

  let allDay: boolean;
  let startsAt: Date;
  let endsAt: Date;

  if (gEvent.start?.date) {
    allDay = true;
    const startDay = gEvent.start.date;
    const rawEnd = gEvent.end?.date ? shiftDayKey(gEvent.end.date, -1) : startDay;
    const endDay = rawEnd < startDay ? startDay : rawEnd;
    const startsAtIso = toInstant(startDay, "00:00");
    const endsAtIso = toInstant(endDay, "23:59");

    if (!startsAtIso || !endsAtIso) {
      return null;
    }

    startsAt = new Date(startsAtIso);
    endsAt = new Date(endsAtIso);
  } else if (gEvent.start?.dateTime) {
    allDay = false;
    startsAt = new Date(gEvent.start.dateTime);
    endsAt = gEvent.end?.dateTime
      ? new Date(gEvent.end.dateTime)
      : new Date(startsAt.getTime() + AN_HOUR);

    if (endsAt.getTime() < startsAt.getTime()) {
      endsAt = startsAt;
    }
  } else {
    return null;
  }

  const recurrenceData = fromGoogleRecurrence(gEvent.recurrence, startsAt.toISOString(), allDay);
  const color = toEventColorFromGoogle(gEvent.colorId ?? null, sourceBackgroundColor);
  const fallbackTitle = accessRole === "freeBusyReader" ? "바쁨" : "(제목 없음)";
  const title = (gEvent.summary?.trim() || fallbackTitle).slice(0, MAX_EVENT_TITLE_LENGTH);
  // INFO: REQUIREMENTS.md § 11.8. Strip Google Calendar's observance/holiday settings boilerplate so system imports do not show noisy duplicate memos.
  let description = cleanseRemoteDescription(gEvent.description);

  // INFO: REQUIREMENTS.md § 11.4. In shared/family calendars where creator is another member, prefix author tag for UI attribution.
  if (gEvent.creator && gEvent.creator.self === false) {
    const creatorName = gEvent.creator.displayName?.trim() || gEvent.creator.email?.trim();
    if (creatorName) {
      const tag = formatExternalAuthorTag(creatorName);
      description = description ? `${tag}\n${description}` : tag;
    }
  }

  return {
    allDay,
    color,
    description,
    endsAt,
    exdates: recurrenceData.exdates,
    iCalUid: gEvent.iCalUID ?? null,
    recurrence: recurrenceData.recurrence,
    recurrenceUntil: recurrenceData.recurrenceUntil,
    rrule: recurrenceData.rrule,
    startsAt,
    title,
  };
}

export const fromGoogleEventPayload = fromRemotePayload;
