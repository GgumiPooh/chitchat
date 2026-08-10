import "server-only";

import { countUnreadMessages, isMessageUnreadBy } from "@/entities/message";
import { pushToUser, type PushPayload } from "@/entities/push-subscription";
import { CHAT_ROUTE, DELETED_MESSAGE_TEXT } from "@/shared/config";
import type { User } from "@/shared/db";
import { resolveNotificationTargets } from "./notification-targets";

/**
 * REQUIREMENTS.md § 16.1. Replaces a standing banner for a message that has just
 * been withdrawn (§ 8.13.), so Notification Center stops holding text the room no
 * longer shows.
 *
 * INFO: A replacement rather than a removal, because § 16.1. requires every push to end in a visible banner — `handlePush` collapses this one onto the old one by itself, so `sw.js` needs nothing for it.
 *
 * WARN: The caller is responsible for running this inside `after()`, and for calling it only once `deleteMessage` reported success — the unread gate below cannot tell a refused delete from a completed one.
 */
export async function notifyMessageRetraction(sender: User, messageId: number) {
  const { title, recipients } = await resolveNotificationTargets(sender);

  await Promise.all(
    recipients.map(async (recipient) => {
      // WARN: § 16.1. Without this gate a recipient who already read the message gets a banner *manufactured* for one they have seen and dismissed — worse than the stale text this exists to clear.
      if (!(await isMessageUnreadBy(messageId, recipient.id))) {
        return;
      }

      const payload: PushPayload = {
        title,
        body: DELETED_MESSAGE_TEXT,
        // INFO: § 8.8. The withdrawal lowers the count, and on a shut client this push is the only thing that moves the app-icon badge.
        unreadCount: await countUnreadMessages(recipient.id),
        url: CHAT_ROUTE,
        // INFO: § 16.1. Silent whatever the device's 알림 소리 is — a retraction is a correction, not news, and nothing may alert twice for one event.
        silent: true,
      };

      await pushToUser(recipient.id, payload);
    }),
  );
}
