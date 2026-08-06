"use client";

import { toMediaUrl } from "@/shared/config";
import { cn } from "@/shared/lib";
import { PreloadImage } from "./preload-image";

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
      <video
        className={cn("size-full object-cover", className)}
        src={toMediaUrl(mediaId, "original")}
        poster={toMediaUrl(mediaId)}
        autoPlay
        loop
        muted
        playsInline
        preload="auto"
      />
    );
  }

  return (
    <PreloadImage
      className={cn("size-full", className)}
      imgClassName="size-full object-cover"
      placeholderClassName="bg-scrim"
      src={toMediaUrl(mediaId, "original")}
      alt=""
    />
  );
}
