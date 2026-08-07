import type { MediaDraft } from "@/entities/media";

/**
 * Frees the blob a staged attachment was drawn from.
 *
 * INFO: REQUIREMENTS.md § 9.1. A file attachment owns no object URL — nothing draws
 * it, so there was never a blob for the tray or the optimistic bubble to hold.
 */
export function revokePreview({ previewUrl }: MediaDraft) {
  if (previewUrl) {
    URL.revokeObjectURL(previewUrl);
  }
}
