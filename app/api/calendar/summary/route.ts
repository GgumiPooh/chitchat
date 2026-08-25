import { getCalendarSummary } from "@/entities/event";
import { apiError } from "@/shared/api";
import { getCurrentUser } from "@/shared/auth";
import { MAX_UPCOMING_EVENTS } from "@/shared/config";
import { NextResponse } from "next/server";
import { z } from "zod";

// INFO: REQUIREMENTS.md § 11.5.1. Clamped rather than validated into a 400 — the parameter only widens a summary the caller was getting anyway, so a nonsense one falls back to the card's own count.
const upcomingSchema = z.coerce.number().int().min(1).catch(MAX_UPCOMING_EVENTS);

/**
 * REQUIREMENTS.md § 11.1. The D-day band, refetched when the tab regains focus so
 * an app left open across midnight corrects itself.
 *
 * INFO: The whole band in one response — the day count, the next milestone, and
 * the upcoming card all go stale at the same instant, so splitting them would be
 * three requests that always fire together.
 */
export async function GET(request: Request) {
  const user = await getCurrentUser();

  if (!user) {
    return apiError("unauthorized");
  }

  const upcoming = upcomingSchema.parse(new URL(request.url).searchParams.get("upcoming"));

  return NextResponse.json({ summary: await getCalendarSummary(upcoming) });
}
