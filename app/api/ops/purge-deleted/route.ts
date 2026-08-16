import { apiError } from "@/shared/api";
import { getCurrentUser } from "@/shared/auth";
import { dispatchOpsWorkflow, isOpsDispatchConfigured, OPS_PURGE_WORKFLOW } from "@/shared/ops";
import { NextResponse } from "next/server";

/**
 * REQUIREMENTS.md § 9., § 12.4. Asks for the reclaim now rather than at the next interval.
 *
 * INFO: No body and no dry run, unlike the sweep. This pass acts only on rows the database
 * has ALREADY marked deleted, so there is nothing to preview and nothing to decide — the
 * ten-minute schedule would have done the same thing shortly, and this only brings it
 * forward. The confirmation the sweep carries would be ceremony over a no-op.
 *
 * WARN: 202, and the run notifies. A hand-started reclaim has somebody waiting on it, which
 * is exactly why the workflow turns its push on for a dispatch and leaves it off for the
 * schedule — see `ops-purge.yml`.
 */
export async function POST() {
  if (!(await getCurrentUser())) {
    return apiError("unauthorized");
  }

  if (!isOpsDispatchConfigured()) {
    return apiError("unavailable");
  }

  try {
    await dispatchOpsWorkflow(OPS_PURGE_WORKFLOW);

    return NextResponse.json({ accepted: true }, { status: 202 });
  } catch {
    return apiError("upstream_failed");
  }
}
