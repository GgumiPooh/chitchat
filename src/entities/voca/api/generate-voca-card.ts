import "server-only";

import { getDb, llmAgents } from "@/shared/db";
import { GoogleGenAI } from "@google/genai";
import { and, desc, eq, isNull, or, sql } from "drizzle-orm";

export type GeneratedVocaCard = {
  sentence: string;
  targetWord: string;
  pos: string;
  pronunciation: string;
  koreanMeaning: string;
  englishDefinition: string;
  confusable: string | null;
  collocations: string;
  wordFamily: string | null;
  examples: string[];
};

const VOCA_SYSTEM_PROMPT = `You are an expert English lexicographer and language tutor specializing in creating high-quality vocabulary flashcards for Korean adult learners of English.
Follow these rules strictly:
1. Target Word: exactly the word requested.
2. POS: standard abbreviation (e.g. n., v., adj., adv., prep., phr.).
3. Pronunciation: IPA with slashes, e.g. /dɪˈlɪb.ər.ət/.
4. Korean Meaning: natural, concise Korean translation.
5. English Definition: concise monolingual English definition.
6. Sentence (1T principle): A single natural, authentic sentence where the target word is replaced by "<b>__________</b>". Every other word in the sentence must be common and easy to understand for the learner. The sentence must provide enough context to infer the target word.
7. Confusable: commonly confused words in the format "≠ word (brief distinction)", or null if none.
8. Collocations: 2-3 high-frequency natural collocations separated by " · ".
9. Word Family: related forms (e.g. "n. deliberation · adv. deliberately"), or null if none.
10. Examples: exactly 3 distinct example sentences showing different registers or contexts. In each example, wrap the target word in <b>...</b> tags. Return as an array of 3 strings.

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
  "examples": string[]
}`;

export async function generateVocaCard(
  word: string,
  contextSentence?: string,
): Promise<GeneratedVocaCard> {
  const cleanWord = word.trim();
  const db = getDb();
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

  let prompt = `Create an English vocabulary flashcard for the word: "${cleanWord}".`;
  if (contextSentence && contextSentence.trim().length > 0) {
    prompt += ` Context sentence provided by learner: "${contextSentence.trim()}". Please use or adapt this sentence for the context/sentence field if suitable.`;
  }

  if (apiKey) {
    try {
      const ai = new GoogleGenAI({ apiKey });
      const response = await ai.models.generateContent({
        model: modelName,
        contents: prompt,
        config: {
          systemInstruction: VOCA_SYSTEM_PROMPT,
          responseMimeType: "application/json",
        },
      });

      const text = response.text?.trim() ?? "";
      if (text) {
        const parsed = JSON.parse(text) as Partial<GeneratedVocaCard>;
        return {
          targetWord: parsed.targetWord || cleanWord,
          pos: parsed.pos || "word",
          pronunciation: parsed.pronunciation || `/${cleanWord}/`,
          koreanMeaning: parsed.koreanMeaning || cleanWord,
          englishDefinition: parsed.englishDefinition || "",
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
        };
      }
    } catch (error) {
      console.error("[generateVocaCard] Gemini generation failed, using fallback:", error);
    }
  }

  // Graceful fallback when API key is missing or model request fails
  return {
    targetWord: cleanWord,
    pos: "word",
    pronunciation: `/${cleanWord}/`,
    koreanMeaning: cleanWord,
    englishDefinition: `Definition of ${cleanWord}`,
    sentence: contextSentence
      ? contextSentence.replace(new RegExp(`\\b${cleanWord}\\b`, "gi"), "<b>__________</b>")
      : `He demonstrated a remarkable <b>__________</b> throughout the project.`,
    confusable: null,
    collocations: `${cleanWord} example · common ${cleanWord}`,
    wordFamily: null,
    examples: [
      `We observed the <b>${cleanWord}</b> in action.`,
      `She was known for her exceptional <b>${cleanWord}</b>.`,
      `Understanding <b>${cleanWord}</b> is important in this context.`,
    ],
  };
}
