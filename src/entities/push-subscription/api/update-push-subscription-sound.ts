import type { Optional, UserId } from "@/shared/lib";
import "server-only";

import { getDb, pushSubscriptions } from "@/shared/db";
import { and, eq } from "drizzle-orm";

export type UpdatePushSubscriptionSoundParams = {
  userId: UserId;
  endpoint: string;
  soundEnabled?: Optional<boolean>;
  previewEnabled?: Optional<boolean>;
};

/**
 * Stores 알림 소리 and/or 알림 내용 표시 for one installation (`REQUIREMENTS.md § 16.1.`)
 * and reports whether a row of the caller's was there to store it on.
 *
 * WARN: Scoped to `userId` as well as `endpoint`, for `deletePushSubscription`'s
 * reason — this path has a session, and nothing else stops one participant from
 * silencing the other's device by naming its endpoint.
 */
export async function updatePushSubscriptionSound({
  userId,
  endpoint,
  soundEnabled,
  previewEnabled,
}: UpdatePushSubscriptionSoundParams): Promise<boolean> {
  const values: { soundEnabled?: boolean; previewEnabled?: boolean } = {};

  if (soundEnabled !== undefined) {
    values.soundEnabled = soundEnabled;
  }
  if (previewEnabled !== undefined) {
    values.previewEnabled = previewEnabled;
  }

  const updated = await getDb()
    .update(pushSubscriptions)
    .set(values)
    .where(and(eq(pushSubscriptions.endpoint, endpoint), eq(pushSubscriptions.userId, userId)))
    .returning({ endpoint: pushSubscriptions.endpoint });

  return updated.length > 0;
}
