import "server-only";

import { getDb, pushSubscriptions } from "@/shared/db";
import { sendPush } from "@/shared/push";
import { eq, inArray } from "drizzle-orm";
import type { PushPayload } from "../model/types";

/**
 * Fans one payload out to every device a user has registered, then prunes the
 * ones the push service has retired (`REQUIREMENTS.md § 16.1.`).
 *
 * Never throws. It runs in `after()` on the send path, where a rejection would
 * surface as an unhandled invocation failure long after the sender got their 201.
 */
export async function pushToUser(userId: string, payload: PushPayload): Promise<void> {
  const db = getDb();
  const targets = await db
    .select({
      endpoint: pushSubscriptions.endpoint,
      p256dh: pushSubscriptions.p256dh,
      auth: pushSubscriptions.auth,
    })
    .from(pushSubscriptions)
    .where(eq(pushSubscriptions.userId, userId));

  if (targets.length === 0) {
    return;
  }

  const body = JSON.stringify(payload);
  const results = await Promise.all(targets.map((target) => sendPush(target, body)));
  const retired = targets
    .filter((_, index) => results[index] === "gone")
    .map((target) => target.endpoint);
  const delivered = targets
    .filter((_, index) => results[index] === "sent")
    .map((target) => target.endpoint);

  // INFO: Two statements rather than a per-row loop — a pair of users owns a handful of devices, and both sets are usually empty or whole.
  if (retired.length > 0) {
    await db.delete(pushSubscriptions).where(inArray(pushSubscriptions.endpoint, retired));
  }
  if (delivered.length > 0) {
    await db
      .update(pushSubscriptions)
      .set({ lastSuccessAt: new Date() })
      .where(inArray(pushSubscriptions.endpoint, delivered));
  }
}
