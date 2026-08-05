import type { GalleryMedia } from "@/entities/media";
import { GALLERY_PATH } from "@/shared/config";

export type FetchGalleryMediaParams = {
  before?: { createdAt: string; id: string };
};

/** One older page of the gallery (REQUIREMENTS.md § 10.). */
export async function fetchGalleryMedia({ before }: FetchGalleryMediaParams = {}): Promise<
  GalleryMedia[]
> {
  const query = new URLSearchParams();

  if (before) {
    // WARN: Both halves, always. The server rejects a half cursor rather than silently paginating on the timestamp alone, which would skip an image of a multi-photo send (§ 6.).
    query.set("beforeCreatedAt", before.createdAt);
    query.set("beforeId", before.id);
  }

  const response = await fetch(`${GALLERY_PATH}?${query}`);

  if (!response.ok) {
    throw new Error(`GET ${GALLERY_PATH} responded ${response.status}`);
  }

  const { media } = (await response.json()) as { media: GalleryMedia[] };

  return media;
}
