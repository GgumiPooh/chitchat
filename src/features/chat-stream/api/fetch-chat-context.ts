import type { Participant } from "@/entities/user";
import { request } from "@/shared/api";
import { USERS_PATH } from "@/shared/config";
import type { Nullable } from "@/shared/lib";

/**
 * REQUIREMENTS.md § 8.4. Everything a `user_changed` event invalidates, in one
 * payload — the participant set and the § 12.2. wallpaper that is drawn behind the
 * whole conversation rather than owned by either of them.
 */
export type ChatContext = {
  participants: Participant[];
  chatBackgroundMediaId: Nullable<string>;
};

export async function fetchChatContext(): Promise<ChatContext> {
  const response = await request(USERS_PATH);

  if (!response.ok) {
    throw new Error(`GET ${USERS_PATH} responded ${response.status}`);
  }

  const { users, chatBackgroundMediaId } = (await response.json()) as {
    users: Participant[];
    chatBackgroundMediaId: Nullable<string>;
  };

  return { participants: users, chatBackgroundMediaId };
}
