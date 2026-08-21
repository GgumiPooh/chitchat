import type { MediaUpload } from "@/entities/media";
import type { Participant } from "@/entities/user";
import { request } from "@/shared/api";
import { PROFILE_PATH } from "@/shared/config";
import type { Nullable } from "@/shared/lib";

/**
 * REQUIREMENTS.md § 12. An absent key keeps what the row holds; `avatar: null` removes
 * the photo.
 *
 * WARN: The finished restructure. `avatar` / `profileBackground` carry what
 * `uploadDraft` put in R2, not an id — registration and attachment happen inside this
 * request now, so there is no earlier id to send.
 */
export type ProfileBody = {
  nickname?: string;
  avatar?: Nullable<MediaUpload>;
  /** REQUIREMENTS.md § 12.1. The profile cover, edited in this sheet beside the avatar. */
  profileBackground?: Nullable<MediaUpload>;
  /** REQUIREMENTS.md § 8.12. The 입력 중 표시 switch, reached through `@x/typing-indicator`. */
  typingIndicatorEnabled?: boolean;
};

export async function updateProfile(body: ProfileBody): Promise<Participant> {
  const response = await request(PROFILE_PATH, {
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
