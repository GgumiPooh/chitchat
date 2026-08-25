import type { MessageId } from "@/shared/lib";
import "server-only";

import { getDb, messages } from "@/shared/db";
import { and, eq, isNull, or, sql } from "drizzle-orm";

/**
 * REQUIREMENTS.md § 8.17. Folds a message away, or unfolds it — for **either**
 * participant, since folding curates the shared timeline rather than changing what
 * the message says (§ 8.13.'s doctrine, and the one act on a bubble that crosses it).
 *
 * Scoped the way `deleteMessage` is but without the sender, so the `false` return
 * covers "not prose", "already deleted" and "never existed" alike.
 *
 * WARN: The write is skipped where the row already reads that way — `collapsed_at`
 * is on § 8.13.'s trigger, so a no-op UPDATE would publish a change every client
 * then re-renders for nothing.
 */
export async function collapseMessage(id: MessageId, isCollapsed: boolean): Promise<boolean> {
  const changed = await getDb()
    .update(messages)
    .set({ collapsedAt: isCollapsed ? new Date() : null })
    .where(
      and(
        eq(messages.id, id),
        // WARN: `messages_collapsed_is_prose_check` answers for this too, but a violation surfaces as a 500 — narrowing here is what makes a photo bubble the same 404 every other miss is.
        or(eq(messages.type, "text"), sql`"system_action"::text = 'assistant_reply'`),
        isNull(messages.deletedAt),
        isCollapsed ? isNull(messages.collapsedAt) : sql`"collapsed_at" IS NOT NULL`,
      ),
    )
    .returning({ id: messages.id });

  return changed.length > 0;
}
