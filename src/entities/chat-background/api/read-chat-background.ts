import "server-only";

import { chatSettings, getDb } from "@/shared/db";
import type { Nullable } from "@/shared/lib";
import { cache } from "react";

/**
 * REQUIREMENTS.md § 12.2. The wallpaper both participants see, or `null` for the
 * flat `chat-canvas`.
 *
 * INFO: `cache()`d for the same reason `getSessionContext` is — the `(main)` shell
 * seeds the stream provider with it, the chat screen reads it again to emit the
 * § 12.2. preload, and the Settings row reads it a third time. One request, one
 * query.
 */
export const readChatBackgroundMediaId = cache(async (): Promise<Nullable<string>> => {
  const [row] = await getDb()
    .select({ backgroundMediaId: chatSettings.backgroundMediaId })
    .from(chatSettings)
    .limit(1);

  return row?.backgroundMediaId ?? null;
});
