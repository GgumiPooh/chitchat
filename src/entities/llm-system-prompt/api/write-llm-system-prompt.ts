import "server-only";

import { chatSettings, getDb } from "@/shared/db";
import type { Nullable } from "@/shared/lib";

/**
 * REQUIREMENTS.md § 8.15. Points the one `chat_settings` row at a new standing
 * instruction, or at `null` to clear it.
 *
 * INFO: A plain `UPDATE`, unlike § 12.2.'s wallpaper write — there is no R2 object a
 * losing writer could orphan here, so the ordinary two-writer outcome (last commit
 * wins) is the correct one and needs no `FOR UPDATE` self-join workaround.
 *
 * WARN: Re-creates the row if it is missing rather than answering 404, for the same
 * reason `writeChatBackground` does — `0025` seeds it and the CHECK leaves `true` as
 * its only key, so the sole way to lose it is a restore or a hand-run `DELETE`.
 */
export async function writeLlmSystemPrompt(prompt: Nullable<string>): Promise<void> {
  const result = await getDb()
    .update(chatSettings)
    .set({ llmSystemPrompt: prompt })
    .returning({ id: chatSettings.id });

  if (result.length === 0) {
    await getDb().insert(chatSettings).values({ llmSystemPrompt: prompt });
  }
}
