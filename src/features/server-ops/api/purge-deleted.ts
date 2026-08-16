import { request } from "@/shared/api";
import { OPS_PURGE_PATH } from "@/shared/config";
import { OpsRequestError } from "../model/ops-error";

/**
 * REQUIREMENTS.md § 9., § 12.4. Asks for the reclaim of bytes behind rows already deleted.
 *
 * WARN: It answers when the run has been QUEUED, not when the bytes are gone. Unlike the
 * other two, a hand-started reclaim always pushes its result — nobody would otherwise learn
 * what it found.
 *
 * WARN: `dryRun` is always sent, as the sweep's is. The route previews on an omitted flag,
 * so the reclaiming call is explicit at both ends.
 */
export async function purgeDeleted(dryRun: boolean): Promise<void> {
  const response = await request(OPS_PURGE_PATH, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ dryRun }),
  });

  if (!response.ok) {
    throw new OpsRequestError("POST", OPS_PURGE_PATH, response.status);
  }
}
