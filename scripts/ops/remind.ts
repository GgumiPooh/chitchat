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
import { and, eq, isNull, lt, or } from "drizzle-orm";
import { notifyOps } from "./notify";
/**
 * WARN: Deep paths, not the slice barrels — see `notify.ts` for why a CLI entry is the one
 * place that rule is paid for rather than honoured.
 */
/* eslint-disable no-restricted-imports */
import { listEventOccurrences } from "../../src/entities/event/api/list-events";
import type { EventOccurrence } from "../../src/entities/event/model/types";
import { countUnreadMessages } from "../../src/entities/message/api/count-unread";
import { pushToUser } from "../../src/entities/push-subscription/api/push-to-user";
/* eslint-enable no-restricted-imports */

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

async function main() {
  const now = Date.now();
  const todayKey = toDayKey(now);
  const occurrences = await listEventOccurrences(todayKey, shiftDayKey(todayKey, HORIZON_DAYS));
  const audience = await getDb().select({ id: users.id }).from(users);
  let sent = 0;

  for (const occurrence of occurrences) {
    // WARN: Latest threshold first, and at most one per run. A backlog — the runner down for a day — otherwise fires 7일 전 and 1일 전 back to back for an event starting tomorrow; taking the most recent due one collapses that into the banner that is actually true.
    for (const { lead, at } of toDueThresholds(occurrence, now)) {
      if (!(await claim(occurrence.event.id, at))) {
        continue;
      }

      const recipients = audience.map(({ id }) => id).filter((id) => isRecipient(occurrence, id));

      // WARN: Contained per occurrence. The claim is already stamped, so a throw here loses THIS banner however it is handled — but an uncaught one also abandons every occurrence after it, turning one bad row into a silent pass that did nothing.
      try {
        await notify(recipients, occurrence, lead, now);
        sent += recipients.length;
      } catch (error) {
        console.error(`[remind] could not notify for ${occurrence.event.id}`, error);
      }

      break;
    }
  }

  console.log(`[remind] ${sent} reminder(s) sent over ${occurrences.length} occurrence(s)`);
}

async function notify(
  recipients: UserId[],
  occurrence: EventOccurrence,
  lead: ReminderLead,
  now: number,
): Promise<void> {
  const body = toBody(occurrence, lead, now);

  for (const userId of recipients) {
    await pushToUser(userId, {
      title: occurrence.event.title,
      body,
      // WARN: Carried because `sw.js` drives `navigator.setAppBadge` from it — a banner sent without one clears the reader's message badge (§ 16.1.).
      unreadCount: await countUnreadMessages(userId),
      url: `${CALENDAR_ROUTE}?${CALENDAR_DAY_PARAM}=${toDayKey(occurrence.startsAt)}`,
    });
  }
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
async function claim(eventId: EventId, at: number): Promise<boolean> {
  const [row] = await getDb()
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
    .filter(({ at }) => at <= now && at >= createdAt)
    .sort((left, right) => right.at - left.at);
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

main().then(
  () => process.exit(0),
  async (error: unknown) => {
    console.error("[remind] failed", error);

    // INFO: § 16.3. The one ops job serving a product feature, so a run that died is the feature not happening — and nothing else would say so. Per-occurrence failures are contained above and do not reach here, which is what keeps this from firing every ten minutes.
    await notifyOps("일정 알림 실패", error instanceof Error ? error.message : String(error));

    process.exit(1);
  },
);
