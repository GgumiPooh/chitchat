import "server-only";

import type { MediaVariant } from "@/shared/config";
import { chatSettings, getDb, media, messageMedia, messages, users, type Media } from "@/shared/db";
import type { MediaId, Nullable, UserId } from "@/shared/lib";
import { toThumbKey } from "@/shared/storage";
import { and, eq, isNull, sql, type SQL } from "drizzle-orm";

export async function getMediaRow(id: MediaId): Promise<Nullable<Media>> {
  const [row] = await getDb().select().from(media).where(eq(media.id, id)).limit(1);

  return row ?? null;
}

/**
 * Whether `userId` may read this object.
 *
 * WARN: A signed-in session is not by itself the answer. Every conversation
 * message is visible to both participants (REQUIREMENTS.md § 6.), but the key
 * scopes already reach past chat — an `avatar` or `emoticon` object nobody has
 * posted is reachable by id alone without this, and the library of § 18. #1 makes
 * that a real leak rather than a theoretical one.
 */
export async function canReadMedia(row: Media, userId: UserId): Promise<boolean> {
  if (row.ownerId === userId) {
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
  return isMediaWorn(row.id);
}

/**
 * Whether anything is currently drawing this object — an avatar (REQUIREMENTS.md
 * § 12.), a profile cover (§ 12.1.) or the shared chat wallpaper (§ 12.2.).
 *
 * WARN: § 12.2. The wallpaper belongs here now, and used not to. It was private to
 * its owner, so the owner check in `canReadMedia` was the whole of its
 * authorization; shared, the other participant has to be able to read the object
 * whoever set it uploaded, and without this clause they 404 on the photo behind
 * every bubble in front of them.
 *
 * WARN: One statement across both tables, not a `users` read followed by a
 * `chat_settings` one. This is `canReadMedia`'s fallthrough, which every avatar and
 * every cover the other participant fetches walks through on a cache miss — a second
 * serial round trip there is paid by each of them.
 *
 * INFO: `discardUnwornScopedMedia` expresses the same test as a `NOT EXISTS` inside
 * its DELETE rather than calling this, because a cleanup cannot afford to ask and
 * then act (§ 12.2.).
 */
export async function isMediaWorn(mediaId: MediaId): Promise<boolean> {
  const [row] = await getDb().execute<{ worn: boolean }>(
    sql`SELECT (${isWornAnywhere(mediaId)}) AS worn`,
  );

  return Boolean(row?.worn);
}

/**
 * WARN: REQUIREMENTS.md § 12.1., § 12.2. The two `background/` slots accept the same
 * object — the profile cover and the chat wallpaper share the `background/` scope —
 * so neither cleanup may delete a replaced id without asking whether the *other*
 * slot has since taken it. Kept as a `SQL` fragment rather than a boolean so
 * `discardUnwornScopedMedia` can put it **inside** its DELETE: asking and then acting
 * is two statements, and between them the other slot can take the object this one is
 * about to delete.
 *
 * WARN: The outer parentheses are load-bearing and there is no safe way to drop them.
 * This is a top-level `OR`, and every caller composes it — `not()` renders `not <frag>`
 * and `and()` joins with `AND`, both of which bind tighter than `OR`. Unparenthesized
 * inside `discardUnwornScopedMedia`'s qual it reassociated to
 * `(id AND owner AND prefix AND NOT EXISTS…) OR EXISTS…`, so discarding an object that
 * *was* still worn matched **every row in `media`** and deleted the table.
 */
export function isWornAnywhere(mediaId: MediaId): SQL {
  return sql`(EXISTS (
    SELECT 1 FROM ${users}
    WHERE ${users.avatarMediaId} = ${mediaId} OR ${users.profileBackgroundMediaId} = ${mediaId}
  ) OR EXISTS (
    SELECT 1 FROM ${chatSettings} WHERE ${chatSettings.backgroundMediaId} = ${mediaId}
  ))`;
}

export function toVariantKey(row: Media, variant: MediaVariant): string {
  return variant === "original" ? row.r2Key : toThumbKey(row.r2Key);
}
