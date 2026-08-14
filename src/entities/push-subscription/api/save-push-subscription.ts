import type { PushSubscriptionId, SessionId, UserId } from "@/shared/lib";
import "server-only";

import { getDb, nextSnowflake, pushSubscriptions } from "@/shared/db";
import type { PushSubscriptionInput, SavedPushSubscription } from "../model/types";

export type SavePushSubscriptionParams = PushSubscriptionInput & {
  userId: UserId;
  sessionId: SessionId;
};

/**
 * Idempotent on `endpoint`, which is what makes re-registration safe: the client
 * re-saves on every launch (`REQUIREMENTS.md § 16.1.`), and a browser hands back
 * the endpoint it already has.
 */
export async function savePushSubscription({
  userId,
  sessionId,
  endpoint,
  p256dh,
  auth,
  userAgent,
}: SavePushSubscriptionParams): Promise<SavedPushSubscription> {
  const [saved] = await getDb()
    .insert(pushSubscriptions)
    .values({
      id: nextSnowflake<PushSubscriptionId>(),
      userId,
      sessionId,
      endpoint,
      p256dh,
      auth,
      userAgent,
    })
    // WARN: `userId` is part of the update on purpose. Two accounts can share one browser, and the endpoint follows the installation rather than the person — without this the row keeps pushing the new session's messages to the previous account.
    // WARN: `soundEnabled` is deliberately absent. It is the one column the client does not send, so listing it here would reset 알림 소리 to the column default on every launch (`REQUIREMENTS.md § 16.1.`).
    // INFO: `lastSeenAt` is the abandonment lease (`REQUIREMENTS.md § 16.1.`), and this upsert is the only thing that renews it — one launch of the app on this installation.
    .onConflictDoUpdate({
      target: pushSubscriptions.endpoint,
      // WARN: `sessionId` follows the launch for `userId`'s reason and one more of its own — a re-login mints a new session, and a row left pointing at the old one is revoked by a 로그아웃 the user aimed at a device they are no longer signed in on.
      set: { userId, sessionId, p256dh, auth, userAgent, lastSeenAt: new Date() },
    })
    .returning({ soundEnabled: pushSubscriptions.soundEnabled });

  // INFO: REQUIREMENTS.md § 16.1. The launch sync is the only moment the server can tell a device what its own preference is — the settings screen is rendered per account and cannot know which installation is reading it.
  return { soundEnabled: saved?.soundEnabled ?? true };
}
