import "server-only";

import type { MediaUploadScope, MediaVariant } from "@/shared/config";
import { chatSettings, getDb, media, messageMedia, messages, users, type Media } from "@/shared/db";
import type { MediaId, Nullable, UserId } from "@/shared/lib";
import { toScopePrefix, toThumbKey } from "@/shared/storage";
import { and, eq, inArray, isNull, like, sql, type SQL } from "drizzle-orm";

export async function getMediaRow(id: MediaId): Promise<Nullable<Media>> {
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
 *
 * WARN: REQUIREMENTS.md § 9.1., § 9.3. The set must also be **all of one kind**, and
 * this is the only place that holds — `toBubbles` splits a pick by kind in the
 * browser, which a stale client or a hand-made request simply does not run. Five
 * readers take the whole bubble's layout, height estimate, quote label and 공유
 * affordance from `media[0]` alone, so a mixed row renders a file cell through the
 * photo grid, estimates § 8.3.'s box against the wrong arithmetic, and offers a
 * document to the iOS photo library.
 *
 * WARN: § 9.3. Voice is a **third** kind, not a variety of the second. It shares
 * `filename IS NULL` with a photo, so the old two-way test passed a recording and a
 * photo in one bubble — which draws a voice card through the photo grid.
 */
export async function ownsAllMedia(
  ids: MediaId[],
  ownerId: UserId,
  scope: MediaUploadScope,
): Promise<boolean> {
  if (ids.length === 0) {
    return false;
  }

  const rows = await getDb()
    .select({ id: media.id, filename: media.filename, waveformPeaks: media.waveformPeaks })
    .from(media)
    .where(
      and(
        inArray(media.id, ids),
        eq(media.ownerId, ownerId),
        like(media.r2Key, `${toScopePrefix(scope, ownerId)}%`),
      ),
    );

  if (new Set(rows.map((row) => row.id)).size !== new Set(ids).size) {
    return false;
  }

  // INFO: § 9.3. A voice bubble is additionally always **one** clip — there is no layout for two, and nothing in the app can produce a pick of them.
  if (rows.some((row) => row.waveformPeaks !== null)) {
    return rows.length === 1;
  }

  return new Set(rows.map((row) => row.filename !== null)).size <= 1;
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

  // INFO: REQUIREMENTS.md § 10. A photo put in the library without being sent is conversation-wide by construction — the library is shared, so the other participant is looking at the same grid.
  if (row.archiveAddedAt !== null) {
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
 * object — `ownsAllMedia` checks owner and scope, and both share that scope — so
 * neither cleanup may delete a replaced id without asking whether the *other* slot
 * has since taken it. Kept as a `SQL` fragment rather than a boolean so
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
