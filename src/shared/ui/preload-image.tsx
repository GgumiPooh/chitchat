"use client";

import type { Nullable } from "@/shared/lib";
import { ImageOff } from "lucide-react";
import type { ComponentProps, CSSProperties, SyntheticEvent } from "react";
import type { BlurhashFit } from "./blur-placeholder";
import { PreloadFrame, toMediaElementClassName, useLoadStatus } from "./preload-media";

export type PreloadImageProps = Omit<ComponentProps<"img">, "placeholder" | "style" | "src"> & {
  className?: string;
  imgClassName?: string;
  placeholderClassName?: string;
  /**
   * WARN: Null is coerced to absent, and absent renders the **failed** state, not an
   * empty one — an `<img>` with no source reports `complete` with a zero natural
   * width, which is exactly what a broken asset reports. It accepts a null only to
   * spare callers a coercion; a caller with nothing to show (REQUIREMENTS.md § 9.1.'s
   * file attachment) must render something else instead of passing it here.
   */
  src?: Nullable<string>;
  /** Applied to the wrapper, which is the box the skeleton fills — a reserved size or aspect ratio belongs here, not on the image. */
  style?: CSSProperties;
  /** Off for an asset this app does not serve: the retry below cache-busts a URL we do not own, and a host that refused it once refuses it again. */
  canRetry?: boolean;
  /** WARN: DESIGN.md § 7.8. Off for a full-bleed backdrop, where `placeholderClassName` is the flat surface the load is meant to hide behind — `Skeleton` is opaque `surface-strong` and would paint straight over it, turning the whole screen into a pulsing plate. */
  hasSkeleton?: boolean;
  /**
   * The asset's stored hash, decoded and painted while it loads.
   *
   * WARN: It **replaces** the skeleton wherever there is one, so `hasSkeleton` stops
   * deciding anything — an opaque `surface-strong` pulse over a blur hides it, which
   * is the argument `ChatBackdrop` already carries for a flat floor. A row that has
   * no hash is unchanged and still pulses.
   */
  blurhash?: Nullable<string>;
  /**
   * The asset's own width ÷ height, which is the shape the hash is decoded at.
   *
   * WARN: DESIGN.md § 7.8. A caller that knows its geometry SHOULD pass it, whatever shape the box is. A decode is the whole picture resampled rather than a crop of it, so without the ratio the blur is square and `object-cover`'s crop has nothing to agree with — a 4:3 photo in 보관함's square tile showed the strips the loaded image cuts away, horizontally squashed, and re-framed the moment it revealed.
   */
  blurhashRatio?: number;
  /** How `imgClassName` fits the image, since the blur has to be framed by the same rule. `cover` unless the image carries `object-contain`. */
  blurhashFit?: BlurhashFit;
};

/**
 * An `<img>` that stands in for its asset until it paints — a decoded `blurhash`
 * where the row carries one, a DESIGN.md § 7.8. skeleton where it does not — and
 * ends on a static glyph if the asset never arrives. The box, the placeholder and
 * the retry are `PreloadFrame` and `useLoadStatus`, shared with `PreloadVideo`.
 */
export function PreloadImage({
  className,
  imgClassName,
  placeholderClassName,
  style,
  src,
  canRetry = true,
  hasSkeleton = true,
  blurhash,
  blurhashRatio,
  blurhashFit,
  onLoad,
  onError,
  ...props
}: PreloadImageProps) {
  // INFO: Null is coerced here rather than inside the shell, so the shared hook keeps one absent-source notion instead of two.
  const { status, isRevealed, attemptSrc, markLoaded, markFailed } = useLoadStatus({
    src: src ?? undefined,
    canRetry,
  });

  return (
    <PreloadFrame
      className={className}
      placeholderClassName={placeholderClassName}
      style={style}
      status={status}
      isRevealed={isRevealed}
      hasSkeleton={hasSkeleton}
      blurhash={blurhash}
      blurhashRatio={blurhashRatio}
      blurhashFit={blurhashFit}
      failureIcon={ImageOff}
    >
      {/* eslint-disable-next-line @next/next/no-img-element -- The asset routes of REQUIREMENTS.md § 9. and § 13.3. answer a 302 to a presigned R2 URL, which `next/image` cannot take as a loader source. */}
      <img
        {...props}
        // WARN: Keyed by the attempt URL so a swap — or a retry — remounts the element. The ref below only re-reads the cache on mount, and an animated emoticon only restarts its loop on a fresh element (REQUIREMENTS.md § 13.2.).
        key={attemptSrc}
        ref={syncCachedStatus}
        className={toMediaElementClassName(isRevealed, imgClassName)}
        src={attemptSrc}
        onLoad={handleLoad}
        onError={handleError}
      />
    </PreloadFrame>
  );

  // WARN: A cached image finishes before React attaches `onLoad`, so the status has to be read back off the element. `complete` alone is not the answer — it is also true for a failed load and for an empty `src`, which is what the natural size separates.
  function syncCachedStatus(node: Nullable<HTMLImageElement>) {
    if (!node?.complete) {
      return;
    }

    if (node.naturalWidth > 0) {
      markLoaded();

      return;
    }

    // WARN: Not a straight `failed`. This is the remount path — a tab switch and back — so a *cached* failure lands here rather than in `handleError`, and skipping the retry is what left the image broken until the cache expired.
    markFailed();
  }

  function handleLoad(event: SyntheticEvent<HTMLImageElement>) {
    markLoaded();
    onLoad?.(event);
  }

  function handleError(event: SyntheticEvent<HTMLImageElement>) {
    if (!markFailed()) {
      onError?.(event);
    }
  }
}
