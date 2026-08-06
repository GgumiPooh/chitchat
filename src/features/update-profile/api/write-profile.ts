import type { Participant } from "@/entities/user";
import { PROFILE_PATH } from "@/shared/config";
import type { Nullable } from "@/shared/lib";

/** REQUIREMENTS.md § 12. An absent key keeps what the row holds; `avatarMediaId: null` removes the photo. */
export type ProfileBody = {
  nickname?: string;
  avatarMediaId?: Nullable<string>;
  /** REQUIREMENTS.md § 8.12. The 입력 중 표시 switch, reached through `@x/typing-indicator`. */
  typingIndicatorEnabled?: boolean;
};

export async function updateProfile(body: ProfileBody): Promise<Participant> {
  const response = await fetch(PROFILE_PATH, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });

  if (!response.ok) {
    throw new Error(`PATCH ${PROFILE_PATH} responded ${response.status}`);
  }

  const { user } = (await response.json()) as { user: Participant };

  return user;
}
