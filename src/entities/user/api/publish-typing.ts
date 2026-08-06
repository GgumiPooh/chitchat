import "server-only";

import { typingEventSchema } from "@/shared/config";
import { notifyChannel, TYPING_CHANNEL } from "@/shared/db";

/**
 * REQUIREMENTS.md § 8.12. Announces that this user has started or stopped
 * composing. Nothing is written and nothing is read back — a client that hears it
 * has everything the indicator needs.
 *
 * WARN: The payload carries no expiry. A deadline computed here is on the
 * sender's clock, and two devices that disagree by a few seconds would leave the
 * indicator up long after the typing stopped; the receiver stamps its own
 * (§ 8.12.).
 */
export async function publishTyping(userId: string, isTyping: boolean): Promise<void> {
  await notifyChannel(
    TYPING_CHANNEL,
    JSON.stringify(typingEventSchema.parse({ userId, isTyping })),
  );
}
