import type { MediaDraft } from "@/entities/media";
import type { Maybe } from "@/shared/lib";

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

/**
 * Adds a preview URL to the set a screen frees on reset.
 *
 * INFO: REQUIREMENTS.md § 9.1. The guard is why this is a function rather than a
 * bare `add` — `previewUrl` is nullable because a file attachment owns none, and
 * every screen that keeps a set of them has to answer that the same way.
 */
export function retainPreview(urls: Set<string>, url: Maybe<string>) {
  if (url) {
    urls.add(url);
  }
}

/** The counterpart to `retainPreview`, for a URL replaced before the reset. */
export function releasePreview(urls: Set<string>, url: Maybe<string>) {
  if (url) {
    URL.revokeObjectURL(url);
    urls.delete(url);
  }
}
