import type { ArchiveMedia } from "@/entities/media";
import { request } from "@/shared/api";
import { ARCHIVE_PATH, type LibraryKind } from "@/shared/config";

export type FetchArchiveMediaParams = {
  /** Which segment is being paged (REQUIREMENTS.md § 10.); the server answers 400 for a value it does not know. */
  kind?: LibraryKind;
  before?: { createdAt: string; id: string };
};

/** One older page of one library segment (REQUIREMENTS.md § 10.). */
export async function fetchArchiveMedia({ kind, before }: FetchArchiveMediaParams = {}): Promise<
  ArchiveMedia[]
> {
  const query = new URLSearchParams();

  if (kind) {
    query.set("kind", kind);
  }

  if (before) {
    // WARN: Both halves, always. The server rejects a half cursor rather than silently paginating on the timestamp alone, which would skip an image of a multi-photo send (§ 6.).
    query.set("beforeCreatedAt", before.createdAt);
    query.set("beforeId", before.id);
  }

  const response = await request(`${ARCHIVE_PATH}?${query}`);

  if (!response.ok) {
    throw new Error(`GET ${ARCHIVE_PATH} responded ${response.status}`);
  }

  const { media } = (await response.json()) as { media: ArchiveMedia[] };

  return media;
}
