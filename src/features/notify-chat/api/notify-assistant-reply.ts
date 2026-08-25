import "server-only";

import { countUnreadMessages, type ChatMessage } from "@/entities/message";
import { pushToUser, type PushPayload } from "@/entities/push-subscription";
import { listUsers } from "@/entities/user";
import {
  CHAT_ROUTE,
  PUSH_BODY_MAX_LENGTH,
  toLlmProviderBranding,
  toMessageSummary,
} from "@/shared/config";
import type { UserId } from "@/shared/lib";

/**
 * REQUIREMENTS.md § 8.15., § 16.1. An assistant reply's own fan-out — separate
 * from `notifyMessageRecipients` because its "everyone but the sender" rule
 * does not apply: `sender_id` is the asker, who still needs a banner for an
 * answer that may have finished after they left the app.
 *
 * INFO: 조용히 보내기 narrows this to the asker alone, never to nobody — the asker
 * asked and is owed the answer regardless of the toggle.
 */
export async function notifyAssistantReply(
  message: ChatMessage,
  askerId: UserId,
  isSilent: boolean,
) {
  const branding = toLlmProviderBranding(message.llmProvider);
  const recipients = isSilent
    ? [askerId]
    : (await listUsers()).map((participant) => participant.id);

  await Promise.all(
    recipients.map(async (recipientId) => {
      const payload: PushPayload = {
        title: branding.name,
        body: toMessageSummary(message.text ?? "").slice(0, PUSH_BODY_MAX_LENGTH),
        unreadCount: await countUnreadMessages(recipientId),
        url: CHAT_ROUTE,
      };

      await pushToUser(recipientId, payload);
    }),
  );
}
