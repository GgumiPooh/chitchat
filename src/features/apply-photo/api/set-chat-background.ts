import { request } from "@/shared/api";
import { CHAT_BACKGROUND_PATH } from "@/shared/config";
import type { MediaId, Nullable } from "@/shared/lib";

/**
 * REQUIREMENTS.md § 12.2. Points the room's shared wallpaper at a photo the caller
 * owns, or at `null` for the flat `chat-canvas`.
 *
 * INFO: Not a key on `PATCH /api/users/me`, and no longer reached through
 * `@x/update-profile`: the wallpaper stopped being a property of whoever set it when
 * it became shared, so it changes the other participant's screen too.
 */
export async function setChatBackground(mediaId: Nullable<MediaId>): Promise<Nullable<MediaId>> {
  const response = await request(CHAT_BACKGROUND_PATH, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ mediaId }),
  });

  if (!response.ok) {
    throw new Error(`PATCH ${CHAT_BACKGROUND_PATH} responded ${response.status}`);
  }

  const { backgroundMediaId } = (await response.json()) as {
    backgroundMediaId: Nullable<MediaId>;
  };

  return backgroundMediaId;
}
