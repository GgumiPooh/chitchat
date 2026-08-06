import type { User } from "@/shared/db";
import { resolveDisplayName } from "./display-name";
import type { Participant } from "./types";

// WARN: `typingIndicatorEnabled` is deliberately absent, and must stay absent. It is the owner's private setting (REQUIREMENTS.md § 8.12.), and shipping it would tell the other participant that this person turned the indicator off — which is precisely what turning it off is meant to withhold.
export type ParticipantSource = Pick<
  User,
  "id" | "email" | "nickname" | "avatarMediaId" | "lastReadAt"
>;

export function toParticipant(user: ParticipantSource): Participant {
  return {
    id: user.id,
    name: resolveDisplayName(user),
    avatarMediaId: user.avatarMediaId,
    lastReadAt: user.lastReadAt.toISOString(),
  };
}
