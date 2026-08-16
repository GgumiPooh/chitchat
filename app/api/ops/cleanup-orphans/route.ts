import { apiError } from "@/shared/api";
import { getCurrentUser } from "@/shared/auth";
import { dispatchOpsWorkflow, isOpsDispatchConfigured, OPS_SWEEP_WORKFLOW } from "@/shared/ops";
import { NextResponse } from "next/server";
import { z } from "zod";

// INFO: Dry-run is the default on both sides, so an omitted flag — and a bodyless POST — previews rather than deleting.
const bodySchema = z.object({ dryRun: z.boolean() }).partial();

/**
 * REQUIREMENTS.md § 12.4. Asks for an orphan sweep and answers 202 once GitHub has queued it.
 *
 * WARN: The sweep has no copy in this app — it subtracts the database from a whole bucket
 * listing — so this starts the same workflow the 04:30 schedule does. It does not wait: the
 * screen says 요청했어요 and the run's push notification carries the count.
 */
export async function POST(request: Request) {
  if (!(await getCurrentUser())) {
    return apiError("unauthorized");
  }

  if (!isOpsDispatchConfigured()) {
    return apiError("unavailable");
  }

  const body = bodySchema.safeParse(await request.json().catch(() => ({})));

  if (!body.success) {
    return apiError("invalid_request");
  }

  const dryRun = body.data.dryRun !== false;

  try {
    // WARN: A string, whatever the workflow declares the input as — GitHub refuses a JSON boolean here.
    await dispatchOpsWorkflow(OPS_SWEEP_WORKFLOW, { "dry-run": String(dryRun) });

    return NextResponse.json({ accepted: true, dryRun }, { status: 202 });
  } catch {
    return apiError("upstream_failed");
  }
}
