import "server-only";

import { getDb, llmAgents, vocaCards } from "@/shared/db";
import type { UserId } from "@/shared/lib";
import { GoogleGenAI } from "@google/genai";
import { and, desc, eq, isNull, or, sql } from "drizzle-orm";

export type RecommendedVocaItem = {
  targetWord: string;
  pos: string;
  koreanMeaning: string;
};

export type RecommendVocaOptions = {
  userId: UserId;
  tag?: string;
  grade?: "essential" | "core" | "killer";
  customTopic?: string;
  count?: number;
};

const VOCA_RECOMMEND_SYSTEM_PROMPT = `You are an elite English lexicographer and vocabulary test specialist specializing in Korean adult examinations (TOEIC, CSAT/수능, Civil Service Exam/공무원, TOEFL, TEPS, Business English).

Follow these rules strictly:
1. Target Word: Recommend base/dictionary form (lemma) in lower-case only. No inflections (e.g. use "deliberate", not "deliberated").
2. POS: Standard abbreviation (e.g. "n.", "v.", "adj.", "adv.", "phr.").
3. Korean Meaning: Concise, natural Korean definition commonly tested in the requested exam or context.
4. Selection Criterion:
   - "essential": High-frequency fundamental vocabulary crucial for base score.
   - "core": Most frequent key exam vocabulary that regularly appears on actual tests.
   - "killer": Advanced, nuanced, or high-difficulty discriminating vocabulary for top scores.
5. Strict JSON Output: Return a JSON array of objects with keys: "targetWord", "pos", "koreanMeaning".`;

function buildRecommendPrompt(
  tag: string,
  grade: "essential" | "core" | "killer",
  customTopic?: string,
  requestedCount: number = 8,
): string {
  const candidateCount = Math.max(12, Math.min(20, Math.round(requestedCount * 1.8)));

  let prompt = `Recommend exactly ${candidateCount} distinct English vocabulary words for Korean learners.\n`;
  prompt += `- Category/Target: ${tag}\n`;
  prompt += `- Frequency/Difficulty Grade: ${grade}\n`;

  if (customTopic && customTopic.trim().length > 0) {
    prompt += `- Specific Topic/Context: "${customTopic.trim()}"\n`;
  }

  prompt += `\nPlease return exactly ${candidateCount} items matching this target in valid JSON format.`;
  return prompt;
}

export async function recommendVocaWords({
  userId,
  tag = "전체",
  grade = "core",
  customTopic,
  count = 8,
}: RecommendVocaOptions): Promise<RecommendedVocaItem[]> {
  const db = getDb();

  // 1. Fetch user's existing active target words to guarantee 100% deduplication
  const existingCards = await db
    .select({ targetWord: vocaCards.targetWord })
    .from(vocaCards)
    .where(and(eq(vocaCards.userId, userId), isNull(vocaCards.deletedAt)));

  const existingWordSet = new Set(existingCards.map((c) => c.targetWord.trim().toLowerCase()));

  // 2. Fetch Gemini model configuration from DB or env
  const [geminiAgent] = await db
    .select()
    .from(llmAgents)
    .where(
      and(
        eq(llmAgents.enabled, true),
        eq(llmAgents.provider, "gemini"),
        or(isNull(llmAgents.disabledUntil), sql`${llmAgents.disabledUntil} <= now()`),
      ),
    )
    .orderBy(desc(llmAgents.priority))
    .limit(1);

  const apiKey = geminiAgent?.apiKey || process.env.GEMINI_API_KEY || "";
  const modelName = geminiAgent?.model || "gemini-2.5-flash";

  const prompt = buildRecommendPrompt(tag, grade, customTopic, count);

  let rawCandidates: RecommendedVocaItem[] = [];

  if (apiKey) {
    try {
      const ai = new GoogleGenAI({ apiKey });
      const response = await ai.models.generateContent({
        model: modelName,
        contents: prompt,
        config: {
          systemInstruction: VOCA_RECOMMEND_SYSTEM_PROMPT,
          responseMimeType: "application/json",
          temperature: 0.85,
        },
      });

      const text = response.text?.trim() ?? "";
      if (text) {
        const parsed = JSON.parse(text);
        if (Array.isArray(parsed)) {
          rawCandidates = parsed
            .map((item) => ({
              targetWord: String(item.targetWord ?? "")
                .trim()
                .toLowerCase(),
              pos: String(item.pos ?? "word").trim(),
              koreanMeaning: String(item.koreanMeaning ?? "").trim(),
            }))
            .filter((item) => item.targetWord.length > 0 && item.koreanMeaning.length > 0);
        }
      }
    } catch (error) {
      console.error("[recommendVocaWords] Gemini generation failed, using fallback:", error);
    }
  }

  // Fallback defaults if LLM unavailable
  if (rawCandidates.length === 0) {
    const fallbackPool: RecommendedVocaItem[] = [
      { targetWord: "scrutinize", pos: "v.", koreanMeaning: "면밀히 검토하다, 조사하다" },
      { targetWord: "deliberate", pos: "adj.", koreanMeaning: "신중한, 고의의" },
      { targetWord: "ephemeral", pos: "adj.", koreanMeaning: "수명이 짧은, 덧없는" },
      { targetWord: "ubiquitous", pos: "adj.", koreanMeaning: "어디에나 존재하는, 흔한" },
      { targetWord: "comprehensive", pos: "adj.", koreanMeaning: "포괄적인, 종합적인" },
      { targetWord: "pragmatic", pos: "adj.", koreanMeaning: "실용적인, 현실적인" },
      { targetWord: "meticulous", pos: "adj.", koreanMeaning: "꼼꼼한, 세심한" },
      { targetWord: "lucrative", pos: "adj.", koreanMeaning: "수익성이 좋은, 돈벌이가 되는" },
      { targetWord: "feasible", pos: "adj.", koreanMeaning: "실현 가능한" },
      { targetWord: "imminent", pos: "adj.", koreanMeaning: "임박한, 눈앞에 닥친" },
    ];
    rawCandidates = fallbackPool;
  }

  // 3. Filter out duplicates already in user's deck (Stateless, 100% exact filter)
  const uniqueItems: RecommendedVocaItem[] = [];
  const seenInBatch = new Set<string>();

  for (const candidate of rawCandidates) {
    const wordKey = candidate.targetWord.toLowerCase();
    if (!existingWordSet.has(wordKey) && !seenInBatch.has(wordKey)) {
      seenInBatch.add(wordKey);
      uniqueItems.push(candidate);
      if (uniqueItems.length >= count) {
        break;
      }
    }
  }

  return uniqueItems;
}
