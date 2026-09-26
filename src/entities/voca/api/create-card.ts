import "server-only";

import { getDb, nextSnowflake, vocaCards } from "@/shared/db";
import type { MediaId, Nullable, UserId, VocaCardId } from "@/shared/lib";
import { toVocaSessionDayKey } from "../model/time-boundary";
import { toVocaCard, type VocaCard } from "../model/types";

export type CreateVocaCardInput = {
  userId: UserId;
  sentence: string;
  targetWord: string;
  pos: string;
  pronunciation: string;
  koreanMeaning: string;
  englishDefinition: string;
  confusable?: Nullable<string>;
  collocations: string;
  wordFamily?: Nullable<string>;
  examples: string[] | string;
  audioUrl?: Nullable<string>;
  sentenceAudioUrl?: Nullable<string>;
  audioMediaId?: Nullable<MediaId>;
  sentenceAudioMediaId?: Nullable<MediaId>;
  tags?: Nullable<string>;
};

export async function createVocaCard(input: CreateVocaCardInput): Promise<VocaCard> {
  const db = getDb();
  const id = nextSnowflake<VocaCardId>();
  const now = new Date();
  const dueDate = toVocaSessionDayKey(now);

  const examplesString = Array.isArray(input.examples)
    ? JSON.stringify(input.examples)
    : input.examples;

  const [row] = await db
    .insert(vocaCards)
    .values({
      id,
      userId: input.userId,
      state: "new",
      dueAt: now,
      dueDate,
      stability: 0,
      difficulty: 0,
      reps: 0,
      lapses: 0,
      suspended: false,
      sentence: input.sentence,
      targetWord: input.targetWord,
      pos: input.pos,
      pronunciation: input.pronunciation,
      koreanMeaning: input.koreanMeaning,
      englishDefinition: input.englishDefinition,
      confusable: input.confusable ?? null,
      collocations: input.collocations,
      wordFamily: input.wordFamily ?? null,
      examples: examplesString,
      audioUrl: input.audioUrl ?? null,
      sentenceAudioUrl: input.sentenceAudioUrl ?? null,
      audioMediaId: input.audioMediaId ?? null,
      sentenceAudioMediaId: input.sentenceAudioMediaId ?? null,
      tags: input.tags ?? null,
    })
    .returning();

  return toVocaCard(row);
}
