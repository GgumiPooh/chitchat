import "server-only";

import { toChatMedia, type ChatMedia } from "@/entities/media/@x/time-letter";
import { getDb, letterMedia, media } from "@/shared/db";
import type { TimeLetterId } from "@/shared/lib";
import type { DbTransaction } from "@/shared/storage";
import { asc, eq, inArray } from "drizzle-orm";

// INFO: Batch fetches attached media items for multiple letters in a single query.
export async function listLettersMedia(
  letterIds: TimeLetterId[],
  tx?: DbTransaction,
): Promise<Map<TimeLetterId, ChatMedia[]>> {
  const byLetter = new Map<TimeLetterId, ChatMedia[]>();

  if (letterIds.length === 0) {
    return byLetter;
  }

  const db = tx ?? getDb();
  const rows = await db
    .select({
      letterId: letterMedia.letterId,
      media,
    })
    .from(letterMedia)
    .innerJoin(media, eq(letterMedia.mediaId, media.id))
    .where(inArray(letterMedia.letterId, letterIds))
    .orderBy(asc(letterMedia.letterId), asc(letterMedia.sortOrder));

  for (const row of rows) {
    const list = byLetter.get(row.letterId) ?? [];
    list.push(toChatMedia(row.media));
    byLetter.set(row.letterId, list);
  }

  return byLetter;
}
