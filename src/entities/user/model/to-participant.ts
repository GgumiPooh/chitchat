import { isVideoMime } from "@/shared/config";
import type { User } from "@/shared/db";
import type { Nullable } from "@/shared/lib";
import { resolveDisplayName } from "./display-name";
import type { Participant } from "./types";

// WARN: `typingIndicatorEnabled` is deliberately absent, and must stay absent. It is the owner's private setting (REQUIREMENTS.md § 8.12.), and shipping it would tell the other participant that this person turned the indicator off — which is precisely what turning it off is meant to withhold.
// INFO: REQUIREMENTS.md § 12.2. The chat wallpaper is absent because it is not a property of a user at all any more — it is conversation-wide, and `GET /api/users` ships it beside this set rather than inside it.
export type ParticipantSource = Pick<
  User,
  "id" | "email" | "nickname" | "avatarMediaId" | "profileBackgroundMediaId" | "lastReadMessageId"
> & {
  /** WARN: REQUIREMENTS.md § 12.1. Joined from `media`, not held on `users` — the caller resolves it, because a cover may be a video and the renderer has to pick an element before it fetches anything. */
  profileBackgroundMime: Nullable<string>;
};

export function toParticipant(user: ParticipantSource): Participant {
  return {
    id: user.id,
    name: resolveDisplayName(user),
    avatarMediaId: user.avatarMediaId,
    profileBackgroundMediaId: user.profileBackgroundMediaId,
    isProfileBackgroundVideo: isVideoMime(user.profileBackgroundMime ?? ""),
    lastReadMessageId: user.lastReadMessageId,
  };
}
