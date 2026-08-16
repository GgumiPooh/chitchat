import type { EmoticonItemId, MessageId, UserId } from "@/shared/lib";
import "server-only";

import { getDb, messages } from "@/shared/db";
import { and, eq, isNull } from "drizzle-orm";

/**
 * REQUIREMENTS.md § 8.13. Rewrites a text message's body and stamps `edited_at`,
 * which is what the 수정됨 label reads.
 *
 * INFO: REQUIREMENTS.md § 13. The emoticons are rewritten with the text and never
 * left as they were — the pair is positional, so a correction that removed one of
 * them would leave every id after it standing at the wrong placeholder.
 *
 * Scoped the way `deleteMessage` is, so the `false` return covers "not mine",
 * "not text", "already deleted" and "never existed" without telling the caller
 * which. There is no time limit: an edit is allowed for as long as the row lives.
 */
export async function editMessage(
  id: MessageId,
  senderId: UserId,
  text: string,
  inlineEmoticonItemIds: EmoticonItemId[] = [],
): Promise<boolean> {
  const edited = await getDb()
    .update(messages)
    .set({ text, inlineEmoticonItemIds, editedAt: new Date() })
    .where(
      and(
        eq(messages.id, id),
        eq(messages.senderId, senderId),
        // WARN: REQUIREMENTS.md § 8.13. The `messages_edited_is_text_check` constraint answers for this too, but a violation surfaces as a 500 — narrowing here is what makes a non-text target the same 404 every other miss is.
        eq(messages.type, "text"),
        isNull(messages.deletedAt),
      ),
    )
    .returning({ id: messages.id });

  return edited.length > 0;
}
