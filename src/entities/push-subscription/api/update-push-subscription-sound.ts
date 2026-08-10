import "server-only";

import { getDb, pushSubscriptions } from "@/shared/db";
import { and, eq } from "drizzle-orm";

export type UpdatePushSubscriptionSoundParams = {
  userId: string;
  endpoint: string;
  soundEnabled: boolean;
};

/**
 * Stores 알림 소리 for one installation (`REQUIREMENTS.md § 16.1.`) and reports
 * whether a row of the caller's was there to store it on.
 *
 * WARN: Scoped to `userId` as well as `endpoint`, for `deletePushSubscription`'s
 * reason — this path has a session, and nothing else stops one participant from
 * silencing the other's device by naming its endpoint.
 */
export async function updatePushSubscriptionSound({
  userId,
  endpoint,
  soundEnabled,
}: UpdatePushSubscriptionSoundParams): Promise<boolean> {
  const updated = await getDb()
    .update(pushSubscriptions)
    .set({ soundEnabled })
    .where(and(eq(pushSubscriptions.endpoint, endpoint), eq(pushSubscriptions.userId, userId)))
    .returning({ endpoint: pushSubscriptions.endpoint });

  return updated.length > 0;
}
