import type { Nullable } from "@/shared/lib";

/**
 * A media object as it crosses the API. It carries no URL — REQUIREMENTS.md § 9.
 * mints a presigned one per request behind `GET /api/media/{id}`, so a URL on the
 * wire would be expired by the time anything reused it.
 */
export type ChatMedia = {
  mime: string;
  // INFO: REQUIREMENTS.md § 8.3. What the virtualizer reserves the row's box from, before the asset loads.
  width: number;
  height: number;
  durationMs: Nullable<number>;
  blurhash: Nullable<string>;
  id: string;
};

/**
 * A gallery tile (REQUIREMENTS.md § 10.). The same object as `ChatMedia` plus the
 * instant it was taken in, which is both the month section header and the second
 * half of the keyset cursor (§ 6.).
 */
export type GalleryMedia = ChatMedia & {
  createdAt: string;
};
