import type { User } from "@/shared/db";
import { resolveDisplayName } from "./display-name";
import type { Participant } from "./types";

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
