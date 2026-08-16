import { apiError } from "@/shared/api";
import { getCurrentUser } from "@/shared/auth";
import {
  dispatchOpsWorkflow,
  isOpsDispatchConfigured,
  OPS_PURGE_WORKFLOW,
  toDispatchErrorCode,
} from "@/shared/ops";
import { NextResponse } from "next/server";
import { z } from "zod";

/**
 * REQUIREMENTS.md § 9., § 12.4. Asks for the reclaim now rather than at the next interval.
 *
 * INFO: A preview, but no confirmation — the two are different questions. `dryRun` counts
 * what a run would take, which is worth knowing before spending one; a confirmation would be
 * ceremony, since every row here is one the database has ALREADY marked deleted and the
 * ten-minute schedule would have taken it shortly anyway.
 *
 * WARN: 202, and the run notifies. A hand-started reclaim has somebody waiting on it, which
 * is exactly why the workflow turns its push on for a dispatch and leaves it off for the
 * schedule — see `ops-purge.yml`.
 */
// INFO: Bodyless is a preview, matching the sweep — the deleting call is explicit at both ends.
const bodySchema = z.object({ dryRun: z.boolean() }).partial();

export async function POST(request: Request) {
  const requester = await getCurrentUser();

  if (!requester) {
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

  /**
   * WARN: The requester's own address, not the deployment default. 서버 관리 is reachable
   * by BOTH allowlisted accounts and the modal promises the result by notification, so a
   * fixed recipient answers on the other person's phone and leaves the presser with nothing.
   */
  try {
    await dispatchOpsWorkflow(OPS_PURGE_WORKFLOW, {
      "dry-run": String(dryRun),
      "notify-email": requester.email,
    });

    return NextResponse.json({ accepted: true, dryRun }, { status: 202 });
  } catch (error) {
    return apiError(toDispatchErrorCode(error));
  }
}
