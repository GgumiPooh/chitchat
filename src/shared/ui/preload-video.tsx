"use client";

import { cn } from "@/shared/lib";
import { VideoOff } from "lucide-react";
import { useState, type ComponentProps, type CSSProperties, type SyntheticEvent } from "react";
import { Skeleton } from "./skeleton";

type LoadStatus = "loading" | "loaded" | "failed";

export type PreloadVideoProps = Omit<ComponentProps<"video">, "style" | "src" | "poster"> & {
  className?: string;
  videoClassName?: string;
  placeholderClassName?: string;
  src?: string;
  /** Painted in place of the skeleton once it loads, and behind the video until the first frame arrives. */
  poster?: string;
  /** Applied to the wrapper, which is the box the skeleton fills — a reserved size or aspect ratio belongs here, not on the video. */
  style?: CSSProperties;
};

/**
 * A `<video>` that shows a DESIGN.md § 7.8. skeleton until it has a frame to paint,
 * and a static glyph if it never arrives — `PreloadImage`'s contract for the one
 * element that cannot use it.
 *
 * WARN: A `<video>` with no decoded frame paints **black**, not nothing. That is
 * the whole reason this exists: an unwrapped element is a black rectangle for the
 * length of the download, which reads as a broken asset rather than a pending one.
 * A `poster` narrows the window but does not close it — it has to be fetched too.
 */
export function PreloadVideo({
  className,
  videoClassName,
  placeholderClassName,
  src,
  poster,
  style,
  onLoadedData,
  onError,
  ...props
}: PreloadVideoProps) {
  const [status, setStatus] = useState<LoadStatus>("loading");
  const [trackedSrc, setTrackedSrc] = useState(src);

  if (trackedSrc !== src) {
    setTrackedSrc(src);
    setStatus("loading");
  }

  return (
    <span className={cn("grid", className)} style={style}>
      {status !== "loaded" && (
        <span
          className={cn(
            "col-start-1 row-start-1 size-full overflow-hidden rounded-[inherit]",
            placeholderClassName,
          )}
        >
          {status === "failed" ? (
            <span className="flex size-full items-center justify-center bg-surface-strong">
              <VideoOff className="size-4 text-meta-soft" strokeWidth={1.75} />
            </span>
          ) : (
            <Skeleton className="size-full rounded-[inherit]" />
          )}
        </span>
      )}
      {}
      <video
        {...props}
        // WARN: `min-h-0 min-w-0` is load-bearing — as a grid item the element's automatic minimum size is its aspect ratio's transferred suggestion, which beats `height: 100%` and pushes a portrait asset out of the box.
        className={cn(
          "col-start-1 row-start-1 min-h-0 min-w-0 transition-opacity duration-200 ease-out",
          status !== "loaded" && "opacity-0",
          videoClassName,
        )}
        src={src}
        poster={poster}
        // INFO: `loadeddata` and not `canplay` — the first frame being decoded is exactly the moment the element stops painting black, and waiting for playable-through would hold the skeleton over a video that is already showing something.
        onLoadedData={handleLoadedData}
        onError={handleError}
      />
    </span>
  );

  function handleLoadedData(event: SyntheticEvent<HTMLVideoElement>) {
    setStatus("loaded");
    onLoadedData?.(event);
  }

  function handleError(event: SyntheticEvent<HTMLVideoElement>) {
    setStatus("failed");
    onError?.(event);
  }
}
