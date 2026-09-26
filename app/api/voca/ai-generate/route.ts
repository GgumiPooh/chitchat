import "server-only";

import { pushToUser } from "@/entities/push-subscription";
import { createVocaCard, generateVocaCard, synthesizeVocaAudio } from "@/entities/voca";
import { apiError } from "@/shared/api";
import { getCurrentUser } from "@/shared/auth";
import { VOCA_CARDS_ROUTE } from "@/shared/config";
import { safelyRunAsync } from "@/shared/lib";
import { NextResponse, after } from "next/server";
import { z } from "zod";

const generateSchema = z.object({
  word: z.string().min(1),
  contextSentence: z.string().optional(),
});

export async function POST(request: Request) {
  const user = await getCurrentUser();
  if (!user) {
    return apiError("unauthorized");
  }

  const json = await request.json().catch(() => null);
  const parsed = generateSchema.safeParse(json);
  if (!parsed.success) {
    return apiError("invalid_request");
  }

  const { word, contextSentence } = parsed.data;

  // Non-blocking asynchronous background execution
  after(() =>
    safelyRunAsync(async () => {
      try {
        const generated = await generateVocaCard(word, contextSentence);
        const audioResult = await synthesizeVocaAudio(
          user.id,
          generated.targetWord,
          generated.sentence,
        );

        await createVocaCard({
          userId: user.id,
          sentence: generated.sentence,
          targetWord: generated.targetWord,
          pos: generated.pos,
          pronunciation: generated.pronunciation,
          koreanMeaning: generated.koreanMeaning,
          englishDefinition: generated.englishDefinition,
          confusable: generated.confusable,
          collocations: generated.collocations,
          wordFamily: generated.wordFamily,
          examples: generated.examples,
          audioUrl: audioResult.audioUrl,
          sentenceAudioUrl: audioResult.sentenceAudioUrl,
          audioMediaId: audioResult.audioMediaId,
          sentenceAudioMediaId: audioResult.sentenceAudioMediaId,
          tags: `voca,${generated.targetWord.toLowerCase().replace(/\s+/g, "-")}`,
        });

        await pushToUser(user.id, {
          title: "단어 카드 생성 완료",
          body: `${generated.targetWord} 카드가 추가되었어요.`,
          url: VOCA_CARDS_ROUTE,
          tag: "voca-created",
        });
      } catch (error) {
        console.error("[ai-generate] Background card generation failed:", error);
      }
    }),
  );

  return NextResponse.json({ accepted: true });
}
