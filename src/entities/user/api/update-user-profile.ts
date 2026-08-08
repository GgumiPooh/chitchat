import "server-only";

import { getDb, media, users } from "@/shared/db";
import type { Maybe, Nullable } from "@/shared/lib";
import { and, eq } from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";
import { toParticipant } from "../model/to-participant";
import type { Participant } from "../model/types";

export type UpdateUserProfileParams = {
  userId: string;
  nickname?: string;
  /** REQUIREMENTS.md § 12. Absent keeps the current photo; an explicit `null` removes it. */
  avatarMediaId?: Nullable<string>;
  /** REQUIREMENTS.md § 12.1. The profile cover. Same absent/`null` contract as the avatar. */
  profileBackgroundMediaId?: Nullable<string>;
  /** REQUIREMENTS.md § 8.12. Whether this user broadcasts 입력 중 at all. */
  typingIndicatorEnabled?: boolean;
};

/**
 * The photos this change detached, for the caller to take back out of R2, keyed by
 * the scope each one has to be discarded under.
 *
 * INFO: Handed up rather than cleaned up here — the objects belong to
 * `entities/media`, and one entity may not reach into another (REQUIREMENTS.md
 * § 2.). The route that composes the two is where the two meet.
 *
 * WARN: § 12.2. `background` is a bare id and is **not** safe to discard on sight.
 * The chat wallpaper shares the `background/` scope from a table this function
 * cannot see, so the route asks `isMediaWorn` before deleting anything — a guard
 * that used to be a row-local comparison here and could not survive the move.
 */
export type ReplacedMedia = {
  avatar: Nullable<string>;
  background: Nullable<string>;
};

export type ProfileUpdate = {
  participant: Participant;
  replaced: ReplacedMedia;
};

/**
 * Writes the nickname, avatar and profile cover the user owns (REQUIREMENTS.md
 * § 12.). The chat wallpaper is **not** here — § 12.2. made it conversation-wide, so
 * it lives in `chat_settings` and is written through its own route.
 *
 * INFO: Nothing broadcasts. The UPDATE lands on `users`, so § 6.'s trigger fires
 * `user_changed` and § 8.4. delivers it to every open screen — including this
 * user's other devices. A rename therefore reaches every past message, which
 * § 8.7. says is the point.
 */
export async function updateUserProfile({
  userId,
  nickname,
  avatarMediaId,
  profileBackgroundMediaId,
  typingIndicatorEnabled,
}: UpdateUserProfileParams): Promise<Maybe<ProfileUpdate>> {
  // WARN: A self-join, so the photos being replaced are read in the same statement that replaces them. Postgres resolves `previous` against the pre-update snapshot, which a separate `SELECT` cannot promise: two devices saving different photos would both read the same row and neither would report the one that lost, orphaning its objects in R2 permanently — `canReadMedia` admits only a currently worn photo, so nothing could ever reach them again.
  const previous = alias(users, "previous");
  const [row] = await getDb()
    .update(users)
    // WARN: Spread, never `{ nickname, avatarMediaId }` — drizzle writes an explicit `undefined` as SQL `DEFAULT`, so a patch that only renames would blank every other column here.
    .set({
      ...(nickname === undefined ? {} : { nickname }),
      ...(avatarMediaId === undefined ? {} : { avatarMediaId }),
      ...(profileBackgroundMediaId === undefined ? {} : { profileBackgroundMediaId }),
      ...(typingIndicatorEnabled === undefined ? {} : { typingIndicatorEnabled }),
    })
    .from(previous)
    .where(and(eq(users.id, userId), eq(previous.id, userId)))
    .returning({
      id: users.id,
      email: users.email,
      nickname: users.nickname,
      avatarMediaId: users.avatarMediaId,
      profileBackgroundMediaId: users.profileBackgroundMediaId,
      lastReadAt: users.lastReadAt,
      previousAvatarMediaId: previous.avatarMediaId,
      previousProfileBackgroundMediaId: previous.profileBackgroundMediaId,
    });

  if (!row) {
    return undefined;
  }

  return {
    // WARN: A second read, because `.returning()` cannot join. It is one indexed lookup on a primary key, and only when a cover is actually set — the alternative is shipping a participant whose `isProfileBackgroundVideo` is a guess.
    participant: toParticipant({
      ...row,
      profileBackgroundMime: await readMime(row.profileBackgroundMediaId),
    }),
    replaced: {
      avatar: toReplaced(row.previousAvatarMediaId, row.avatarMediaId),
      background: toReplaced(row.previousProfileBackgroundMediaId, row.profileBackgroundMediaId),
    },
  };
}

async function readMime(mediaId: Nullable<string>): Promise<Nullable<string>> {
  if (!mediaId) {
    return null;
  }

  const [row] = await getDb()
    .select({ mime: media.mime })
    .from(media)
    .where(eq(media.id, mediaId))
    .limit(1);

  return row?.mime ?? null;
}

// INFO: Only a photo that is actually gone is handed back. Re-submitting the same id is a no-op, and its object is still the one being worn.
function toReplaced(before: Nullable<string>, after: Nullable<string>): Nullable<string> {
  return before && before !== after ? before : null;
}
