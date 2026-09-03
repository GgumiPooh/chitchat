import { writeLlmSystemPrompt } from "@/entities/llm-system-prompt";
import { apiError } from "@/shared/api";
import { getCurrentUser } from "@/shared/auth";
import { MAX_LLM_SYSTEM_PROMPT_LENGTH } from "@/shared/config";
import { NextResponse } from "next/server";
import { z } from "zod";

// INFO: REQUIREMENTS.md § 8.15. Trimmed, and an empty result is `null` — a whitespace-only save must not leave the row holding a prompt that reads as unset everywhere else.
const bodySchema = z.object({
  llmSystemPrompt: z
    .string()
    .trim()
    .max(MAX_LLM_SYSTEM_PROMPT_LENGTH)
    .transform((value) => value || null),
});

/**
 * REQUIREMENTS.md § 8.15. The standing instruction 쨈미니 answers every question
 * with — a `couple_settings` field, not a key on `PATCH /api/users/me`, since either
 * participant may set it and it belongs to the conversation rather than to either
 * profile (§ 12.2. draws the same distinction for the wallpaper).
 *
 * INFO: The write's `couple_settings` trigger fires `user_changed` like every other
 * write to this table, so `GET /api/users` carries the new prompt to the other
 * participant on the client's existing refetch — no second channel or route.
 */
export async function PATCH(request: Request) {
  const user = await getCurrentUser();

  if (!user) {
    return apiError("unauthorized");
  }

  const body = bodySchema.safeParse(await request.json().catch(() => null));

  if (!body.success) {
    return apiError("invalid_request");
  }

  await writeLlmSystemPrompt(body.data.llmSystemPrompt);

  return NextResponse.json({ llmSystemPrompt: body.data.llmSystemPrompt });
}
