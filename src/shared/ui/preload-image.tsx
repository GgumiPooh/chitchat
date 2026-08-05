"use client";

import { cn, type Nullable } from "@/shared/lib";
import { ImageOff } from "lucide-react";
import { useState, type ComponentProps, type CSSProperties, type SyntheticEvent } from "react";
import { Skeleton } from "./skeleton";

type LoadStatus = "loading" | "loaded" | "failed";

export type PreloadImageProps = Omit<ComponentProps<"img">, "placeholder" | "style" | "src"> & {
  className?: string;
  imgClassName?: string;
  placeholderClassName?: string;
  src?: string;
  /** Applied to the wrapper, which is the box the skeleton fills — a reserved size or aspect ratio belongs here, not on the image. */
  style?: CSSProperties;
};

/**
 * An `<img>` that shows a DESIGN.md § 7.8. skeleton until its asset paints, and a
 * static glyph if the asset never arrives.
 *
 * The wrapper reserves the box, so a caller that already knows the size (chat's
 * emoticons and media, REQUIREMENTS.md § 8.3.) keeps giving it the same geometry it
 * gave the bare image — the skeleton fills it and nothing re-measures on load.
 */
export function PreloadImage({
  className,
  imgClassName,
  placeholderClassName,
  style,
  src,
  onLoad,
  onError,
  ...props
}: PreloadImageProps) {
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
              <ImageOff className="size-4 text-meta-soft" strokeWidth={1.75} />
            </span>
          ) : (
            <Skeleton className="size-full rounded-[inherit]" />
          )}
        </span>
      )}
      {/* eslint-disable-next-line @next/next/no-img-element -- The asset routes of REQUIREMENTS.md § 9. and § 13.3. answer a 302 to a presigned R2 URL, which `next/image` cannot take as a loader source. */}
      <img
        {...props}
        // WARN: Keyed by `src` so a swap remounts the element — the ref below only re-reads the cache on mount, and an animated emoticon only restarts its loop on a fresh element (REQUIREMENTS.md § 13.2.).
        key={src}
        ref={syncCachedStatus}
        // WARN: `min-h-0 min-w-0` is load-bearing — as a grid item the image's automatic minimum size is its aspect ratio's transferred suggestion, which beats `height: 100%` and pushes a portrait asset out of a square cell.
        className={cn(
          "col-start-1 row-start-1 min-h-0 min-w-0 transition-opacity duration-200 ease-out",
          status !== "loaded" && "opacity-0",
          imgClassName,
        )}
        src={src}
        onLoad={handleLoad}
        onError={handleError}
      />
    </span>
  );

  // WARN: A cached image finishes before React attaches `onLoad`, so the status has to be read back off the element. `complete` alone is not the answer — it is also true for a failed load and for an empty `src`, which is what the natural size separates.
  function syncCachedStatus(node: Nullable<HTMLImageElement>) {
    if (node?.complete) {
      setStatus(node.naturalWidth > 0 ? "loaded" : "failed");
    }
  }

  function handleLoad(event: SyntheticEvent<HTMLImageElement>) {
    setStatus("loaded");
    onLoad?.(event);
  }

  function handleError(event: SyntheticEvent<HTMLImageElement>) {
    setStatus("failed");
    onError?.(event);
  }
}
