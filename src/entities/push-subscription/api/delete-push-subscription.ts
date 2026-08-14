import type { UserId } from "@/shared/lib";
import "server-only";

import { getDb, pushSubscriptions } from "@/shared/db";
import { and, eq } from "drizzle-orm";

/**
 * Matched on `endpoint`, and on `userId` too whenever the caller has one. The
 * delete runs both from a user turning the toggle off and from a `410 Gone` on a
 * send; only the second is sessionless, and it is the push service — not a
 * request — that named the endpoint there.
 */
export async function deletePushSubscription(endpoint: string, userId?: UserId): Promise<void> {
  await getDb()
    .delete(pushSubscriptions)
    .where(
      userId
        ? and(eq(pushSubscriptions.endpoint, endpoint), eq(pushSubscriptions.userId, userId))
        : eq(pushSubscriptions.endpoint, endpoint),
    );
}
