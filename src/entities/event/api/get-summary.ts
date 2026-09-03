import "server-only";

import { MAX_UPCOMING_EVENTS } from "@/shared/config";
import { coupleSettings, getDb } from "@/shared/db";
import { countDays, findNextMilestone, MILESTONE_HORIZON_DAYS, toDayKey } from "@/shared/lib";
import { cache } from "react";
import type { CalendarSummary } from "../model/types";
import { listUpcomingOccurrences } from "./list-events";

// INFO: REQUIREMENTS.md § 11.1. The one `couple_settings` row's date and login-order columns, read once per request.
const readCoupleSettings = cache(async () => {
  const [row] = await getDb()
    .select({
      startDate: coupleSettings.startDate,
      firstUserId: coupleSettings.firstUserId,
      secondUserId: coupleSettings.secondUserId,
    })
    .from(coupleSettings)
    .limit(1);

  return row;
});

/** REQUIREMENTS.md § 11.1. `couple_settings.start_date`, seeded once and never edited from a screen. */
export async function getRelationshipStartDate(): Promise<string> {
  return (await readCoupleSettings()).startDate;
}

/**
 * REQUIREMENTS.md § 11.1. Everything above the month grid.
 *
 * INFO: `upcomingLimit` is the only part callers vary — REQUIREMENTS.md § 11.5.1.'s
 * panel pages through more than the card's three, and asks for one past what it draws
 * so it knows whether a 더 보기 exists at all.
 *
 * WARN: `todayKey` is resolved **here**, on the server, and shipped to the client
 * rather than recomputed there. A device whose clock or timezone is off would
 * otherwise show the two users different day counts for the same day.
 */
export async function getCalendarSummary(
  upcomingLimit: number = MAX_UPCOMING_EVENTS,
): Promise<CalendarSummary> {
  const settings = await readCoupleSettings();
  const todayKey = toDayKey(Date.now());

  return {
    startDate: settings.startDate,
    firstUserId: settings.firstUserId,
    secondUserId: settings.secondUserId,
    todayKey,
    // INFO: § 11.1. The Korean convention counts the start date itself as day 1, which is the `+ 1`.
    dayCount: countDays(settings.startDate, todayKey) + 1,
    nextMilestone: findNextMilestone(settings.startDate, todayKey, MILESTONE_HORIZON_DAYS),
    upcoming: await listUpcomingOccurrences(todayKey, upcomingLimit),
  };
}
