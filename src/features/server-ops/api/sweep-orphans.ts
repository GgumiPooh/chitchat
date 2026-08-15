import { request } from "@/shared/api";
import { OPS_CLEANUP_PATH } from "@/shared/config";
import { OpsRequestError } from "../model/ops-error";
import type { CleanupReport } from "../model/types";

/**
 * REQUIREMENTS.md § 12.4. Sweeps R2 for objects no live `media` row can name.
 *
 * WARN: `dryRun` is the screen's own decision and is always sent. jandh-ops defaults it
 * to `true`, so an omitted flag previews — which is the safe direction, and the reason
 * the deleting call has to be explicit at both ends.
 */
export async function sweepOrphans(dryRun: boolean): Promise<CleanupReport> {
  const response = await request(OPS_CLEANUP_PATH, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ dryRun }),
  });

  if (!response.ok) {
    throw new OpsRequestError("POST", OPS_CLEANUP_PATH, response.status);
  }

  return (await response.json()) as CleanupReport;
}
