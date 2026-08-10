import "server-only";

import { getDb, pushSubscriptions } from "@/shared/db";
import type { PushSubscriptionInput, SavedPushSubscription } from "../model/types";

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
}: SavePushSubscriptionParams): Promise<SavedPushSubscription> {
  const [saved] = await getDb()
    .insert(pushSubscriptions)
    .values({ userId, endpoint, p256dh, auth, userAgent })
    // WARN: `userId` is part of the update on purpose. Two accounts can share one browser, and the endpoint follows the installation rather than the person — without this the row keeps pushing the new session's messages to the previous account.
    // WARN: `soundEnabled` is deliberately absent. It is the one column the client does not send, so listing it here would reset 알림 소리 to the column default on every launch (`REQUIREMENTS.md § 16.1.`).
    .onConflictDoUpdate({
      target: pushSubscriptions.endpoint,
      set: { userId, p256dh, auth, userAgent },
    })
    .returning({ soundEnabled: pushSubscriptions.soundEnabled });

  // INFO: REQUIREMENTS.md § 16.1. The launch sync is the only moment the server can tell a device what its own preference is — the settings screen is rendered per account and cannot know which installation is reading it.
  return { soundEnabled: saved?.soundEnabled ?? true };
}
