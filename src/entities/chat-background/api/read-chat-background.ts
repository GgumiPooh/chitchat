import "server-only";

import { chatSettings, getDb, media } from "@/shared/db";
import type { Nullable } from "@/shared/lib";
import { eq } from "drizzle-orm";
import { cache } from "react";

/** REQUIREMENTS.md § 12.2. The wallpaper both participants see. */
export type ChatBackground = {
  mediaId: string;
  /**
   * REQUIREMENTS.md § 9. The object's stored hash, carried beside the id because its
   * DC term is the photo's average colour — which is what the chat route's chrome is
   * tinted with (§ 12.2., `useChromeTint`) without downloading anything.
   */
  blurhash: Nullable<string>;
};

/**
 * REQUIREMENTS.md § 12.2. The wallpaper both participants see, or `null` for the
 * flat `chat-canvas`.
 *
 * INFO: `cache()`d for the same reason `getSessionContext` is — the `(main)` shell
 * seeds the stream provider with it, the chat screen reads it again to emit the
 * § 12.2. preload, and the Settings row reads it a third time. One request, one
 * query.
 *
 * INFO: An inner join, so a cleared wallpaper and a missing `media` row answer the
 * same `null`. The FK is `ON DELETE SET NULL`, so the second cannot happen.
 */
export const readChatBackground = cache(async (): Promise<Nullable<ChatBackground>> => {
  const [row] = await getDb()
    .select({ mediaId: chatSettings.backgroundMediaId, blurhash: media.blurhash })
    .from(chatSettings)
    .innerJoin(media, eq(media.id, chatSettings.backgroundMediaId))
    .limit(1);

  return row?.mediaId ? { mediaId: row.mediaId, blurhash: row.blurhash } : null;
});

// INFO: The chat page reads only the id, to emit the § 12.2. preload — it draws nothing itself, so the hash beside it would be a value it hands to nobody.
export async function readChatBackgroundMediaId(): Promise<Nullable<string>> {
  return (await readChatBackground())?.mediaId ?? null;
}
