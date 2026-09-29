import "server-only";

import { getDb, llmAgents } from "@/shared/db";
import { type Nullable } from "@/shared/lib";
import { GoogleGenAI } from "@google/genai";
import { and, desc, eq, isNull, or, sql } from "drizzle-orm";

export type GeneratedVocaCard = {
  sentence: string;
  targetWord: string;
  pos: string;
  pronunciation: string;
  koreanMeaning: string;
  englishDefinition: string;
  confusable: Nullable<string>;
  collocations: string;
  wordFamily: Nullable<string>;
  examples: string[];
  category?: Nullable<string>;
  grade?: Nullable<"essential" | "core" | "killer">;
};

function isRateLimitError(error: unknown): boolean {
  return (
    typeof error === "object" && error !== null && (error as { status?: number }).status === 429
  );
}

const VOCA_SYSTEM_PROMPT = `You are an expert English lexicographer and language tutor specializing in creating high-quality vocabulary flashcards for Korean adult learners of English.
Follow these rules strictly:
1. Target Word: exactly the word requested.
2. POS: standard abbreviation (e.g. n., v., adj., adv., prep., phr.).
3. Pronunciation: IPA with slashes, e.g. /dɪˈlɪb.ər.ət/.
4. Korean Meaning: natural, concise Korean translation.
5. English Definition: concise monolingual English definition. IMPORTANT: Do NOT include the target word itself, its root, or its inflected forms in the definition.
6. Sentence (1T principle): A single natural, authentic sentence where the target word is replaced by "<b>__________</b>". Every other word in the sentence must be common and easy to understand for the learner. The sentence must provide enough context to infer the target word.
7. Confusable: commonly confused words in the format "≠ word (brief distinction)", or null if none.
8. Collocations: 2-3 high-frequency natural collocations separated by " · ".
9. Word Family: related forms (e.g. "n. deliberation · adv. deliberately"), or null if none.
10. Examples: exactly 3 distinct example sentences showing different registers or contexts. In each example, wrap the target word in <b>...</b> tags. Return as an array of 3 strings.
11. Category: the primary theme/domain (e.g. "일상 회화", "비즈니스", "IT/기술", "학술/시사", "토익", "수능", etc.). Natural Korean concise string.
12. Grade: difficulty and frequency grade for Korean learners, exactly one of: "essential" (elementary/fundamental), "core" (intermediate/essential for exams & daily work), "killer" (advanced/challenging/distinguishing).

Return the result as a strict JSON object with fields:
{
  "targetWord": string,
  "pos": string,
  "pronunciation": string,
  "koreanMeaning": string,
  "englishDefinition": string,
  "sentence": string,
  "confusable": string | null,
  "collocations": string,
  "wordFamily": string | null,
  "examples": string[],
  "category": string,
  "grade": "essential" | "core" | "killer"
}`;

export async function generateVocaCard(
  word: string,
  contextSentence?: string,
): Promise<GeneratedVocaCard> {
  const cleanWord = word.trim();
  const db = getDb();

  // INFO: REQUIREMENTS.md § 8.15. Try candidate agents in priority order
  const candidateAgents = await db
    .select()
    .from(llmAgents)
    .where(
      and(
        eq(llmAgents.enabled, true),
        eq(llmAgents.provider, "gemini"),
        or(isNull(llmAgents.disabledUntil), sql`${llmAgents.disabledUntil} <= now()`),
      ),
    )
    .orderBy(desc(llmAgents.priority), llmAgents.model, llmAgents.apiKey);

  const envKey = process.env.GEMINI_API_KEY;
  if (envKey && !candidateAgents.some((a) => a.apiKey === envKey)) {
    candidateAgents.push({
      provider: "gemini",
      model: "gemini-2.5-flash",
      apiKey: envKey,
      priority: -1,
      enabled: true,
      disabledUntil: null,
      config: {},
    });
  }

  let prompt = `Create an English vocabulary flashcard for the word: "${cleanWord}".`;
  if (contextSentence && contextSentence.trim().length > 0) {
    // INFO: REQUIREMENTS.md § 17.3. Adapt context sentence if target word or its inflections/lemmas appear; otherwise fall back to standalone sentence.
    prompt += ` Context sentence provided by learner: "${contextSentence.trim()}". If the target word (or any of its inflected forms or lemmas, e.g. past tense, plural, participle) appears in or directly relates to this context sentence, prioritize using or adapting it for the 'sentence' field (1T principle). If the word does NOT appear in or relate to this context sentence, ignore the context sentence completely and generate an authentic, standalone sentence.`;
  }

  for (const agent of candidateAgents) {
    try {
      const ai = new GoogleGenAI({ apiKey: agent.apiKey });
      const response = await ai.models.generateContent({
        model: agent.model || "gemini-2.5-flash",
        contents: prompt,
        config: {
          systemInstruction: VOCA_SYSTEM_PROMPT,
          responseMimeType: "application/json",
          temperature: 0.7,
        },
      });

      const text = response.text?.trim() ?? "";
      if (text) {
        const parsed = JSON.parse(text) as Partial<GeneratedVocaCard>;
        const targetWord = parsed.targetWord || cleanWord;

        let englishDefinition = parsed.englishDefinition || "";
        const escaped = targetWord.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
        englishDefinition = englishDefinition.replace(
          new RegExp(`\\b${escaped}\\w*`, "gi"),
          "____",
        );

        return {
          targetWord,
          pos: parsed.pos || "word",
          pronunciation: parsed.pronunciation || `/${cleanWord}/`,
          koreanMeaning: parsed.koreanMeaning || cleanWord,
          englishDefinition,
          sentence: parsed.sentence || `This is an example sentence with <b>__________</b>.`,
          confusable: parsed.confusable ?? null,
          collocations: parsed.collocations || "",
          wordFamily: parsed.wordFamily ?? null,
          examples:
            Array.isArray(parsed.examples) && parsed.examples.length > 0
              ? parsed.examples
              : [
                  `Here is an example with <b>${cleanWord}</b>.`,
                  `Another sentence with <b>${cleanWord}</b>.`,
                  `Third instance of <b>${cleanWord}</b>.`,
                ],
          category: parsed.category?.trim() || null,
          grade:
            parsed.grade === "essential" || parsed.grade === "core" || parsed.grade === "killer"
              ? parsed.grade
              : null,
        };
      }
    } catch (error) {
      console.warn(
        `[generateVocaCard] Candidate agent ${agent.provider}/${agent.model} failed:`,
        error,
      );

      if (isRateLimitError(error)) {
        await db
          .update(llmAgents)
          .set({ disabledUntil: new Date(Date.now() + 60_000) })
          .where(
            and(
              eq(llmAgents.provider, agent.provider),
              eq(llmAgents.model, agent.model),
              eq(llmAgents.apiKey, agent.apiKey),
            ),
          );
      }
    }
  }

  // WARN: When all candidate agents are exhausted, throw so processCardCreation dispatches failure push
  throw new Error(
    `[generateVocaCard] Failed to generate vocabulary card for "${cleanWord}": all candidate agents failed.`,
  );
}
