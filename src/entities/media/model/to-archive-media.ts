import type { Media } from "@/shared/db";
import type { Nullable } from "@/shared/lib";
import { toChatMedia } from "./to-chat-media";
import type { ArchiveMedia } from "./types";

// INFO: REQUIREMENTS.md § 10. `messageId` defaults to null because the row a registration answers with has no message yet — the send that will carry it has not been posted.
export function toArchiveMedia(row: Media, messageId: Nullable<number> = null): ArchiveMedia {
  return { ...toChatMedia(row), createdAt: row.createdAt.toISOString(), messageId };
}
