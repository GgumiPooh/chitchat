import type { Media } from "@/shared/db";
import { toChatMedia } from "./to-chat-media";
import type { GalleryMedia } from "./types";

export function toGalleryMedia(row: Media): GalleryMedia {
  return { ...toChatMedia(row), createdAt: row.createdAt.toISOString() };
}
