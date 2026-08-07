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
  previewUrl: Nullable<string>;
  mime: string;
  width: number;
  height: number;
  durationMs: Nullable<number>;
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
