"use client";

import { cn, type Optional } from "@/shared/lib";
import type { ClassValue } from "clsx";
import type { LucideIcon } from "lucide-react";
import { useState, type CSSProperties, type PropsWithChildren } from "react";
import { Skeleton } from "./skeleton";

export type LoadStatus = "loading" | "loaded" | "failed";

/**
 * INFO: One is enough for what this is for. The retry's whole job is to reach the
 * network past a cached redirect, and a second attempt at the same live origin
 * would fail for the same reason the first did.
 */
const MAX_RETRIES = 1;

export type UseLoadStatusOptions = {
  src: Optional<string>;
  /** Off for an asset this app does not serve, and for an element with no cache to get past: the retry cache-busts a URL we do not own, and a host that refused it once refuses it again. */
  canRetry?: boolean;
  /** WARN: A poster reveals the element while it is still loading — REQUIREMENTS.md § 12.1. */
  hasPoster?: boolean;
};

export type LoadStatusControls = {
  status: LoadStatus;
  /** Whether the element may already be painting something: loaded, or loading behind a poster. */
  isRevealed: boolean;
  /** The URL of the current attempt — `src` itself until a retry cache-busts it. */
  attemptSrc: Optional<string>;
  markLoaded: () => void;
  /** Whether a retry was scheduled; `false` means the load is finally failed. */
  markFailed: () => boolean;
};

/**
 * The load lifecycle `PreloadImage` and `PreloadVideo` share: status, the
 * render-phase reset when `src` changes, and the one cache-busted retry.
 *
 * WARN: A failed load is retried once against a cache-busted URL, and § 13.3.'s
 * multi-day asset cache depends on it: a redirect cached that long outlives the
 * object an edit replaced (§ 13.4.), and this is the only thing that reaches the
 * new one without waiting for the cache to expire.
 */
export function useLoadStatus({
  src,
  canRetry = true,
  hasPoster = false,
}: UseLoadStatusOptions): LoadStatusControls {
  const [status, setStatus] = useState<LoadStatus>("loading");
  const [trackedSrc, setTrackedSrc] = useState(src);
  const [retryCount, setRetryCount] = useState(0);

  if (trackedSrc !== src) {
    setTrackedSrc(src);
    setStatus("loading");
    setRetryCount(0);
  }

  return {
    status,
    // INFO: A poster is the placeholder once there is one, so the element is revealed at once and paints it while the media data is still arriving.
    isRevealed: status === "loaded" || (status === "loading" && hasPoster),
    attemptSrc: toAttemptUrl(src, retryCount),
    markLoaded: () => setStatus("loaded"),
    markFailed,
  };

  function markFailed(): boolean {
    if (!canRetry || retryCount >= MAX_RETRIES || !isRetryable(src)) {
      setStatus("failed");

      return false;
    }

    setRetryCount(retryCount + 1);
    setStatus("loading");

    return true;
  }
}

export type PreloadFrameProps = PropsWithChildren<{
  className?: string;
  placeholderClassName?: string;
  /** Applied to the wrapper, which is the box the skeleton fills — a reserved size or aspect ratio belongs here, not on the media element. */
  style?: CSSProperties;
  status: LoadStatus;
  isRevealed: boolean;
  /** WARN: DESIGN.md § 7.8. Off for a full-bleed surface, where `placeholderClassName` is the flat surface the load is meant to hide behind — `Skeleton` is opaque `surface-strong` and would paint straight over it, turning the whole screen into a pulsing plate. */
  hasSkeleton: boolean;
  failureIcon: LucideIcon;
}>;

/**
 * The box a preloaded media element sits in: it reserves the geometry, fills it
 * with a DESIGN.md § 7.8. skeleton until the element has something to paint, and
 * ends on a static glyph if the asset never arrives.
 *
 * The wrapper reserves the box, so a caller that already knows the size (chat's
 * emoticons and media, REQUIREMENTS.md § 8.3.) keeps giving it the same geometry it
 * gave the bare element — the skeleton fills it and nothing re-measures on load.
 */
export function PreloadFrame({
  className,
  placeholderClassName,
  style,
  status,
  isRevealed,
  hasSkeleton,
  failureIcon: FailureIcon,
  children,
}: PreloadFrameProps) {
  return (
    <span className={cn("grid", className)} style={style}>
      {!isRevealed && (
        // WARN: The failed state's `bg-surface-strong` sits on this element and never on a child of it, so `placeholderClassName` still wins it through tailwind-merge — a full-bleed caller passing `bg-scrim` is asking for a near-black floor, and a light plate the size of the cover is what it is passing that to avoid.
        <span
          className={cn(
            "col-start-1 row-start-1 size-full overflow-hidden rounded-[inherit]",
            status === "failed" && "bg-surface-strong",
            placeholderClassName,
          )}
        >
          {status === "failed" ? (
            <span className="flex size-full items-center justify-center">
              <FailureIcon className="size-4 text-meta-soft" strokeWidth={1.75} />
            </span>
          ) : (
            hasSkeleton && <Skeleton className="size-full rounded-[inherit]" />
          )}
        </span>
      )}
      {children}
    </span>
  );
}

/**
 * The classes the media element itself carries inside a `PreloadFrame`.
 *
 * WARN: `min-h-0 min-w-0` is load-bearing — as a grid item the element's automatic minimum size is its aspect ratio's transferred suggestion, which beats `height: 100%` and pushes a portrait asset out of the box.
 */
export function toMediaElementClassName(isVisible: boolean, ...classNames: ClassValue[]): string {
  return cn(
    "col-start-1 row-start-1 min-h-0 min-w-0 transition-opacity duration-200 ease-out",
    !isVisible && "opacity-0",
    classNames,
  );
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
