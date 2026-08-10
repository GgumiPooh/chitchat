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
      soundEnabled: pushSubscriptions.soundEnabled,
    })
    .from(pushSubscriptions)
    .where(eq(pushSubscriptions.userId, userId));

  if (targets.length === 0) {
    return;
  }

  // INFO: REQUIREMENTS.md § 16.1. Serialized per row rather than once, because 알림 소리 belongs to the installation — the same message can sound on the phone and land silently on the laptop.
  // INFO: Two bodies at most however many devices answer, so they are built once and picked per row rather than serialized inside the fan-out.
  const audible = JSON.stringify({ ...payload, silent: false });
  const muted = JSON.stringify({ ...payload, silent: true });
  const results = await Promise.all(
    targets.map((target) => sendPush(target, target.soundEnabled ? audible : muted)),
  );
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
