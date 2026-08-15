"use client";

import { A_SECOND, cn, type Nullable, type Optional } from "@/shared/lib";
import { OFFLINE_MESSAGES } from "@/shared/offline-ux";
import type { ClassValue } from "clsx";
import { CloudOff, type LucideIcon } from "lucide-react";
import { useEffect, useState, type CSSProperties, type PropsWithChildren } from "react";
import { useBlurhashStyle, type BlurhashFit } from "./blur-placeholder";
import { Skeleton } from "./skeleton";

export type LoadStatus = "loading" | "loaded" | "failed";

/**
 * INFO: One is enough for what this is for. The retry's whole job is to reach the
 * network past a cached redirect, and a second attempt at the same live origin
 * would fail for the same reason the first did.
 */
const MAX_RETRIES = 1;

// INFO: REQUIREMENTS.md § 13.6. Long enough that a warmed asset is drawn before the plate it would have stood behind, short enough that a genuine fetch still reserves its box within a frame or two of the reader looking at it.
const PLACEHOLDER_DELAY = A_SECOND / 8;

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
  /** Loading only because the network is gone — the placeholder is standing in for an asset nothing is fetching. */
  isAwaitingNetwork: boolean;
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
  const [networkAttempt, setNetworkAttempt] = useState(0);
  const [isAwaitingNetwork, setIsAwaitingNetwork] = useState(false);

  if (trackedSrc !== src) {
    setTrackedSrc(src);
    setStatus("loading");
    setRetryCount(0);
    setNetworkAttempt(0);
    setIsAwaitingNetwork(false);
  }

  useEffect(() => {
    if (!isAwaitingNetwork) {
      return;
    }

    const resume = () => {
      setIsAwaitingNetwork(false);
      setNetworkAttempt((attempt) => attempt + 1);
    };

    window.addEventListener("online", resume);

    return () => window.removeEventListener("online", resume);
  }, [isAwaitingNetwork]);

  return {
    status,
    // INFO: A poster is the placeholder once there is one, so the element is revealed at once and paints it while the media data is still arriving.
    isRevealed: status === "loaded" || (status === "loading" && hasPoster),
    isAwaitingNetwork,
    // INFO: The network attempt rides the same cache-buster the retry does, and is counted apart from it so waiting out a tunnel never spends the one retry a stale redirect needs.
    attemptSrc: toAttemptUrl(src, retryCount + networkAttempt),
    markLoaded: () => setStatus("loaded"),
    markFailed,
  };

  function markFailed(): boolean {
    // WARN: `navigator.onLine` rather than `useIsOffline`, and the settle delay is exactly why — a load that fails in the second after the network goes is the case this catches, and the hook still reads online for all of it.
    // INFO: A blurhash holding is what a photo looks like while it loads, so an unreachable one goes on looking like that rather than ending on DESIGN.md § 7.8.'s glyph over a connection that is coming back.
    if (isRetryable(src) && !navigator.onLine) {
      setIsAwaitingNetwork(true);
      setStatus("loading");

      return true;
    }

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
  /**
   * Holds the skeleton back for `PLACEHOLDER_DELAY`, so an asset that lands inside it
   * is never preceded by one.
   *
   * WARN: REQUIREMENTS.md § 13.6. For a caller whose asset is normally **already cached** — the picker's cells, warmed before the panel opens. A skeleton that appears and is faded out over an image that was ready reads as the panel being slower than it is. Off everywhere else: for an asset that really is being fetched, a delayed placeholder is an empty box where the reserved plate should be.
   */
  hasDeferredSkeleton?: boolean;
  /** The asset's stored hash. Where there is one it **replaces** the skeleton, and `hasSkeleton` stops meaning anything; absent, every line below is what it was before blurs existed. */
  blurhash?: Nullable<string>;
  /** The asset's own width ÷ height, so the hash is decoded at the picture's shape and cropped where the element crops it. A caller that knows its geometry SHOULD pass it — DESIGN.md § 7.8. */
  blurhashRatio?: number;
  /** How the element below is fitted, since the blur has to be framed by the same rule. `cover` unless the media element carries `object-contain`. */
  blurhashFit?: BlurhashFit;
  /** WARN: Opt-in, and only where the reader asked for this asset by name — DESIGN.md § 7.10.'s slide. Every tile in a month of 보관함 would say the same sentence at once. */
  isOfflineHeld?: boolean;
  failureIcon: LucideIcon;
}>;

/**
 * The box a preloaded media element sits in: it reserves the geometry, fills it
 * with the asset's decoded `blurhash` — or a DESIGN.md § 7.8. skeleton where there
 * is no hash — until the element has something to paint, and ends on a static glyph
 * if the asset never arrives.
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
  hasDeferredSkeleton = false,
  blurhash,
  blurhashRatio,
  blurhashFit,
  isOfflineHeld = false,
  failureIcon: FailureIcon,
  children,
}: PreloadFrameProps) {
  // INFO: Withheld on failure so DESIGN.md § 7.8.'s ending stands: the glyph's contrast was picked against the `surface-strong` plate below, not against an arbitrary photo's colours.
  const blurStyle = useBlurhashStyle(status === "failed" ? undefined : blurhash, {
    ratio: blurhashRatio,
    fit: blurhashFit,
  });
  const hasBlur = blurStyle !== undefined;
  // INFO: A blur is the placeholder's whole point where there is one, so it is never held back — only the skeleton is.
  const isDeferred = hasDeferredSkeleton && !hasBlur;

  return (
    <span className={cn("grid", className)} style={style}>
      {/* WARN: A blur outlives the reveal instead of unmounting with it. The element beneath spends the next 200ms climbing out of `opacity-0` (`toMediaElementClassName`), and pulling the placeholder at the start of that leaves an empty box for the whole crossfade — which is what the blur exists to fill. */}
      {(!isRevealed || hasBlur) && (
        // WARN: The failed state's `bg-surface-strong` sits on this element and never on a child of it, so `placeholderClassName` still wins it through tailwind-merge — a full-bleed caller passing `bg-scrim` is asking for a near-black floor, and a light plate the size of the cover is what it is passing that to avoid.
        // WARN: Decoration and never a target. Left tappable, a blur that has faded out would go on covering the box after the reveal, and the topmost thing under a finger would be a placeholder rather than the asset.
        <span
          className={cn(
            "pointer-events-none col-start-1 row-start-1 size-full overflow-hidden rounded-[inherit]",
            status === "failed" && "bg-surface-strong",
            hasBlur && "transition-opacity duration-200 ease-out",
            hasBlur && isRevealed && "opacity-0",
            // WARN: On the wrapper and **never on `Skeleton`**, which sets `animate-pulse`. Both are the `animation` shorthand at equal specificity and tailwind-merge does not know `animate-in` as a member of that group, so the two survive together and the later rule — the pulse — wins: the delay silently became "the pulse starts late" while the plate still painted at once.
            isDeferred && "animate-in fill-mode-backwards fade-in",
            placeholderClassName,
          )}
          style={
            // INFO: `isDeferred` excludes the blur case, so there is never a `blurStyle` to merge with here.
            isDeferred ? { animationDelay: `${PLACEHOLDER_DELAY}ms` } : blurStyle
          }
        >
          {status === "failed" ? (
            <span className="flex size-full items-center justify-center">
              <FailureIcon className="size-4 text-meta-soft" strokeWidth={1.75} />
            </span>
          ) : isOfflineHeld ? (
            // INFO: Over the blur rather than in place of it, since the picture is not gone — it is the full-size copy that is not coming until the network does.
            <span className="flex size-full flex-col items-center justify-center gap-2xs px-sm text-center">
              <CloudOff className="size-5 text-on-scrim/70" strokeWidth={1.75} />
              <span className="text-caption text-on-scrim/70">{OFFLINE_MESSAGES.view}</span>
            </span>
          ) : (
            // WARN: DESIGN.md § 7.8. A blur *replaces* the skeleton rather than layering under it — `Skeleton` is an opaque `surface-strong` pulse, so over a blur it hides the very thing it was drawn to stand in for, and a pulsing plate is louder than the swap it covers (`ChatBackdrop` withholds it over a flat floor for the same reason).
            hasSkeleton && !hasBlur && <Skeleton className="size-full rounded-[inherit]" />
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
