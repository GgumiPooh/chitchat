"use client";

import type { MediaDraft } from "@/entities/media";
import { isVideoMime } from "@/shared/config";
import { cn, type Nullable } from "@/shared/lib";
import { PreloadVideo } from "@/shared/ui";
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
      return;
    }

    const url = URL.createObjectURL(draft.file);

    // eslint-disable-next-line react-hooks/set-state-in-effect -- The object URL is external state; minting it and handing it to React is this effect's whole purpose.
    setSourceUrl(url);

    return () => URL.revokeObjectURL(url);
  }, [draft]);

  if (isVideo) {
    return (
      <PreloadVideo
        className={cn("size-full", className)}
        videoClassName="size-full object-cover"
        src={sourceUrl || undefined}
        poster={draft?.previewUrl}
        autoPlay
        loop
        muted
        playsInline
      />
    );
  }

  return (
    <img
      className={cn("size-full object-cover", className)}
      src={draft?.previewUrl ?? src}
      alt=""
    />
  );
}
