import { request } from "@/shared/api";
import { CHAT_AI_SYSTEM_PROMPT_PATH } from "@/shared/config";
import type { Nullable } from "@/shared/lib";

/** REQUIREMENTS.md § 8.15. Trims and empties to `null` server-side too; the value echoed back is what the sheet and the stream provider adopt. */
export async function saveLlmSystemPrompt(prompt: string): Promise<Nullable<string>> {
  const response = await request(CHAT_AI_SYSTEM_PROMPT_PATH, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ llmSystemPrompt: prompt }),
  });

  if (!response.ok) {
    throw new Error(String(response.status));
  }

  const { llmSystemPrompt } = (await response.json()) as { llmSystemPrompt: Nullable<string> };

  return llmSystemPrompt;
}
