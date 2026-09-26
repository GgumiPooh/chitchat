import "server-only";

import { getDb, nextSnowflake, vocaCards, vocaReviews } from "@/shared/db";
import type { UserId, VocaCardId, VocaReviewId } from "@/shared/lib";
import { and, eq, isNull } from "drizzle-orm";
import { computeNextReview, type Rating } from "../model/fsrs-adapter";
import { toVocaSessionDayKey } from "../model/time-boundary";
import { toVocaCard, type VocaCard, type VocaReviewLog } from "../model/types";
import { getVocaUserSettings } from "./get-user-settings";

export type SubmitVocaReviewInput = {
  userId: UserId;
  cardId: VocaCardId;
  rating: Rating;
  timeSpentMs?: number;
  now?: Date;
};

export type SubmitVocaReviewResult = {
  card: VocaCard;
  reviewLog: VocaReviewLog;
  nextInterval: string;
};

export async function submitVocaReview({
  userId,
  cardId,
  rating,
  timeSpentMs = 0,
  now = new Date(),
}: SubmitVocaReviewInput): Promise<SubmitVocaReviewResult> {
  const db = getDb();

  const [cardRow] = await db
    .select()
    .from(vocaCards)
    .where(
      and(eq(vocaCards.id, cardId), eq(vocaCards.userId, userId), isNull(vocaCards.deletedAt)),
    );

  if (!cardRow) {
    throw new Error(`Voca card ${cardId} not found`);
  }

  const settings = await getVocaUserSettings(userId);
  const reviewResult = computeNextReview(cardRow, rating, settings.desiredRetention, now);

  const reviewId = nextSnowflake<VocaReviewId>();
  const nextDueDate = toVocaSessionDayKey(reviewResult.dueAt);

  const [reviewLogRow] = await db
    .insert(vocaReviews)
    .values({
      id: reviewId,
      cardId: cardRow.id,
      userId,
      rating,
      stateBefore: cardRow.state,
      stabilityBefore: cardRow.stability,
      difficultyBefore: cardRow.difficulty,
      stateAfter: reviewResult.state,
      stabilityAfter: reviewResult.stability,
      difficultyAfter: reviewResult.difficulty,
      scheduledDays: reviewResult.scheduledDays,
      timeSpentMs,
      reviewedAt: now,
    })
    .returning();

  const [updatedCardRow] = await db
    .update(vocaCards)
    .set({
      state: reviewResult.state,
      stability: reviewResult.stability,
      difficulty: reviewResult.difficulty,
      reps: reviewResult.reps,
      lapses: reviewResult.lapses,
      dueAt: reviewResult.dueAt,
      dueDate: nextDueDate,
    })
    .where(eq(vocaCards.id, cardId))
    .returning();

  const reviewLog: VocaReviewLog = {
    id: reviewLogRow.id,
    cardId: reviewLogRow.cardId,
    userId: reviewLogRow.userId,
    rating: reviewLogRow.rating,
    stateBefore: reviewLogRow.stateBefore,
    stabilityBefore: reviewLogRow.stabilityBefore,
    difficultyBefore: reviewLogRow.difficultyBefore,
    stateAfter: reviewLogRow.stateAfter,
    stabilityAfter: reviewLogRow.stabilityAfter,
    difficultyAfter: reviewLogRow.difficultyAfter,
    scheduledDays: reviewLogRow.scheduledDays,
    timeSpentMs: reviewLogRow.timeSpentMs,
    reviewedAt: reviewLogRow.reviewedAt,
  };

  return {
    card: toVocaCard(updatedCardRow),
    reviewLog,
    nextInterval: reviewResult.intervalString,
  };
}
