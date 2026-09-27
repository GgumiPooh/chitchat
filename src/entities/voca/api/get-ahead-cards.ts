import "server-only";

import { getDb, vocaCards } from "@/shared/db";
import type { UserId } from "@/shared/lib";
import { and, asc, count, eq, inArray, isNull } from "drizzle-orm";
import { toVocaCard, type VocaCard } from "../model/types";

export async function getAheadCards(userId: UserId, limit = 15): Promise<VocaCard[]> {
  const db = getDb();

  const rows = await db
    .select()
    .from(vocaCards)
    .where(
      and(
        eq(vocaCards.userId, userId),
        isNull(vocaCards.deletedAt),
        eq(vocaCards.suspended, false),
        inArray(vocaCards.state, ["learning", "review", "relearning"]),
      ),
    )
    .orderBy(asc(vocaCards.dueAt))
    .limit(limit);

  return rows.map(toVocaCard);
}

export async function countAheadCards(userId: UserId): Promise<number> {
  const db = getDb();

  const [row] = await db
    .select({ count: count() })
    .from(vocaCards)
    .where(
      and(
        eq(vocaCards.userId, userId),
        isNull(vocaCards.deletedAt),
        eq(vocaCards.suspended, false),
        inArray(vocaCards.state, ["learning", "review", "relearning"]),
      ),
    );

  return Number(row?.count ?? 0);
}
