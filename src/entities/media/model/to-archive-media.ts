import type { Media } from "@/shared/db";
import { toChatMedia } from "./to-chat-media";
import type { ArchiveMedia } from "./types";

export function toArchiveMedia(row: Media): ArchiveMedia {
  return { ...toChatMedia(row), createdAt: row.createdAt.toISOString() };
}
