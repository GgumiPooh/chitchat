import type { ArchiveMedia } from "@/entities/media";
import { request } from "@/shared/api";
import { ARCHIVE_PATH, type LibraryShelf } from "@/shared/config";

export type FetchArchiveMediaParams = {
  /** Which segment is being paged (REQUIREMENTS.md § 10.); the server answers 400 for a value it does not know. */
  shelf?: LibraryShelf;
  /** REQUIREMENTS.md § 10. The last tile of the loaded window — the page directly older than it. One `media` id, since an id is the shelf's whole ordering (RESTRUCTURE.md § 3.4.). */
  before?: string;
  /** REQUIREMENTS.md § 10. The window's first tile — the page directly newer than it, for upward paging out of a jumped window. */
  after?: string;
  /** REQUIREMENTS.md § 10. A `media` id to centre the window on, for the position jump. */
  around?: string;
};

/** One page of one library segment — the one after `before`, before `after`, or `around` a given tile (REQUIREMENTS.md § 10.). */
export async function fetchArchiveMedia({
  shelf,
  before,
  after,
  around,
}: FetchArchiveMediaParams = {}): Promise<ArchiveMedia[]> {
  const query = new URLSearchParams();

  if (shelf) {
    query.set("shelf", shelf);
  }

  if (around) {
    query.set("around", around);
  }

  if (before) {
    query.set("before", before);
  }

  if (after) {
    query.set("after", after);
  }

  const response = await request(`${ARCHIVE_PATH}?${query}`);

  if (!response.ok) {
    throw new Error(`GET ${ARCHIVE_PATH} responded ${response.status}`);
  }

  const { media } = (await response.json()) as { media: ArchiveMedia[] };

  return media;
}
