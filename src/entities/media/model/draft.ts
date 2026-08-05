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
  thumbnail: Blob;
  previewUrl: string;
  mime: string;
  width: number;
  height: number;
  durationMs: Nullable<number>;
  id: string;
};
