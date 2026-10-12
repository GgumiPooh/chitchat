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

  const [lastReview, previousReview] = await db
    .select()
    .from(vocaReviews)
    .where(and(eq(vocaReviews.cardId, cardId), eq(vocaReviews.userId, userId)))
    .orderBy(desc(vocaReviews.reviewedAt), desc(vocaReviews.id))
    .limit(2);

  if (!lastReview) {
    return null;
  }

  const now = new Date();
  const sessionDayKey = toVocaSessionDayKey(now);

  // INFO: ts-fsrs counts a lapse only for 다시 on a card already in review; a (re)learning 다시 leaves `lapses` alone.
  const lapseDelta =
    lastReview.rating === Rating.Again && lastReview.stateBefore === "review" ? 1 : 0;

  const [updatedCardRow] = await db
    .update(vocaCards)
    .set({
      state: lastReview.stateBefore as VocaCardState,
      stability: lastReview.stabilityBefore,
      difficulty: lastReview.difficultyBefore,
      learningSteps: lastReview.learningStepsBefore,
      lastReviewedAt: previousReview?.reviewedAt ?? null,
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
