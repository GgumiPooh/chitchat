import type { Nullable } from "@/shared/lib";

/**
 * A media object as it crosses the API. It carries no URL — REQUIREMENTS.md § 9.
 * mints a presigned one per request behind `GET /api/media/{id}`, so a URL on the
 * wire would be expired by the time anything reused it.
 */
export type ChatMedia = {
  mime: string;
  // INFO: REQUIREMENTS.md § 8.3. What the virtualizer reserves the row's box from, before the asset loads.
  // WARN: Both zero on a file attachment (§ 9.1.) **and on a voice message** (§ 9.3.) — neither has a box to measure. Read `filename` and `voice` first, or either lands as a `0 / 0` aspect ratio. Both are drawn at a fixed height instead.
  width: number;
  height: number;
  /** REQUIREMENTS.md § 9.3. The running time a voice player draws its progress against, and a video cell its badge. */
  durationMs: Nullable<number>;
  blurhash: Nullable<string>;
  /**
   * REQUIREMENTS.md § 9.1. The name a file attachment was sent under, and the
   * discriminator that says it is one — `null` for every photo and video.
   */
  filename: Nullable<string>;
  /**
   * REQUIREMENTS.md § 9.3. Set on a voice message and the flag that says it is
   * one — the same job `filename` does for a file attachment.
   *
   * WARN: `null` on everything else, never `{ peaks: [] }`. Every reader tests it
   * for truthiness, so an empty track renders a photo bubble as a voice card.
   *
   * WARN: The peaks are `0`–`1` here and `0`–`VOICE_PEAK_SCALE` integers in the
   * column. `toChatMedia` is the one place that converts, so nothing downstream
   * has to know the storage scale.
   */
  voice: Nullable<{ peaks: number[] }>;
  // INFO: § 9.1. The file card names its own size, which is the only thing it can say about a document it cannot draw.
  size: number;
  id: string;
};

/**
 * A library tile (REQUIREMENTS.md § 10.). The same object as `ChatMedia` plus the
 * instant it was taken in, which is both the month section header and the second
 * half of the keyset cursor (§ 6.).
 */
export type ArchiveMedia = ChatMedia & {
  createdAt: string;
};
