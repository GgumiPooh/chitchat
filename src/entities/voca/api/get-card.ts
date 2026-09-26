import "server-only";

import { getDb, vocaCards } from "@/shared/db";
import type { Nullable, UserId, VocaCardId } from "@/shared/lib";
import { and, eq, isNull } from "drizzle-orm";
import { toVocaCard, type VocaCard } from "../model/types";

export async function getVocaCard(userId: UserId, cardId: VocaCardId): Promise<Nullable<VocaCard>> {
  const db = getDb();
  const [row] = await db
    .select()
    .from(vocaCards)
    .where(
      and(eq(vocaCards.id, cardId), eq(vocaCards.userId, userId), isNull(vocaCards.deletedAt)),
    );

  return row ? toVocaCard(row) : null;
}
