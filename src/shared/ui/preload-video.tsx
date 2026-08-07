"use client";

import type { Nullable } from "@/shared/lib";
import { VideoOff } from "lucide-react";
import type { ComponentProps, CSSProperties, SyntheticEvent } from "react";
import { PreloadFrame, toMediaElementClassName, useLoadStatus } from "./preload-media";

export type PreloadVideoProps = Omit<ComponentProps<"video">, "style" | "src" | "poster"> & {
  className?: string;
  videoClassName?: string;
  placeholderClassName?: string;
  src?: string;
  /**
   * The still the element paints before it has a frame of its own.
   *
   * WARN: Giving one suppresses the skeleton entirely, and that is the point — the
   * element shows a poster as soon as *that* image loads, independently of the video
   * data, so an opaque skeleton on top would hide the very frame REQUIREMENTS.md
   * § 12.1. keeps a poster for.
   */
  poster?: string;
  /** Applied to the wrapper, which is the box the skeleton fills — a reserved size or aspect ratio belongs here, not on the video. */
  style?: CSSProperties;
  /**
   * WARN: Off for a full-bleed surface. `Skeleton` is an opaque `surface-strong`
   * filling the same box, so over a cover it is a pulsing light plate the size of
   * the screen — `PreloadImage` carries this escape hatch for the same reason.
   */
  hasSkeleton?: boolean;
};

/**
 * A `<video>` that shows a DESIGN.md § 7.8. skeleton until it has something to
 * paint, and a static glyph if nothing ever arrives — `PreloadImage`'s contract for
 * the one element that cannot use it, over the same `PreloadFrame`.
 *
 * WARN: A `<video>` with no decoded frame paints **black**, not nothing. That is
 * the whole reason this exists: an unwrapped element is a black rectangle for the
 * length of the download, which reads as a broken asset rather than a pending one.
 *
 * INFO: No retry, unlike `PreloadImage` — every source here is a `blob:` URL or a § 12.1. cover under an id a replacement never reuses, so there is no cached redirect to get past.
 */
export function PreloadVideo({
  className,
  videoClassName,
  placeholderClassName,
  src,
  poster,
  style,
  autoPlay,
  muted,
  hasSkeleton = true,
  onLoadedMetadata,
  onLoadedData,
  onError,
  ...props
}: PreloadVideoProps) {
  const { status, isRevealed, markLoaded, markFailed } = useLoadStatus({
    src,
    canRetry: false,
    hasPoster: poster !== undefined,
  });

  return (
    <PreloadFrame
      className={className}
      placeholderClassName={placeholderClassName}
      style={style}
      status={status}
      isRevealed={isRevealed}
      hasSkeleton={hasSkeleton}
      failureIcon={VideoOff}
    >
      <video
        {...props}
        className={toMediaElementClassName(isRevealed, videoClassName)}
        src={src}
        poster={poster}
        autoPlay={autoPlay}
        muted={muted}
        // WARN: Metadata counts as arrival, not just `loadeddata`. A caller asking for `preload="metadata"` is asking the engine to stop at `HAVE_METADATA`, and on an engine that honours that literally `loadeddata` never fires at all — the skeleton would then sit over a player that is working perfectly.
        onLoadedMetadata={handleLoadedMetadata}
        onLoadedData={handleLoadedData}
        onError={handleError}
      />
    </PreloadFrame>
  );

  function handleLoadedMetadata(event: SyntheticEvent<HTMLVideoElement>) {
    markLoaded();
    onLoadedMetadata?.(event);
  }

  function handleLoadedData(event: SyntheticEvent<HTMLVideoElement>) {
    markLoaded();
    startPlayback(event.currentTarget);
    onLoadedData?.(event);
  }

  function handleError(event: SyntheticEvent<HTMLVideoElement>) {
    markFailed();
    onError?.(event);
  }

  /**
   * WARN: An explicit start, because the declarative `autoPlay` alone is not enough
   * twice over. React assigns `muted` as a property rather than an attribute, so the
   * element can be unmuted at the moment the browser judges autoplay and be refused
   * for that alone; and a source that arrives after mount is never judged. A refusal
   * still leaves the poster, which is what § 12.1. keeps one for.
   *
   * WARN: The fallback is **muted**, never unmuted. This line exists to re-assert
   * muted-ness at the moment playback is asked for, so defaulting the other way
   * would unmute a caller that never mentioned audio and then be refused on iOS for
   * exactly that.
   */
  function startPlayback(video: Nullable<HTMLVideoElement>) {
    if (!autoPlay || !video) {
      return;
    }

    video.muted = muted ?? true;
    void video.play().catch(() => undefined);
  }
}
