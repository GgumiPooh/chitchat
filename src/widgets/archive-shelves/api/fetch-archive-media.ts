import type { ArchiveMedia } from "@/entities/media";
import { request } from "@/shared/api";
import { ARCHIVE_PATH, type LibraryKind } from "@/shared/config";

export type FetchArchiveMediaParams = {
  /** Which segment is being paged (REQUIREMENTS.md § 10.); the server answers 400 for a value it does not know. */
  kind?: LibraryKind;
  before?: { createdAt: string; id: string };
  /** REQUIREMENTS.md § 10. The window's first tile — the page directly newer than it, for upward paging out of a jumped window. */
  after?: { createdAt: string; id: string };
  /** REQUIREMENTS.md § 10. A `media` id to centre the window on, for the position jump. */
  around?: string;
};

/** One page of one library segment — the one after `before`, before `after`, or `around` a given tile (REQUIREMENTS.md § 10.). */
export async function fetchArchiveMedia({
  kind,
  before,
  after,
  around,
}: FetchArchiveMediaParams = {}): Promise<ArchiveMedia[]> {
  const query = new URLSearchParams();

  if (kind) {
    query.set("kind", kind);
  }

  if (around) {
    query.set("around", around);
  }

  if (before) {
    // WARN: Both halves, always. The server rejects a half cursor rather than silently paginating on the timestamp alone, which would skip an image of a multi-photo send (§ 6.).
    query.set("beforeCreatedAt", before.createdAt);
    query.set("beforeId", before.id);
  }

  // WARN: Both halves here too, and the server rejects a half of this cursor for the same reason (§ 6.).
  if (after) {
    query.set("afterCreatedAt", after.createdAt);
    query.set("afterId", after.id);
  }

  const response = await request(`${ARCHIVE_PATH}?${query}`);

  if (!response.ok) {
    throw new Error(`GET ${ARCHIVE_PATH} responded ${response.status}`);
  }

  const { media } = (await response.json()) as { media: ArchiveMedia[] };

  return media;
}
