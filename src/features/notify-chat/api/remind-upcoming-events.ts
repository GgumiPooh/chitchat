import "server-only";

import { listEventOccurrences, type EventOccurrence } from "@/entities/event";
import { countUnreadMessages, createSystemMessage } from "@/entities/message";
import { pushToUser } from "@/entities/push-subscription";
import { CALENDAR_DAY_PARAM, CALENDAR_ROUTE } from "@/shared/config";
import { events, getDb, users } from "@/shared/db";
import {
  A_DAY,
  A_MINUTE,
  AN_HOUR,
  formatMonthDay,
  formatTime,
  idToDate,
  shiftDayKey,
  TIME_ZONE_OFFSET,
  toDayKey,
  type EventId,
  type UserId,
} from "@/shared/lib";
import type { DbTransaction } from "@/shared/storage";
import { and, eq, isNull, lt, or } from "drizzle-orm";

type ReminderLead = "d7" | "d1" | "h2";

type Threshold = { lead: ReminderLead; at: number };

// INFO: REQUIREMENTS.md § 16.3. One day past the furthest threshold, so a `d7` the scheduler delivers late is still inside the window it is found in.
const HORIZON_DAYS = 8;

/**
 * When an all-day row's notice goes out, in `TIME_ZONE`.
 *
 * WARN: REQUIREMENTS.md § 16.3. An all-day event stores 00:00 as its start, so an offset
 * subtracted from it lands at midnight for `d1` and at 22:00 the night before for `h2` —
 * which is why these two are sent at a fixed clock time and why `h2` has no all-day form.
 */
const ALL_DAY_NOTICE_HOUR = "09";

/** What one pass did, for the log line at whichever end asked for it. */
export type ReminderReport = { sent: number; occurrences: number };

/**
 * REQUIREMENTS.md § 16.3. One pass over the coming week: claims every threshold that has
 * come due and raises its banner. Safe to run from two clocks at once — the claim is an
 * UPDATE predicate, so overlapping passes cannot send one twice.
 *
 * INFO: Shared by `scripts/ops/remind.ts` (GitHub Actions) and `POST /api/ops/remind` (the Cloudflare Worker's cron), because GitHub drops most ten-minute schedules and the Worker is the clock that does not.
 */
export async function remindUpcomingEvents(): Promise<ReminderReport> {
  const now = Date.now();
  const todayKey = toDayKey(now);
  // INFO: REQUIREMENTS.md § 16.3. Filtered here and not in the query — the calendar reads the same function and still shows a silenced event.
  const occurrences = (
    await listEventOccurrences(todayKey, shiftDayKey(todayKey, HORIZON_DAYS))
  ).filter((occurrence) => occurrence.event.reminderEnabled);
  const audience = await getDb().select({ id: users.id }).from(users);
  let sent = 0;

  for (const occurrence of occurrences) {
    // WARN: Latest threshold first, and at most one per run. A backlog — the runner down for a day — otherwise fires 7일 전 and 1일 전 back to back for an event starting tomorrow; taking the most recent due one collapses that into the banner that is actually true.
    for (const { lead, at } of toDueThresholds(occurrence, now)) {
      const recipients = audience.map(({ id }) => id).filter((id) => isRecipient(occurrence, id));

      // WARN: Contained per occurrence. The claim is already stamped, so a throw here loses THIS banner however it is handled — but an uncaught one also abandons every occurrence after it, turning one bad row into a silent pass that did nothing.
      try {
        sent += await remind(recipients, occurrence, lead, at, now);
      } catch (error) {
        console.error(`[remind] could not notify for ${occurrence.event.id}`, error);
      }

      break;
    }
  }

  return { sent, occurrences: occurrences.length };
}

/**
 * Takes the threshold and posts the notice together, then raises the banners.
 * REQUIREMENTS.md § 16.3.
 *
 * WARN: The claim and the notice are one transaction so the stamp cannot outlive a
 * failed INSERT — a threshold marked sent with nothing written is one no later run
 * will retry. The push is deliberately OUTSIDE it: a device that took the banner
 * cannot be un-taken, and a recipient with no subscription at all would otherwise
 * roll the notice back on every run, destroying the record for exactly the reader
 * who has no banner to read instead.
 */
async function remind(
  recipients: UserId[],
  occurrence: EventOccurrence,
  lead: ReminderLead,
  at: number,
  now: number,
): Promise<number> {
  const claimed = await getDb().transaction(async (tx) => {
    if (!(await claim(tx, occurrence.event.id, at))) {
      return false;
    }

    // WARN: REQUIREMENTS.md § 16.3. The LAST threshold only. All three fire for one timed event, and the notice names a date rather than a countdown — so posting each of them leaves three byte-identical rows a week apart, and the earliest of them says 다가왔어요 seven days out.
    if (isFinalLead(occurrence, lead)) {
      await createSystemMessage({
        tx,
        // INFO: § 16.3. Only to satisfy the column — `composeEventNotice` renders a reminder with no actor precisely because nobody performed it.
        senderId: occurrence.event.createdBy,
        action: "event_reminder",
        eventId: occurrence.event.id,
        eventTitle: occurrence.event.title,
        eventStartsAt: new Date(occurrence.startsAt),
      });
    }

    return true;
  });

  if (!claimed) {
    return 0;
  }

  const body = toBody(occurrence, lead, now);

  for (const userId of recipients) {
    await pushToUser(userId, {
      title: occurrence.event.title,
      body,
      // WARN: Carried because `sw.js` drives `navigator.setAppBadge` from it — a banner sent without one clears the reader's message badge (§ 16.1.).
      // INFO: Counted after the commit above, so it includes the notice the banner is announcing.
      unreadCount: await countUnreadMessages(userId),
      url: `${CALENDAR_ROUTE}?${CALENDAR_DAY_PARAM}=${toDayKey(occurrence.startsAt)}`,
    });
  }

  return recipients.length;
}

/**
 * Takes this threshold for this event, answering whether this run is the one that got it.
 * REQUIREMENTS.md § 16.3.
 *
 * WARN: The guard is the UPDATE's own predicate, which is what makes overlapping runs safe —
 * two of them race on one row and Postgres lets exactly one match. Read-then-write would let
 * both read NULL and both send.
 *
 * WARN: One column carries all three thresholds, and this comparison is why. They fire in
 * order, so a stamp EARLIER than the threshold being asked about is a threshold this event
 * has not reached yet — and a stamp earlier than the whole sequence is a previous `yearly`
 * occurrence's (§ 6.). That is also the entire recurrence handling: nothing resets this.
 *
 * WARN: Stamped before the push rather than after. A process that dies in between loses one
 * banner; the other order duplicates every banner whenever two runs overlap, which the
 * scheduler does routinely (§ 12.4.).
 */
async function claim(tx: DbTransaction, eventId: EventId, at: number): Promise<boolean> {
  const [row] = await tx
    .update(events)
    .set({ notifiedAt: new Date() })
    .where(
      and(
        eq(events.id, eventId),
        or(isNull(events.notifiedAt), lt(events.notifiedAt, new Date(at))),
      ),
    )
    .returning({ id: events.id });

  return Boolean(row);
}

/**
 * REQUIREMENTS.md § 16.3. The thresholds this occurrence has crossed and has not yet run out
 * of time on.
 *
 * WARN: A threshold already behind when the event was written never fires. Without that
 * guard an event added an hour before it starts raises all three banners at once, every one
 * of them being both past and before the start. The creation instant is the id itself
 * (§ 6.), so this costs no column.
 */
function toDueThresholds(occurrence: EventOccurrence, now: number): Threshold[] {
  const startsAt = Date.parse(occurrence.startsAt);

  if (startsAt <= now) {
    return [];
  }

  const createdAt = idToDate(occurrence.event.id).getTime();

  return toThresholds(occurrence, startsAt)
    .filter(({ lead, at }) => at <= now && at >= createdAt && !isSkippedLead(occurrence, lead))
    .sort((left, right) => right.at - left.at);
}

// INFO: REQUIREMENTS.md § 16.3. A weekly event's 7일 전 is the previous occurrence's own start — a banner at the moment the last one began.
function isSkippedLead(occurrence: EventOccurrence, lead: ReminderLead): boolean {
  return lead === "d7" && occurrence.event.recurrence === "weekly";
}

function toThresholds(occurrence: EventOccurrence, startsAt: number): Threshold[] {
  if (occurrence.event.allDay) {
    const dayKey = toDayKey(occurrence.startsAt);

    return [
      { lead: "d7", at: noticeInstant(shiftDayKey(dayKey, -7)) },
      { lead: "d1", at: noticeInstant(shiftDayKey(dayKey, -1)) },
    ];
  }

  return [
    { lead: "d7", at: startsAt - 7 * A_DAY },
    { lead: "d1", at: startsAt - A_DAY },
    { lead: "h2", at: startsAt - 2 * AN_HOUR },
  ];
}

function noticeInstant(dayKey: string): number {
  return Date.parse(`${dayKey}T${ALL_DAY_NOTICE_HOUR}:00:00${TIME_ZONE_OFFSET}`);
}

// INFO: REQUIREMENTS.md § 16.3. An all-day row has no `h2`, so its last notice is the 09:00 one the day before.
function isFinalLead(occurrence: EventOccurrence, lead: ReminderLead): boolean {
  return lead === (occurrence.event.allDay ? "d1" : "h2");
}

/** REQUIREMENTS.md § 11.5. `mine` is a note to self, so only its author hears about it. */
function isRecipient(occurrence: EventOccurrence, userId: UserId): boolean {
  return occurrence.event.scope === "shared" || occurrence.event.createdBy === userId;
}

/**
 * The banner's second line — when the event happens, as a phrase rather than a sentence.
 *
 * WARN: `h2` counts the real remaining time rather than saying two hours. A scheduled run
 * arrives late and is sometimes skipped (§ 12.4.), so the gap is routinely 2시간 10분 or
 * 1시간 54분 and a fixed figure would simply be wrong. The start time rides along because a
 * countdown is stale the moment the banner is left unread, where a clock time is not.
 *
 * WARN: `d7` names the date and never `7일 뒤`. A notification is a point-in-time artifact
 * (§ 16.1.) read whenever the reader gets to it, and a countdown baked into one goes on
 * reading `7일 뒤` a week later.
 */
function toBody(occurrence: EventOccurrence, lead: ReminderLead, now: number): string {
  const day = toDay(occurrence.startsAt, now);

  if (occurrence.event.allDay) {
    return `${day} · 종일`;
  }

  if (lead === "h2") {
    return `${formatTimeLeft(Date.parse(occurrence.startsAt) - now)} 후 · ${formatTime(occurrence.startsAt)}`;
  }

  return `${day} ${formatTime(occurrence.startsAt)}`;
}

/**
 * WARN: Derived from the two dates and NEVER from which threshold fired. A late `d1` — the
 * runner delayed past midnight (§ 12.4.) — is sent on the event's own day, and a label taken
 * from the lead would announce an event opening this evening as 내일.
 *
 * INFO: Anything past tomorrow names its date rather than counting, for the reason in
 * `toBody` — this line is read whenever the reader gets to it.
 */
function toDay(startsAt: string, now: number): string {
  const startDayKey = toDayKey(startsAt);

  if (startDayKey === toDayKey(now)) {
    return "오늘";
  }

  return startDayKey === toDayKey(now + A_DAY) ? "내일" : formatMonthDay(startsAt);
}

// WARN: Minutes are floored, never rounded — 1시간 59분 30초 rounds up to `1시간 60분`.
function formatTimeLeft(left: number): string {
  const hours = Math.floor(left / AN_HOUR);
  const minutes = Math.floor((left - hours * AN_HOUR) / A_MINUTE);

  if (hours === 0) {
    return `${minutes}분`;
  }

  return minutes === 0 ? `${hours}시간` : `${hours}시간 ${minutes}분`;
}
