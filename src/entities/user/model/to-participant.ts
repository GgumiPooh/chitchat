import type { User } from "@/shared/db";
import { resolveDisplayName } from "./display-name";
import type { Participant } from "./types";

// WARN: `typingIndicatorEnabled` is deliberately absent, and must stay absent. It is the owner's private setting (REQUIREMENTS.md § 8.12.), and shipping it would tell the other participant that this person turned the indicator off — which is precisely what turning it off is meant to withhold.
// WARN: `chatBackgroundMediaId` is absent for the same reason (REQUIREMENTS.md § 12.2.). Only `profileBackgroundMediaId` is published, because a profile cover is a thing the other participant is meant to open and look at (§ 12.1.).
export type ParticipantSource = Pick<
  User,
  "id" | "email" | "nickname" | "avatarMediaId" | "profileBackgroundMediaId" | "lastReadAt"
>;

export function toParticipant(user: ParticipantSource): Participant {
  return {
    id: user.id,
    name: resolveDisplayName(user),
    avatarMediaId: user.avatarMediaId,
    profileBackgroundMediaId: user.profileBackgroundMediaId,
    lastReadAt: user.lastReadAt.toISOString(),
  };
}
