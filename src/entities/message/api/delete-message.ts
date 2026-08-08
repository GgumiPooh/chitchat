import "server-only";

import { getDb, messages } from "@/shared/db";
import { and, eq, isNull, ne } from "drizzle-orm";

/**
 * Soft delete. Scoped to the sender, so the `false` return covers "not mine",
 * "not deletable", "already deleted", and "never existed" without telling the
 * caller which.
 */
export async function deleteMessage(id: number, senderId: string): Promise<boolean> {
  const deleted = await getDb()
    .update(messages)
    .set({ deletedAt: new Date() })
    .where(
      and(
        eq(messages.id, id),
        eq(messages.senderId, senderId),
        // WARN: REQUIREMENTS.md § 11.5. A system notice carries the `sender_id` of whoever moved the event, so the scope above does not exclude it — and § 8.13. made that visible: `buildChatRows` routes a system row past the tombstone branch, so a withdrawn one would go on rendering its sentence. It is timeline furniture (DESIGN.md § 6.5.) and nobody's to withdraw.
        ne(messages.type, "system"),
        isNull(messages.deletedAt),
      ),
    )
    .returning({ id: messages.id });

  return deleted.length > 0;
}
