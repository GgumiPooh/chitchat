import { request } from "@/shared/api";
import { OPS_CLEANUP_PATH } from "@/shared/config";
import { OpsRequestError } from "../model/ops-error";

/**
 * REQUIREMENTS.md § 12.4. Asks for a sweep of R2 for objects no live `media` row can name.
 *
 * WARN: It answers when the run has been QUEUED, not when it has finished — the work happens
 * in a workflow that takes as long as a bucket listing takes, and its push notification is
 * what carries the count. Resolving here is not a result.
 *
 * WARN: `dryRun` is the screen's own decision and is always sent. The workflow defaults it
 * to previewing, so an omitted flag errs safe and the deleting call is explicit at both ends.
 */
export async function sweepOrphans(dryRun: boolean): Promise<void> {
  const response = await request(OPS_CLEANUP_PATH, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ dryRun }),
  });

  if (!response.ok) {
    throw new OpsRequestError("POST", OPS_CLEANUP_PATH, response.status);
  }
}
