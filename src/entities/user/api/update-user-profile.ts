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
  /** REQUIREMENTS.md § 12.2. The chat wallpaper. `null` puts the room back on the flat `chat-canvas`. */
  chatBackgroundMediaId?: Nullable<string>;
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
 */
export type ReplacedMedia = {
  avatar: Nullable<string>;
  background: string[];
};

export type ProfileUpdate = {
  participant: Participant;
  replaced: ReplacedMedia;
};

/**
 * Writes the nickname, avatar and backgrounds the user owns (REQUIREMENTS.md § 12.).
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
  chatBackgroundMediaId,
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
      ...(chatBackgroundMediaId === undefined ? {} : { chatBackgroundMediaId }),
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
      chatBackgroundMediaId: users.chatBackgroundMediaId,
      lastReadAt: users.lastReadAt,
      previousAvatarMediaId: previous.avatarMediaId,
      previousProfileBackgroundMediaId: previous.profileBackgroundMediaId,
      previousChatBackgroundMediaId: previous.chatBackgroundMediaId,
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
      // WARN: Both backgrounds discard under the one `background/` scope, so they are collected together — and a photo still worn in the other slot MUST NOT be in this list. Setting one image as both cover and wallpaper and then changing only the cover would otherwise delete the object the wallpaper is still drawn from.
      // WARN: Deduplicated, because one id can be in both slots — `ownsAllMedia` checks owner and scope, and the two columns share the `background` scope, so a patch that moves both off the same photo yields it twice. The route runs one `discardScopedMedia` per entry under `Promise.all`, which would put two concurrent `DELETE … RETURNING` on one row and leave the loser's outcome to Postgres.
      background: [
        ...new Set(
          [
            toReplaced(row.previousProfileBackgroundMediaId, row.profileBackgroundMediaId),
            toReplaced(row.previousChatBackgroundMediaId, row.chatBackgroundMediaId),
          ].filter((id): id is string => id !== null && !isStillWorn(id, row)),
        ),
      ],
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

function isStillWorn(
  id: string,
  row: Pick<
    typeof users.$inferSelect,
    "avatarMediaId" | "profileBackgroundMediaId" | "chatBackgroundMediaId"
  >,
): boolean {
  return (
    id === row.avatarMediaId ||
    id === row.profileBackgroundMediaId ||
    id === row.chatBackgroundMediaId
  );
}
