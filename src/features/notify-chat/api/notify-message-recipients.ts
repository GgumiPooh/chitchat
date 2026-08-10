import "server-only";

import { countUnreadMessages } from "@/entities/message";
import { pushToUser, type PushPayload } from "@/entities/push-subscription";
import { CHAT_ROUTE, PUSH_BODY_MAX_LENGTH } from "@/shared/config";
import type { User } from "@/shared/db";
import { resolveNotificationTargets } from "./notification-targets";

/**
 * REQUIREMENTS.md § 16.1. One banner per recipient device, carrying that
 * recipient's own unread count for the app icon badge (§ 8.8.).
 *
 * INFO: A slice of its own rather than a helper beside `POST /api/messages`,
 * because the calendar writes messages too (§ 11.5.) and § 16.1. insists there is
 * exactly **one** alerting channel — a second fan-out written next to the event
 * routes is how that stops being true.
 *
 * WARN: The caller is responsible for running this inside `after()`. It makes a
 * round trip per device to the push services, and none of that may sit between a
 * user's request and its response.
 */
export async function notifyMessageRecipients(sender: User, body: string) {
  const { title, recipients } = await resolveNotificationTargets(sender);

  await Promise.all(
    recipients.map(async (recipient) => {
      const payload: PushPayload = {
        title,
        body: body.slice(0, PUSH_BODY_MAX_LENGTH),
        unreadCount: await countUnreadMessages(recipient.id),
        url: CHAT_ROUTE,
      };

      await pushToUser(recipient.id, payload);
    }),
  );
}
