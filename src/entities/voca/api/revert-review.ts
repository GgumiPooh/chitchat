import "server-only";

import { getDb, vocaCards, vocaReviews } from "@/shared/db";
import type { Nullable, UserId, VocaCardId } from "@/shared/lib";
import { and, desc, eq, isNull, sql } from "drizzle-orm";
import { Rating } from "../model/fsrs-adapter";
import { toVocaSessionDayKey } from "../model/time-boundary";
import { toVocaCard, type VocaCard, type VocaCardState } from "../model/types";

export async function revertVocaReview(
  userId: UserId,
  cardId: VocaCardId,
): Promise<Nullable<VocaCard>> {
  const db = getDb();

  const [lastReview] = await db
    .select()
    .from(vocaReviews)
    .where(and(eq(vocaReviews.cardId, cardId), eq(vocaReviews.userId, userId)))
    .orderBy(desc(vocaReviews.reviewedAt), desc(vocaReviews.id))
    .limit(1);

  if (!lastReview) {
    return null;
  }

  const now = new Date();
  const sessionDayKey = toVocaSessionDayKey(now);

  const lapseDelta = lastReview.rating === Rating.Again ? 1 : 0;

  const [updatedCardRow] = await db
    .update(vocaCards)
    .set({
      state: lastReview.stateBefore as VocaCardState,
      stability: lastReview.stabilityBefore,
      difficulty: lastReview.difficultyBefore,
      reps: sql`GREATEST(0, ${vocaCards.reps} - 1)`,
      lapses: sql`GREATEST(0, ${vocaCards.lapses} - ${lapseDelta})`,
      dueAt: now,
      dueDate: sessionDayKey,
    })
    .where(and(eq(vocaCards.id, cardId), eq(vocaCards.userId, userId), isNull(vocaCards.deletedAt)))
    .returning();

  await db.delete(vocaReviews).where(eq(vocaReviews.id, lastReview.id));

  return updatedCardRow ? toVocaCard(updatedCardRow) : null;
}
