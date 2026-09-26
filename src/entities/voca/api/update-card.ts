import "server-only";

import { getDb, vocaCards } from "@/shared/db";
import type { MediaId, Nullable, UserId, VocaCardId } from "@/shared/lib";
import { and, eq, isNull } from "drizzle-orm";
import { toVocaCard, type VocaCard, type VocaCardState } from "../model/types";

export type UpdateVocaCardInput = {
  sentence?: string;
  targetWord?: string;
  pos?: string;
  pronunciation?: string;
  koreanMeaning?: string;
  englishDefinition?: string;
  confusable?: Nullable<string>;
  collocations?: string;
  wordFamily?: Nullable<string>;
  examples?: string[] | string;
  audioUrl?: Nullable<string>;
  sentenceAudioUrl?: Nullable<string>;
  audioMediaId?: Nullable<MediaId>;
  sentenceAudioMediaId?: Nullable<MediaId>;
  tags?: Nullable<string>;
  suspended?: boolean;
  state?: VocaCardState;
};

export async function updateVocaCard(
  userId: UserId,
  cardId: VocaCardId,
  patch: UpdateVocaCardInput,
): Promise<Nullable<VocaCard>> {
  const db = getDb();

  const updateValues: Record<string, unknown> = { ...patch };
  if (patch.examples !== undefined) {
    updateValues.examples = Array.isArray(patch.examples)
      ? JSON.stringify(patch.examples)
      : patch.examples;
  }

  const [row] = await db
    .update(vocaCards)
    .set(updateValues)
    .where(and(eq(vocaCards.id, cardId), eq(vocaCards.userId, userId), isNull(vocaCards.deletedAt)))
    .returning();

  return row ? toVocaCard(row) : null;
}
