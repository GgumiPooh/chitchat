import "server-only";

import { chatSettings, getDb } from "@/shared/db";
import type { Nullable } from "@/shared/lib";
import { cache } from "react";

/**
 * REQUIREMENTS.md § 8.15. The standing instruction either participant may set for
 * every question asked in the room, or `null` when none is set.
 *
 * INFO: `cache()`d for the same reason `readChatBackground` is — `GET /api/users`
 * and a running generation both read this, and within one request it is one query.
 */
export const readLlmSystemPrompt = cache(async (): Promise<Nullable<string>> => {
  const [row] = await getDb()
    .select({ llmSystemPrompt: chatSettings.llmSystemPrompt })
    .from(chatSettings)
    .limit(1);

  return row?.llmSystemPrompt ?? null;
});
