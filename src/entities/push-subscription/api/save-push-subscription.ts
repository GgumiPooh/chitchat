import "server-only";

import { getDb, pushSubscriptions } from "@/shared/db";
import type { PushSubscriptionInput } from "../model/types";

export type SavePushSubscriptionParams = PushSubscriptionInput & {
  userId: string;
};

/**
 * Idempotent on `endpoint`, which is what makes re-registration safe: the client
 * re-saves on every launch (`REQUIREMENTS.md § 16.1.`), and a browser hands back
 * the endpoint it already has.
 */
export async function savePushSubscription({
  userId,
  endpoint,
  p256dh,
  auth,
  userAgent,
}: SavePushSubscriptionParams): Promise<void> {
  await getDb()
    .insert(pushSubscriptions)
    .values({ userId, endpoint, p256dh, auth, userAgent })
    // WARN: `userId` is part of the update on purpose. Two accounts can share one browser, and the endpoint follows the installation rather than the person — without this the row keeps pushing the new session's messages to the previous account.
    .onConflictDoUpdate({
      target: pushSubscriptions.endpoint,
      set: { userId, p256dh, auth, userAgent },
    });
}
