import "server-only";

import { getDb, letterMedia, media, timeLetters } from "@/shared/db";
import type { TimeLetterId, UserId } from "@/shared/lib";
import { eq, inArray } from "drizzle-orm";

export type CancelTimeLetterParams = {
  letterId: TimeLetterId;
  userId: UserId;
};

// INFO: Cancels a scheduled time letter and soft-deletes attached media so orphan sweeper can purge them.
export async function cancelTimeLetter({
  letterId,
  userId,
}: CancelTimeLetterParams): Promise<boolean> {
  const db = getDb();

  return db.transaction(async (tx) => {
    const [row] = await tx.select().from(timeLetters).where(eq(timeLetters.id, letterId)).limit(1);

    if (!row) {
      return false;
    }

    // WARN: Only the sender has authority to cancel a time letter.
    if (row.senderId !== userId) {
      return false;
    }

    if (row.status === "canceled") {
      return true;
    }

    if (row.status === "sent" || row.status === "delivering") {
      throw new Error("Cannot cancel a letter that is already delivered or in delivery");
    }

    await tx
      .update(timeLetters)
      .set({
        status: "canceled",
        updatedAt: new Date(),
      })
      .where(eq(timeLetters.id, letterId));

    // INFO: Mark attached media rows deleted so the ops purge workflow reclaims their R2 objects.
    const attachedMedia = await tx
      .select({ mediaId: letterMedia.mediaId })
      .from(letterMedia)
      .where(eq(letterMedia.letterId, letterId));

    if (attachedMedia.length > 0) {
      const mediaIds = attachedMedia.map((m) => m.mediaId);
      await tx.update(media).set({ deletedAt: new Date() }).where(inArray(media.id, mediaIds));
    }

    return true;
  });
}
