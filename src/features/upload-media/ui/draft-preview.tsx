"use client";

import type { MediaDraft } from "@/entities/media";
import { isVideoMime } from "@/shared/config";
import { cn, type Nullable } from "@/shared/lib";
import { PreloadImage, PreloadVideo, Skeleton } from "@/shared/ui";
import { useEffect, useState } from "react";

export type DraftPreviewProps = {
  className?: string;
  /** The staged pick, or `null` to fall back to `src`. */
  draft: Nullable<MediaDraft>;
  /** What to show when nothing is staged — a stored object's URL, typically. */
  src?: string;
};

/**
 * What a staged pick actually looks like: a photo as an image, a video **playing**.
 *
 * INFO: A `MediaDraft`'s `previewUrl` is its poster frame, which is the right thing
 * in a 64px tray tile and the wrong thing in a preview the user is judging their
 * choice from — a still of a clip they picked for its motion reads as a failed load,
 * and reads as a black rectangle whenever the poster caught a dark first frame.
 */
export function DraftPreview({ className, draft, src }: DraftPreviewProps) {
  const isVideo = draft !== null && isVideoMime(draft.mime);
  const [sourceUrl, setSourceUrl] = useState("");

  // WARN: Minted and revoked inside one effect, never from a `useState` initializer — StrictMode runs setup → cleanup → setup while state survives, so a URL made during render is revoked by the first cleanup and the element spends the rest of its life on a dead blob.
  useEffect(() => {
    if (!draft || !isVideoMime(draft.mime)) {
      // WARN: Cleared, not merely skipped. Left standing, the string outlives the URL its own cleanup revoked — and re-staging a video renders one frame against that dead blob, which errors into the failure glyph before the new URL lands.
      // eslint-disable-next-line react-hooks/set-state-in-effect -- The object URL is external state, and dropping it is the other half of minting it.
      setSourceUrl("");

      return;
    }

    const url = URL.createObjectURL(draft.file);

    setSourceUrl(url);

    return () => URL.revokeObjectURL(url);
  }, [draft]);

  if (isVideo) {
    // WARN: Not rendered until the object URL exists, and that is what makes it play. A browser evaluates autoplay once, when the element loads its source — mounting with `src` undefined and filling it in from the effect a tick later means that judgement already happened against nothing, so the clip sits on frame 0 and the preview is the black frame it starts on.
    if (!sourceUrl) {
      return <Skeleton className={cn("size-full", className)} />;
    }

    return (
      <PreloadVideo
        className={cn("size-full", className)}
        videoClassName="size-full object-cover"
        src={sourceUrl}
        poster={draft?.previewUrl ?? undefined}
        autoPlay
        loop
        muted
        playsInline
      />
    );
  }

  // WARN: `PreloadImage`, never a bare `<img>` — DESIGN.md § 7.8. The stored cover is an R2-backed asset, so it wants the reserved box, the fade, the failure glyph, and above all the cache-busted retry that recovers a 302 cached past the object an edit replaced (REQUIREMENTS.md § 13.3.).
  return (
    <PreloadImage
      className={cn("size-full", className)}
      imgClassName="size-full object-cover"
      src={draft?.previewUrl ?? src}
      // INFO: A staged pick is a `blob:` URL with no cache to get past, so the retry is only meaningful for the stored object.
      canRetry={draft === null}
      alt=""
    />
  );
}
