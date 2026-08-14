import type { UserId } from "@/shared/lib";
import "server-only";

import { getDb, pushSubscriptions } from "@/shared/db";
import { A_DAY } from "@/shared/lib";
import { sendPush } from "@/shared/push";
import { eq, inArray } from "drizzle-orm";
import type { PushPayload } from "../model/types";

// INFO: REQUIREMENTS.md § 16.1. Long on purpose — a device opened four times a year is exactly what push exists for, and the prune is self-healing anyway.
const ABANDONED_AFTER = 90 * A_DAY;

/**
 * Fans one payload out to every device a user has registered, then prunes the
 * ones the push service has retired and the ones nobody opens any more
 * (`REQUIREMENTS.md § 16.1.`).
 *
 * Never throws. It runs in `after()` on the send path, where a rejection would
 * surface as an unhandled invocation failure long after the sender got their 201.
 */
export async function pushToUser(userId: UserId, payload: PushPayload): Promise<void> {
  const db = getDb();
  const targets = await db
    .select({
      endpoint: pushSubscriptions.endpoint,
      p256dh: pushSubscriptions.p256dh,
      auth: pushSubscriptions.auth,
      soundEnabled: pushSubscriptions.soundEnabled,
      lastSeenAt: pushSubscriptions.lastSeenAt,
    })
    .from(pushSubscriptions)
    .where(eq(pushSubscriptions.userId, userId));

  if (targets.length === 0) {
    return;
  }

  // WARN: Partitioned here rather than filtered in the WHERE clause. The abandoned rows are the ones to delete, so a query that excluded them would leave nothing holding their endpoints.
  const abandonedBefore = Date.now() - ABANDONED_AFTER;
  const live = targets.filter((target) => target.lastSeenAt.getTime() > abandonedBefore);
  const abandoned = targets
    .filter((target) => target.lastSeenAt.getTime() <= abandonedBefore)
    .map((target) => target.endpoint);

  // INFO: REQUIREMENTS.md § 16.1. Serialized per row rather than once, because 알림 소리 belongs to the installation — the same message can sound on the phone and land silently on the laptop.
  // INFO: Two bodies at most however many devices answer, so they are built once and picked per row rather than serialized inside the fan-out.
  const audible = JSON.stringify({ ...payload, silent: false });
  const muted = JSON.stringify({ ...payload, silent: true });
  const results = await Promise.all(
    live.map((target) => sendPush(target, target.soundEnabled ? audible : muted)),
  );
  const retired = live
    .filter((_, index) => results[index] === "gone")
    .map((target) => target.endpoint);
  const delivered = live
    .filter((_, index) => results[index] === "sent")
    .map((target) => target.endpoint);

  // INFO: Two statements rather than a per-row loop — a pair of users owns a handful of devices, and both sets are usually empty or whole.
  // INFO: The two removals are one statement because they mean the same thing to this table: an endpoint that will never raise a banner again.
  const removed = [...retired, ...abandoned];

  if (removed.length > 0) {
    await db.delete(pushSubscriptions).where(inArray(pushSubscriptions.endpoint, removed));
  }
  if (delivered.length > 0) {
    await db
      .update(pushSubscriptions)
      .set({ lastSuccessAt: new Date() })
      .where(inArray(pushSubscriptions.endpoint, delivered));
  }
}
