import "server-only";

import { pushToUser } from "@/entities/push-subscription";
import { createVocaCard, generateVocaCard, synthesizeVocaAudio } from "@/entities/voca";
import { apiError } from "@/shared/api";
import { getCurrentUser } from "@/shared/auth";
import { VOCA_CARDS_ROUTE } from "@/shared/config";
import { safelyRunAsync, type UserId } from "@/shared/lib";
import { josa } from "es-hangul";
import { NextResponse, after } from "next/server";
import { z } from "zod";

const generateSchema = z.object({
  word: z.string().min(1),
  contextSentence: z.string().optional(),
  tags: z.string().optional(),
  mode: z.enum(["async", "sync"]).optional().default("async"),
});

async function processCardCreation(
  userId: UserId,
  word: string,
  contextSentence?: string,
  explicitTags?: string,
) {
  try {
    const generated = await generateVocaCard(word, contextSentence);
    const audioResult = await synthesizeVocaAudio(userId, generated.targetWord, generated.sentence);

    const derivedCategory = generated.category?.trim();
    const derivedGrade = generated.grade;
    const inferredParts = [derivedCategory, derivedGrade].filter((part): part is string =>
      Boolean(part && part.trim()),
    );
    const fallbackTags = inferredParts.length > 0 ? inferredParts.join(",") : null;
    const finalTags = explicitTags?.trim() || fallbackTags;

    const card = await createVocaCard({
      userId,
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
      tags: finalTags,
    });

    await pushToUser(userId, {
      title: "단어 카드 생성 완료",
      body: `${josa(generated.targetWord, "이/가")} 카드가 추가되었어요.`,
      url: VOCA_CARDS_ROUTE,
      tag: "voca-created",
    });

    return card;
  } catch (error) {
    console.error("[ai-generate] Card generation failed:", error);
    await pushToUser(userId, {
      title: "단어 카드 생성 실패",
      body: `${josa(word, "을/를")} 생성하지 못했어요. 다시 시도해주세요.`,
      url: VOCA_CARDS_ROUTE,
      tag: "voca-failed",
    });
    throw error;
  }
}

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

  const { word, contextSentence, tags, mode } = parsed.data;

  // Synchronous mode for individual recommendations waiting for spinner completion
  if (mode === "sync") {
    try {
      const card = await processCardCreation(user.id, word, contextSentence, tags);
      return NextResponse.json({ accepted: true, success: true, cardId: card.id });
    } catch {
      return apiError("unavailable");
    }
  }

  // Non-blocking asynchronous background execution for batch submissions
  after(() =>
    safelyRunAsync(async () => {
      try {
        await processCardCreation(user.id, word, contextSentence, tags);
      } catch {
        // Error logged and failure push sent in processCardCreation
      }
    }),
  );

  return NextResponse.json({ accepted: true });
}
