import type { Media } from "@/shared/db";
import type { MessageId, Nullable } from "@/shared/lib";
import { toChatMedia } from "./to-chat-media";
import type { ArchiveMedia } from "./types";

/** Who sent a library tile and in which message — resolved together, because one query answers both (REQUIREMENTS.md § 10.). */
export type ArchiveOrigin = {
  messageId: MessageId;
  senderName: string;
  /** REQUIREMENTS.md § 16.1. 나에게만 보내기 — `isInLibrary`'s own predicate already keeps a tile like this to its sender, so this is read off the query rather than re-derived. */
  onlyMe: boolean;
};

// INFO: REQUIREMENTS.md § 10. The origin defaults to absent because the row a registration answers with has no message yet — the send that will carry it has not been posted, so there is neither an id to jump to nor anyone to name.
export function toArchiveMedia(row: Media, origin: Nullable<ArchiveOrigin> = null): ArchiveMedia {
  return {
    ...toChatMedia(row),
    messageId: origin?.messageId ?? null,
    senderName: origin?.senderName ?? null,
    onlyMe: origin?.onlyMe ?? false,
  };
}
