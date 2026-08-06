import "server-only";

import type { MediaUploadScope, MediaVariant } from "@/shared/config";
import { getDb, media, messageMedia, messages, users, type Media } from "@/shared/db";
import type { Nullable } from "@/shared/lib";
import { toScopePrefix, toThumbKey } from "@/shared/storage";
import { and, eq, inArray, isNull, like, or } from "drizzle-orm";

export async function getMediaRow(id: string): Promise<Nullable<Media>> {
  const [row] = await getDb().select().from(media).where(eq(media.id, id)).limit(1);

  return row ?? null;
}

/**
 * Whether every one of `ids` is a registered object belonging to `ownerId` and
 * uploaded under `scope`.
 *
 * WARN: `message_media.media_id` carries a foreign key, so an id that is a
 * well-formed UUID and nothing else turns the attach into a Postgres error the
 * caller surfaces as a 500. The ownership half is what stops one user hanging
 * another user's objects off their own bubble.
 *
 * WARN: The scope half is what keeps each pipeline's objects inside it, and it is
 * load-bearing in both directions. Attaching an `avatar/` object to a message
 * would put a `message_media` child under the row `discardScopedMedia` deletes on
 * the next profile change, which fails on that non-cascading key (§ 6.) and leaves
 * the user unable to change their photo at all; pointing an avatar at a `chat/`
 * object would put the same delete in front of a photo a bubble still renders.
 */
export async function ownsAllMedia(
  ids: string[],
  ownerId: string,
  scope: MediaUploadScope,
): Promise<boolean> {
  if (ids.length === 0) {
    return false;
  }

  const rows = await getDb()
    .select({ id: media.id })
    .from(media)
    .where(
      and(
        inArray(media.id, ids),
        eq(media.ownerId, ownerId),
        like(media.r2Key, `${toScopePrefix(scope, ownerId)}%`),
      ),
    );

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

  // INFO: REQUIREMENTS.md § 10. A photo put in the gallery without being sent is conversation-wide by construction — the gallery is shared, so the other participant is looking at the same grid.
  if (row.galleryAddedAt !== null) {
    return true;
  }

  const [shared] = await getDb()
    .select({ messageId: messageMedia.messageId })
    .from(messageMedia)
    .innerJoin(messages, eq(messages.id, messageMedia.messageId))
    .where(and(eq(messageMedia.mediaId, row.id), isNull(messages.deletedAt)))
    .limit(1);

  if (shared) {
    return true;
  }

  // INFO: REQUIREMENTS.md § 12. A profile photo is worn in front of the other participant by definition — it names every bubble the wearer sends (§ 8.7.). An avatar object the owner has since replaced falls back through here and stops being readable, which is what makes the swap a real one.
  return isWornOnAProfile(row.id);
}

/**
 * WARN: REQUIREMENTS.md § 12.2. `chat_background_media_id` is deliberately not one
 * of these columns. A profile cover is published to the other participant (§ 12.1.)
 * and an avatar names every bubble its wearer sends, but a chat wallpaper is only
 * ever drawn on its owner's own screen — the owner check above is the whole of its
 * authorization, and admitting it here would hand the other participant a photo
 * they were never shown.
 */
async function isWornOnAProfile(mediaId: string): Promise<boolean> {
  const [worn] = await getDb()
    .select({ id: users.id })
    .from(users)
    .where(or(eq(users.avatarMediaId, mediaId), eq(users.profileBackgroundMediaId, mediaId)))
    .limit(1);

  return Boolean(worn);
}

export function toVariantKey(row: Media, variant: MediaVariant): string {
  return variant === "original" ? row.r2Key : toThumbKey(row.r2Key);
}
