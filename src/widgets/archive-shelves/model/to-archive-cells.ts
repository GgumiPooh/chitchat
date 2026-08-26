import type { ArchiveMedia } from "@/entities/media";
import { isVideoMime, toMediaDownloadUrl, toMediaUrl } from "@/shared/config";
import { idToDate } from "@/shared/lib";
import type { MediaCell } from "@/shared/ui";

/** What the tile and the viewer of DESIGN.md § 7.10. render one library row as. */
export function toArchiveCells(media: ArchiveMedia[]): MediaCell[] {
  return media.map((item) => ({
    previewUrl: toMediaUrl(item.id),
    blurhash: item.blurhash,
    originalUrl: toMediaUrl(item.id, "original"),
    downloadUrl: toMediaDownloadUrl(item.id),
    width: item.width,
    height: item.height,
    durationMs: item.durationMs,
    isVideo: isVideoMime(item.mime),
    // INFO: REQUIREMENTS.md § 9.1. Carried rather than nulled, so the cell says what it is — 공유 and 저장 name the file by it.
    // WARN: The grid draws a thumbnail unconditionally, so `isInLibrary`'s `filename IS NULL` is the only thing keeping a file attachment out of it. Relaxing that predicate needs the § 6.5. card here first; a file reaching a tile is a broken image, not a fallback.
    filename: item.filename,
    sizeBytes: item.size,
    isDeleted: item.isDeleted,
    // INFO: REQUIREMENTS.md § 10. What 대화에서 보기 needs; null for a row uploaded straight into the library, which was never sent (§ 10.).
    messageId: item.messageId,
    // INFO: DESIGN.md § 7.10. The viewer's caption, read off the id (the finished restructure) — the row carries no separate instant to copy.
    sentAt: idToDate(item.id).toISOString(),
    // INFO: DESIGN.md § 7.10. The name above that caption. It rides the query that already resolves `messageId` (REQUIREMENTS.md § 10.), so naming the sender costs a primary-key lookup rather than a listing of its own — and it is `null` on exactly the rows `messageId` is, a library-only upload having nobody to name.
    senderName: item.senderName,
    onlyMe: item.onlyMe,
    id: item.id,
  }));
}
