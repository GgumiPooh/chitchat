import type { ThumbnailMime } from "@/shared/config";
import type { Nullable } from "@/shared/lib";

/**
 * An attachment the user has picked but not yet sent. It lives entirely in the
 * browser — the bytes reach R2 only when the message is sent (REQUIREMENTS.md § 9.).
 *
 * WARN: `previewUrl` is an object URL. Whoever drops a draft revokes it, or the
 * blob stays resident for the life of the document.
 */
export type MediaDraft = {
  file: File;
  // INFO: REQUIREMENTS.md § 9. Uploaded alongside the original as `{key}_thumb`; for a video it is the poster frame.
  // INFO: § 9.1. Null for a file attachment, which has nothing to render a thumbnail from — the pair of PUTs is a single one there.
  thumbnail: Nullable<Blob>;
  /**
   * REQUIREMENTS.md § 9. What `thumbnail` was actually encoded as, and what the
   * upload ticket is asked to sign the `_thumb` PUT for.
   *
   * WARN: Carried rather than assumed, because AVIF is not always what comes out —
   * an engine with no AVIF encoder falls back to JPEG, and a presigned PUT pins
   * `Content-Type`, so a fallback that went unreported would store JPEG bytes under
   * an AVIF signature.
   */
  thumbnailMime: Nullable<ThumbnailMime>;
  previewUrl: Nullable<string>;
  mime: string;
  width: number;
  height: number;
  durationMs: Nullable<number>;
  /**
   * REQUIREMENTS.md § 9. The placeholder `ChatMedia.blurhash` is registered with,
   * encoded in the browser because the server never sees the bytes (§ 9.).
   *
   * WARN: It describes `thumbnail` and nothing else — see `renderThumbnail`, which
   * is the only thing that produces one.
   *
   * INFO: § 9.1., § 9.3. Null for a file attachment and for a recording, neither of
   * which has a thumbnail to stand in for or a drawn box to stand in it.
   */
  blurhash: Nullable<string>;
  /** REQUIREMENTS.md § 9.1. Set on a file attachment and null on a photo or video, exactly as `ChatMedia.filename` is. */
  filename: Nullable<string>;
  /**
   * REQUIREMENTS.md § 9.3. Set on a recording and null on everything else — what
   * makes this draft a voice message, and what the row is registered with.
   *
   * WARN: Integers `0`–`VOICE_PEAK_SCALE`, the **wire and column** form, not the
   * `0`–`1` the player draws. A draft is an upload object, so it carries what the
   * upload sends; `toVoiceTrack` is what converts it for anything that renders.
   */
  waveformPeaks: Nullable<number[]>;
  id: string;
};
