import "server-only";

import { MEDIA_PATH } from "@/shared/config";
import { getDb, media, nextSnowflake } from "@/shared/db";
import type { MediaId, UserId } from "@/shared/lib";
import { buildStorageKey, putObject } from "@/shared/storage";
import { Communicate } from "edge-tts-universal";

export type SynthesizedVocaAudio = {
  audioUrl: string | null;
  audioMediaId: MediaId | null;
  sentenceAudioUrl: string | null;
  sentenceAudioMediaId: MediaId | null;
};

const TTS_VOICE = "en-AU-WilliamMultilingualNeural";

async function renderTtsAudioBuffer(text: string): Promise<Buffer | null> {
  try {
    const cleanText = text.replace(/<[^>]*>/g, "").trim();
    if (!cleanText) {
      return null;
    }

    const communicate = new Communicate(cleanText, { voice: TTS_VOICE });
    const chunks: Uint8Array[] = [];

    for await (const chunk of communicate.stream()) {
      if (chunk.type === "audio" && chunk.data) {
        chunks.push(chunk.data);
      }
    }

    if (chunks.length === 0) {
      return null;
    }

    return Buffer.concat(chunks);
  } catch (error) {
    console.error("[synthesizeVocaAudio] TTS generation failed:", error);
    return null;
  }
}

export async function synthesizeVocaAudio(
  userId: UserId,
  targetWord: string,
  sentence: string,
): Promise<SynthesizedVocaAudio> {
  const db = getDb();

  // 1. Synthesize word audio
  const wordBuffer = await renderTtsAudioBuffer(targetWord);
  let audioMediaId: MediaId | null = null;
  let audioUrl: string | null = null;

  if (wordBuffer && wordBuffer.byteLength > 0) {
    try {
      const wordStorageKey = buildStorageKey("voca", userId);
      await putObject(wordStorageKey, wordBuffer, "audio/mpeg");

      audioMediaId = nextSnowflake<MediaId>();
      await db.insert(media).values({
        id: audioMediaId,
        ownerId: userId,
        r2Key: wordStorageKey,
        mime: "audio/mpeg",
        size: wordBuffer.byteLength,
        kind: "audio",
        scope: "voca",
      });

      audioUrl = `${MEDIA_PATH}/${audioMediaId}`;
    } catch (error) {
      console.error("[synthesizeVocaAudio] Failed to persist word audio:", error);
    }
  }

  // 2. Synthesize sentence audio with word filled in
  const filledSentence = sentence.replace(/<b>__________<\/b>/g, targetWord);
  const sentenceBuffer = await renderTtsAudioBuffer(filledSentence);
  let sentenceAudioMediaId: MediaId | null = null;
  let sentenceAudioUrl: string | null = null;

  if (sentenceBuffer && sentenceBuffer.byteLength > 0) {
    try {
      const sentenceStorageKey = buildStorageKey("voca", userId);
      await putObject(sentenceStorageKey, sentenceBuffer, "audio/mpeg");

      sentenceAudioMediaId = nextSnowflake<MediaId>();
      await db.insert(media).values({
        id: sentenceAudioMediaId,
        ownerId: userId,
        r2Key: sentenceStorageKey,
        mime: "audio/mpeg",
        size: sentenceBuffer.byteLength,
        kind: "audio",
        scope: "voca",
      });

      sentenceAudioUrl = `${MEDIA_PATH}/${sentenceAudioMediaId}`;
    } catch (error) {
      console.error("[synthesizeVocaAudio] Failed to persist sentence audio:", error);
    }
  }

  return {
    audioUrl,
    audioMediaId,
    sentenceAudioUrl,
    sentenceAudioMediaId,
  };
}
