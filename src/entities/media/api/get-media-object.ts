import "server-only";

import type { MediaVariant } from "@/shared/config";
import { getDb, media, messageMedia, messages, type Media } from "@/shared/db";
import type { Nullable } from "@/shared/lib";
import { toThumbKey } from "@/shared/storage";
import { and, eq, inArray, isNull } from "drizzle-orm";

export async function getMediaRow(id: string): Promise<Nullable<Media>> {
  const [row] = await getDb().select().from(media).where(eq(media.id, id)).limit(1);

  return row ?? null;
}

/**
 * Whether every one of `ids` is a registered object belonging to `ownerId`.
 *
 * WARN: `message_media.media_id` carries a foreign key, so an id that is a
 * well-formed UUID and nothing else turns the attach into a Postgres error the
 * caller surfaces as a 500. The ownership half is what stops one user hanging
 * another user's objects off their own bubble.
 */
export async function ownsAllMedia(ids: string[], ownerId: string): Promise<boolean> {
  if (ids.length === 0) {
    return false;
  }

  const rows = await getDb()
    .select({ id: media.id })
    .from(media)
    .where(and(inArray(media.id, ids), eq(media.ownerId, ownerId)));

  return new Set(rows.map((row) => row.id)).size === new Set(ids).size;
}

/**
 * Whether `userId` may read this object.
 *
 * WARN: A signed-in session is not by itself the answer. Every conversation
 * message is visible to both participants (REQUIREMENTS.md § 6.), but the key
 * scopes already reach past chat — an `avatar` or `emoticon` object nobody has
 * posted is reachable by id alone without this, and the gallery of § 18. #1 makes
 * that a real leak rather than a theoretical one.
 */
export async function canReadMedia(row: Media, userId: string): Promise<boolean> {
  if (row.ownerId === userId) {
    return true;
  }

  const [shared] = await getDb()
    .select({ messageId: messageMedia.messageId })
    .from(messageMedia)
    .innerJoin(messages, eq(messages.id, messageMedia.messageId))
    .where(and(eq(messageMedia.mediaId, row.id), isNull(messages.deletedAt)))
    .limit(1);

  return Boolean(shared);
}

export function toVariantKey(row: Media, variant: MediaVariant): string {
  return variant === "original" ? row.r2Key : toThumbKey(row.r2Key);
}
