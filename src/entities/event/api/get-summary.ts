import "server-only";

import { ensureEnv, MAX_UPCOMING_EVENTS } from "@/shared/config";
import { countDays, findNextMilestone, MILESTONE_HORIZON_DAYS, toDayKey } from "@/shared/lib";
import type { CalendarSummary } from "../model/types";
import { listUpcomingOccurrences } from "./list-events";

/**
 * REQUIREMENTS.md § 11.1. The relationship start date is an environment variable,
 * deliberately not a row — it is configuration of this one deployment, and there
 * is no screen that would ever edit it.
 */
export function getRelationshipStartDate(): string {
  return ensureEnv("RELATIONSHIP_START_DATE");
}

/**
 * REQUIREMENTS.md § 11.1. Everything above the month grid.
 *
 * WARN: `todayKey` is resolved **here**, on the server, and shipped to the client
 * rather than recomputed there. A device whose clock or timezone is off would
 * otherwise show the two users different day counts for the same day.
 */
export async function getCalendarSummary(): Promise<CalendarSummary> {
  const startDate = getRelationshipStartDate();
  const todayKey = toDayKey(Date.now());

  return {
    startDate,
    todayKey,
    // INFO: § 11.1. The Korean convention counts the start date itself as day 1, which is the `+ 1`.
    dayCount: countDays(startDate, todayKey) + 1,
    nextMilestone: findNextMilestone(startDate, todayKey, MILESTONE_HORIZON_DAYS),
    upcoming: await listUpcomingOccurrences(todayKey, MAX_UPCOMING_EVENTS),
  };
}
