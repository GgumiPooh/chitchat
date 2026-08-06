import "server-only";

import { getDb, users } from "@/shared/db";
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
  /** REQUIREMENTS.md § 8.12. Whether this user broadcasts 입력 중 at all. */
  typingIndicatorEnabled?: boolean;
};

export type ProfileUpdate = {
  participant: Participant;
  /**
   * The photo this change detached, for the caller to take back out of R2.
   *
   * INFO: Handed up rather than cleaned up here — the objects belong to
   * `entities/media`, and one entity may not reach into another (REQUIREMENTS.md
   * § 2.). The route that composes the two is where the two meet.
   */
  replacedAvatarMediaId: Nullable<string>;
};

/**
 * Writes the nickname and avatar the user owns (REQUIREMENTS.md § 12.).
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
  typingIndicatorEnabled,
}: UpdateUserProfileParams): Promise<Maybe<ProfileUpdate>> {
  // WARN: A self-join, so the photo being replaced is read in the same statement that replaces it. Postgres resolves `previous` against the pre-update snapshot, which a separate `SELECT` cannot promise: two devices saving different photos would both read the same row and neither would report the one that lost, orphaning its objects in R2 permanently — `canReadMedia` admits only a currently worn avatar, so nothing could ever reach them again.
  const previous = alias(users, "previous");
  const [row] = await getDb()
    .update(users)
    // WARN: Spread, never `{ nickname, avatarMediaId }` — drizzle writes an explicit `undefined` as SQL `DEFAULT`, so a patch that only renames would blank the avatar.
    .set({
      ...(nickname === undefined ? {} : { nickname }),
      ...(avatarMediaId === undefined ? {} : { avatarMediaId }),
      ...(typingIndicatorEnabled === undefined ? {} : { typingIndicatorEnabled }),
    })
    .from(previous)
    .where(and(eq(users.id, userId), eq(previous.id, userId)))
    .returning({
      id: users.id,
      email: users.email,
      nickname: users.nickname,
      avatarMediaId: users.avatarMediaId,
      lastReadAt: users.lastReadAt,
      previousAvatarMediaId: previous.avatarMediaId,
    });

  if (!row) {
    return undefined;
  }

  return {
    participant: toParticipant(row),
    // INFO: Only a photo that is actually gone is handed back. Re-submitting the same id is a no-op, and its object is still the one being worn.
    replacedAvatarMediaId:
      row.previousAvatarMediaId && row.previousAvatarMediaId !== row.avatarMediaId
        ? row.previousAvatarMediaId
        : null,
  };
}
