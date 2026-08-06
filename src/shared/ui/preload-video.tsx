"use client";

import { cn, type Nullable } from "@/shared/lib";
import { VideoOff } from "lucide-react";
import { useState, type ComponentProps, type CSSProperties, type SyntheticEvent } from "react";
import { Skeleton } from "./skeleton";

type LoadStatus = "loading" | "loaded" | "failed";

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
 * the one element that cannot use it.
 *
 * WARN: A `<video>` with no decoded frame paints **black**, not nothing. That is
 * the whole reason this exists: an unwrapped element is a black rectangle for the
 * length of the download, which reads as a broken asset rather than a pending one.
 *
 * TODO: This and `PreloadImage` are the same shell around two elements. The gaps
 * this file has had to be patched for — `hasSkeleton`, the poster, the reveal event
 * — were all props the copy dropped, so the two want one `useLoadStatus` and one
 * placeholder between them rather than a third chance to diverge.
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
  const [status, setStatus] = useState<LoadStatus>("loading");
  const [trackedSrc, setTrackedSrc] = useState(src);
  // INFO: A poster is the placeholder once there is one, so the element is revealed at once and paints it while the video data is still arriving.
  const isRevealed = status === "loaded" || (status === "loading" && poster !== undefined);

  if (trackedSrc !== src) {
    setTrackedSrc(src);
    setStatus("loading");
  }

  return (
    <span className={cn("grid", className)} style={style}>
      {!isRevealed && hasSkeleton && (
        <span
          className={cn(
            "col-start-1 row-start-1 size-full overflow-hidden rounded-[inherit]",
            placeholderClassName,
          )}
        >
          <Skeleton className="size-full rounded-[inherit]" />
        </span>
      )}
      {status === "failed" && (
        <span
          className={cn(
            "col-start-1 row-start-1 flex size-full items-center justify-center overflow-hidden rounded-[inherit] bg-surface-strong",
            placeholderClassName,
          )}
        >
          <VideoOff className="size-4 text-meta-soft" strokeWidth={1.75} />
        </span>
      )}
      <video
        {...props}
        // WARN: `min-h-0 min-w-0` is load-bearing — as a grid item the element's automatic minimum size is its aspect ratio's transferred suggestion, which beats `height: 100%` and pushes a portrait asset out of the box.
        className={cn(
          "col-start-1 row-start-1 min-h-0 min-w-0 transition-opacity duration-200 ease-out",
          !isRevealed && "opacity-0",
          status === "failed" && "opacity-0",
          videoClassName,
        )}
        src={src}
        poster={poster}
        autoPlay={autoPlay}
        muted={muted}
        // WARN: Metadata counts as arrival, not just `loadeddata`. A caller asking for `preload="metadata"` is asking the engine to stop at `HAVE_METADATA`, and on an engine that honours that literally `loadeddata` never fires at all — the skeleton would then sit over a player that is working perfectly.
        onLoadedMetadata={handleLoadedMetadata}
        onLoadedData={handleLoadedData}
        onError={handleError}
      />
    </span>
  );

  function handleLoadedMetadata(event: SyntheticEvent<HTMLVideoElement>) {
    setStatus("loaded");
    onLoadedMetadata?.(event);
  }

  function handleLoadedData(event: SyntheticEvent<HTMLVideoElement>) {
    setStatus("loaded");
    startPlayback(event.currentTarget);
    onLoadedData?.(event);
  }

  function handleError(event: SyntheticEvent<HTMLVideoElement>) {
    setStatus("failed");
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
