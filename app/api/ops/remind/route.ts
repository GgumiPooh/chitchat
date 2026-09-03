import { remindUpcomingEvents } from "@/features/notify-chat";
import { apiError } from "@/shared/api";
import { isOpsCronConfigured, isOpsCronRequest } from "@/shared/ops";
import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

/**
 * REQUIREMENTS.md § 16.3. Runs one reminder pass, for `infra/remind-worker`'s cron.
 *
 * INFO: A bearer token rather than a session — the caller is a clock, not a person. The proxy already leaves `/api` ungated, so this check is the whole gate.
 * WARN: Synchronous on purpose, never `after`. The Worker's log is the only place a failed pass surfaces, and it can only report a status it waited for.
 */
export async function POST(request: Request) {
  if (!isOpsCronConfigured()) {
    return apiError("unavailable");
  }

  if (!isOpsCronRequest(request)) {
    return apiError("unauthorized");
  }

  const report = await remindUpcomingEvents();

  console.log(`[remind] ${report.sent} reminder(s) sent over ${report.occurrences} occurrence(s)`);

  return NextResponse.json(report);
}
