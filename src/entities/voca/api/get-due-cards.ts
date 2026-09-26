import "server-only";

import { getDb, vocaCards, vocaReviews } from "@/shared/db";
import type { UserId } from "@/shared/lib";
import { and, asc, count, eq, gte, inArray, isNull, lte, or } from "drizzle-orm";
import { toVocaSessionDayKey, toVocaSessionStart } from "../model/time-boundary";
import { toVocaCard, type VocaCard, type VocaDueSummary } from "../model/types";
import { getVocaUserSettings } from "./get-user-settings";

export type DueCardsResult = {
  dueCards: VocaCard[];
  summary: VocaDueSummary;
  sessionDayKey: string;
};

export async function getDueCards(userId: UserId, now: Date = new Date()): Promise<DueCardsResult> {
  const db = getDb();
  const sessionDayKey = toVocaSessionDayKey(now);
  const sessionStart = toVocaSessionStart(sessionDayKey);
  const settings = await getVocaUserSettings(userId);

  // 1. Calculate how many new cards were studied during this session
  const [newStudiedRow] = await db
    .select({ count: count() })
    .from(vocaReviews)
    .where(
      and(
        eq(vocaReviews.userId, userId),
        gte(vocaReviews.reviewedAt, sessionStart),
        eq(vocaReviews.stateBefore, "new"),
      ),
    );
  const newStudiedToday = Number(newStudiedRow?.count ?? 0);
  const dailyNewCap = settings.dailyNewCards + settings.todayExtraNewCards;
  const newQuota = Math.max(0, dailyNewCap - newStudiedToday);

  // 2. Calculate review quota if a review limit is configured
  let reviewQuota = Infinity;
  if (settings.dailyReviewLimit !== null) {
    const [reviewStudiedRow] = await db
      .select({ count: count() })
      .from(vocaReviews)
      .where(
        and(
          eq(vocaReviews.userId, userId),
          gte(vocaReviews.reviewedAt, sessionStart),
          eq(vocaReviews.stateBefore, "review"),
        ),
      );
    const reviewStudiedToday = Number(reviewStudiedRow?.count ?? 0);
    reviewQuota = Math.max(0, settings.dailyReviewLimit - reviewStudiedToday);
  }

  // 3. Learning and relearning cards that are currently due
  const learningRows = await db
    .select()
    .from(vocaCards)
    .where(
      and(
        eq(vocaCards.userId, userId),
        isNull(vocaCards.deletedAt),
        eq(vocaCards.suspended, false),
        inArray(vocaCards.state, ["learning", "relearning"]),
        or(isNull(vocaCards.dueAt), lte(vocaCards.dueAt, now)),
      ),
    )
    .orderBy(asc(vocaCards.dueAt));

  // 4. Due review cards up to daily review limit
  const reviewLimit = Number.isFinite(reviewQuota) ? reviewQuota : 1000;
  const reviewRows =
    reviewLimit > 0
      ? await db
          .select()
          .from(vocaCards)
          .where(
            and(
              eq(vocaCards.userId, userId),
              isNull(vocaCards.deletedAt),
              eq(vocaCards.suspended, false),
              eq(vocaCards.state, "review"),
              or(lte(vocaCards.dueDate, sessionDayKey), lte(vocaCards.dueAt, now)),
            ),
          )
          .orderBy(asc(vocaCards.dueAt))
          .limit(reviewLimit)
      : [];

  // 5. New cards up to daily new cards limit
  const newRows =
    newQuota > 0
      ? await db
          .select()
          .from(vocaCards)
          .where(
            and(
              eq(vocaCards.userId, userId),
              isNull(vocaCards.deletedAt),
              eq(vocaCards.suspended, false),
              eq(vocaCards.state, "new"),
            ),
          )
          .orderBy(asc(vocaCards.id))
          .limit(newQuota)
      : [];

  const learningCards = learningRows.map(toVocaCard);
  const reviewCards = reviewRows.map(toVocaCard);
  const newCards = newRows.map(toVocaCard);

  const dueCards = [...learningCards, ...reviewCards, ...newCards];

  const summary: VocaDueSummary = {
    newCount: newCards.length,
    learningCount: learningCards.length,
    reviewCount: reviewCards.length,
    totalDue: dueCards.length,
  };

  return {
    dueCards,
    summary,
    sessionDayKey,
  };
}
