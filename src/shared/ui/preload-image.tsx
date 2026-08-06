"use client";

import { cn, type Nullable, type Optional } from "@/shared/lib";
import { ImageOff } from "lucide-react";
import { useState, type ComponentProps, type CSSProperties, type SyntheticEvent } from "react";
import { Skeleton } from "./skeleton";

type LoadStatus = "loading" | "loaded" | "failed";

/**
 * INFO: One is enough for what this is for. The retry's whole job is to reach the
 * network past a cached redirect, and a second attempt at the same live origin
 * would fail for the same reason the first did.
 */
const MAX_RETRIES = 1;

export type PreloadImageProps = Omit<ComponentProps<"img">, "placeholder" | "style" | "src"> & {
  className?: string;
  imgClassName?: string;
  placeholderClassName?: string;
  src?: string;
  /** Applied to the wrapper, which is the box the skeleton fills — a reserved size or aspect ratio belongs here, not on the image. */
  style?: CSSProperties;
  /** Off for an asset this app does not serve: the retry below cache-busts a URL we do not own, and a host that refused it once refuses it again. */
  canRetry?: boolean;
};

/**
 * An `<img>` that shows a DESIGN.md § 7.8. skeleton until its asset paints, and a
 * static glyph if the asset never arrives.
 *
 * The wrapper reserves the box, so a caller that already knows the size (chat's
 * emoticons and media, REQUIREMENTS.md § 8.3.) keeps giving it the same geometry it
 * gave the bare image — the skeleton fills it and nothing re-measures on load.
 *
 * WARN: A failed load is retried once against a cache-busted URL, and § 13.3.'s
 * multi-day asset cache depends on it: a redirect cached that long outlives the
 * object an edit replaced (§ 13.4.), and this is the only thing that reaches the
 * new one without waiting for the cache to expire.
 */
export function PreloadImage({
  className,
  imgClassName,
  placeholderClassName,
  style,
  src,
  canRetry = true,
  onLoad,
  onError,
  ...props
}: PreloadImageProps) {
  const [status, setStatus] = useState<LoadStatus>("loading");
  const [trackedSrc, setTrackedSrc] = useState(src);
  const [retryCount, setRetryCount] = useState(0);
  const resolvedSrc = toAttemptUrl(src, retryCount);

  if (trackedSrc !== src) {
    setTrackedSrc(src);
    setStatus("loading");
    setRetryCount(0);
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
        // WARN: Keyed by the attempt URL so a swap — or a retry — remounts the element. The ref below only re-reads the cache on mount, and an animated emoticon only restarts its loop on a fresh element (REQUIREMENTS.md § 13.2.).
        key={resolvedSrc}
        ref={syncCachedStatus}
        // WARN: `min-h-0 min-w-0` is load-bearing — as a grid item the image's automatic minimum size is its aspect ratio's transferred suggestion, which beats `height: 100%` and pushes a portrait asset out of a square cell.
        className={cn(
          "col-start-1 row-start-1 min-h-0 min-w-0 transition-opacity duration-200 ease-out",
          status !== "loaded" && "opacity-0",
          imgClassName,
        )}
        src={resolvedSrc}
        onLoad={handleLoad}
        onError={handleError}
      />
    </span>
  );

  // WARN: A cached image finishes before React attaches `onLoad`, so the status has to be read back off the element. `complete` alone is not the answer — it is also true for a failed load and for an empty `src`, which is what the natural size separates.
  function syncCachedStatus(node: Nullable<HTMLImageElement>) {
    if (!node?.complete) {
      return;
    }

    if (node.naturalWidth > 0) {
      setStatus("loaded");

      return;
    }

    // WARN: Not a straight `failed`. This is the remount path — a tab switch and back — so a *cached* failure lands here rather than in `handleError`, and skipping the retry is what left the image broken until the cache expired.
    fail();
  }

  function handleLoad(event: SyntheticEvent<HTMLImageElement>) {
    setStatus("loaded");
    onLoad?.(event);
  }

  function handleError(event: SyntheticEvent<HTMLImageElement>) {
    if (!fail()) {
      onError?.(event);
    }
  }

  /** Whether a retry was scheduled; `false` means the load is finally failed. */
  function fail(): boolean {
    if (!canRetry || retryCount >= MAX_RETRIES || !isRetryable(src)) {
      setStatus("failed");

      return false;
    }

    setRetryCount(retryCount + 1);
    setStatus("loading");

    return true;
  }
}

/**
 * WARN: A new URL, not a reload. `<img>` has no cache mode, so the query parameter
 * is the only way to make the browser skip a cached response — which is the entire
 * point, since a cached 302 to a deleted object is what this recovers from.
 */
function toAttemptUrl(src: Optional<string>, attempt: number): Optional<string> {
  if (!src || attempt === 0) {
    return src;
  }

  return `${src}${src.includes("?") ? "&" : "?"}retry=${attempt}`;
}

// INFO: A `blob:` or `data:` source has no cache to get past, and a query parameter on either is an unresolvable URL rather than a second attempt.
function isRetryable(src: Optional<string>): boolean {
  return src !== undefined && !src.startsWith("blob:") && !src.startsWith("data:");
}
