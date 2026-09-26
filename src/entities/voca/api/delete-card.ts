import "server-only";

import { getDb, media, vocaCards } from "@/shared/db";
import type { MediaId, UserId, VocaCardId } from "@/shared/lib";
import { and, eq, inArray, isNull } from "drizzle-orm";

export async function deleteVocaCard(userId: UserId, cardId: VocaCardId): Promise<boolean> {
  const db = getDb();

  const [card] = await db
    .select({
      id: vocaCards.id,
      audioMediaId: vocaCards.audioMediaId,
      sentenceAudioMediaId: vocaCards.sentenceAudioMediaId,
    })
    .from(vocaCards)
    .where(
      and(eq(vocaCards.id, cardId), eq(vocaCards.userId, userId), isNull(vocaCards.deletedAt)),
    );

  if (!card) {
    return false;
  }

  const now = new Date();

  await db.update(vocaCards).set({ deletedAt: now }).where(eq(vocaCards.id, cardId));

  const mediaIds = [card.audioMediaId, card.sentenceAudioMediaId].filter(
    (id): id is MediaId => id !== null,
  );

  if (mediaIds.length > 0) {
    await db
      .update(media)
      .set({ deletedAt: now })
      .where(and(inArray(media.id, mediaIds), eq(media.ownerId, userId), isNull(media.deletedAt)));
  }

  return true;
}
