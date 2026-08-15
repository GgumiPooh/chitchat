import type { MessageId, UserId } from "@/shared/lib";
import "server-only";

import { getDb, media, messageMedia, messages } from "@/shared/db";
import { and, eq, inArray, isNull, ne, notExists, sql } from "drizzle-orm";

/**
 * Soft delete. Scoped to the sender, so the `false` return covers "not mine",
 * "not deletable", "already deleted", and "never existed" without telling the
 * caller which.
 *
 * WARN: REQUIREMENTS.md § 18. #1. The media the bubble carried is soft-deleted with it.
 * A live message is the whole of 보관함 membership, so a withdrawn one already takes its
 * photos off the shelf — without this the rows would simply stop being reachable while
 * still claiming to be live, which is a state nothing can find again and nothing can
 * clean up. Stamping them is what keeps the table honest about what it holds.
 *
 * WARN: The R2 objects are deliberately **left**. Stamping `deleted_at` costs nothing and
 * is undone by clearing it; deleting the bytes is final, and withdrawing a message is the
 * sender's own act where destroying a shared object belongs to both (§ 18. #1.). The
 * objects are swept separately, against `deleted_at IS NOT NULL`.
 */
export async function deleteMessage(id: MessageId, senderId: UserId): Promise<boolean> {
  return await getDb().transaction(async (tx) => {
    const deleted = await tx
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

    if (deleted.length === 0) {
      return false;
    }

    const carried = await tx
      .select({ mediaId: messageMedia.mediaId })
      .from(messageMedia)
      .where(eq(messageMedia.messageId, id));

    if (carried.length > 0) {
      await tx
        .update(media)
        .set({ deletedAt: new Date() })
        .where(
          and(
            inArray(
              media.id,
              carried.map((row) => row.mediaId),
            ),
            isNull(media.deletedAt),
            // WARN: `media_id` carries no unique index (§ 6.), so one object may hang off more than one bubble. Nothing in the app produces that today — there is no forward, and 배경으로 설정 copies (§ 12.1.) — but the schema allows it, and without this a second bubble would go on rendering a row marked deleted.
            isNotCarriedElsewhere(id),
          ),
        );
    }

    return true;
  });
}

// INFO: Correlated on the outer `media` row, so it asks "does any *other* live message still carry this object" per row rather than once for the batch.
// WARN: `notExists`, never a hand-written `NOT ${exists(…)}` — § 12.'s `isMediaWorn` records what unparenthesized negation did to a composed fragment there, and this one is composed into an `and()` the same way.
function isNotCarriedElsewhere(deletedId: MessageId) {
  return notExists(
    getDb()
      .select({ one: sql`1` })
      .from(messageMedia)
      .innerJoin(messages, eq(messages.id, messageMedia.messageId))
      .where(
        and(
          eq(messageMedia.mediaId, media.id),
          ne(messageMedia.messageId, deletedId),
          isNull(messages.deletedAt),
        ),
      ),
  );
}
