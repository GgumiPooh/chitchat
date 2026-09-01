import "server-only";

import { media } from "@/shared/db";
import type { MediaId, UserId } from "@/shared/lib";
import type { DbTransaction } from "@/shared/storage";
import { and, eq, inArray, isNull } from "drizzle-orm";
import { toArchiveMedia } from "../model/to-archive-media";
import type { ArchiveMedia } from "../model/types";
import { findOldestSendingMessages, isInLibrary } from "./list-archive-media";

/**
 * REQUIREMENTS.md § 10.x. 채팅으로 보내기's resolve half — takes the ids a re-send
 * named and hands back only the ones `senderId` may actually re-attach, so the
 * caller can refuse the whole request rather than post a bubble half-filled with
 * ids that did not check out.
 *
 * WARN: `isInLibrary` is the same predicate the shelf itself is drawn from — not
 * merely "not deleted", but "carried by a message this sender can already see". A
 * profile avatar or a background never satisfies it (neither is ever attached
 * through `message_media`), so the scope check beside it is belt and braces.
 *
 * WARN: `expires_at IS NULL` excludes an Ask AI attachment still inside its
 * retention window. It renders in the shelf like any other tile while it lasts,
 * but reclaim can soft-delete it out from under a message that is not the one that
 * asked — re-attaching it would post a bubble whose photo is due to vanish on a
 * clock its own sender never set.
 *
 * WARN: Run inside the caller's own transaction, on the caller's own `tx` — a
 * separate read here would let the id it approves be deleted before the same
 * request's `messageMedia` insert lands.
 */
export async function resolveReferencedMedia(
  tx: DbTransaction,
  ids: MediaId[],
  senderId: UserId,
): Promise<Map<MediaId, ArchiveMedia>> {
  if (ids.length === 0) {
    return new Map();
  }

  const rows = await tx
    .select()
    .from(media)
    .where(
      and(
        inArray(media.id, ids),
        eq(media.scope, "chat"),
        isNull(media.expiresAt),
        isInLibrary(senderId),
      ),
    );

  if (rows.length === 0) {
    return new Map();
  }

  const origins = await findOldestSendingMessages(
    rows.map((row) => row.id),
    senderId,
    tx,
  );

  return new Map(rows.map((row) => [row.id, toArchiveMedia(row, origins.get(row.id) ?? null)]));
}
