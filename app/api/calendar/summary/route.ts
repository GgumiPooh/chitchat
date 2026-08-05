import { getCalendarSummary } from "@/entities/event";
import { getCurrentUser } from "@/shared/auth";
import { NextResponse } from "next/server";

/**
 * REQUIREMENTS.md § 11.1. The D-day band, refetched when the tab regains focus so
 * an app left open across midnight corrects itself.
 *
 * INFO: The whole band in one response — the day count, the next milestone, and
 * the upcoming card all go stale at the same instant, so splitting them would be
 * three requests that always fire together.
 */
export async function GET() {
  const user = await getCurrentUser();

  if (!user) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  return NextResponse.json({ summary: await getCalendarSummary() });
}
