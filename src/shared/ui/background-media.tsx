"use client";

import { toMediaUrl } from "@/shared/config";
import { cn } from "@/shared/lib";
import { PreloadImage } from "./preload-image";
import { PreloadVideo } from "./preload-video";

export type BackgroundMediaProps = {
  className?: string;
  mediaId: string;
  /** REQUIREMENTS.md § 12.1. A profile cover may be a video; a chat wallpaper never is (§ 12.2.). */
  isVideo?: boolean;
};

/**
 * A background image or looping video, drawn `object-cover` over the box it is
 * given. DESIGN.md § 7.16.
 *
 * WARN: The poster is the `_thumb` sibling every § 9. video upload already carries,
 * and it is not merely a nicety. iOS refuses muted autoplay outright in Low Power
 * Mode — with no poster the cover would be a black rectangle for those users rather
 * than a still frame, and nothing in the page can detect that state to fall back on
 * its own.
 *
 * WARN: `muted` and `playsInline` are both required for the autoplay to be allowed
 * at all on iOS, and `playsInline` additionally stops the element demanding
 * fullscreen the moment it starts. `loop` is what the feature is for.
 */
export function BackgroundMedia({ className, mediaId, isVideo = false }: BackgroundMediaProps) {
  if (isVideo) {
    return (
      <PreloadVideo
        className={cn("size-full", className)}
        videoClassName="size-full object-cover"
        placeholderClassName="bg-scrim"
        src={toMediaUrl(mediaId, "original")}
        poster={toMediaUrl(mediaId)}
        hasSkeleton={false}
        autoPlay
        loop
        muted
        playsInline
        preload="auto"
      />
    );
  }

  return (
    // WARN: No skeleton. `bg-scrim` is already the base of every screen this is drawn on, and `Skeleton` is an opaque `surface-strong` filling the same box — left on, it paints straight over the placeholder and flashes a pulsing light plate the size of the cover before the photo lands.
    <PreloadImage
      className={cn("size-full", className)}
      imgClassName="size-full object-cover"
      placeholderClassName="bg-scrim"
      src={toMediaUrl(mediaId, "original")}
      hasSkeleton={false}
      alt=""
    />
  );
}
