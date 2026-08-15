"use client";

import { cn, type Nullable } from "@/shared/lib";
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
  /**
   * A smaller copy of the **same picture** that the screen before this one has already
   * loaded, painted at once and left underneath while `src` arrives.
   *
   * INFO: DESIGN.md § 7.10. 보관함's tile is `previewUrl` and the viewer's slide is `originalUrl` — two different objects, so opening a photo starts a cold download however long the reader spent looking at the grid. The blurhash covered that gap with a blur of a picture already decoded one screen away.
   * WARN: Dropped outright the instant `src` has pixels, and the element below gives up its own 200ms reveal fade while this is standing in — the two are the same picture, so a crossfade between them is the picture blended with itself. On an animated original that is every frame it has moved on to, showing through a still one. This is where it differs from the blur, which does fade and must.
   * WARN: Decorative — `alt=""` and `aria-hidden`. It is the same picture as the element below it, and announced twice a reader hears the photo named twice.
   */
  previewSrc?: Nullable<string>;
  /** Off for an asset this app does not serve: the retry below cache-busts a URL we do not own, and a host that refused it once refuses it again. */
  canRetry?: boolean;
  /** WARN: DESIGN.md § 7.8. Holds the skeleton back for a moment, for a caller whose asset is normally already cached — REQUIREMENTS.md § 13.6.'s picker cells. See `PreloadFrameProps`. */
  hasDeferredSkeleton?: boolean;
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
  /** WARN: Opt-in, and only where the reader asked for this asset by name — DESIGN.md § 7.10.'s slide. Every tile in a month of 보관함 would say the same sentence at once. */
  hasOfflineNotice?: boolean;
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
  previewSrc,
  canRetry = true,
  hasSkeleton = true,
  hasDeferredSkeleton = false,
  blurhash,
  blurhashRatio,
  blurhashFit,
  hasOfflineNotice = false,
  onLoad,
  onError,
  ...props
}: PreloadImageProps) {
  // INFO: Null is coerced here rather than inside the shell, so the shared hook keeps one absent-source notion instead of two.
  const { status, isRevealed, isAwaitingNetwork, attemptSrc, markLoaded, markFailed } =
    useLoadStatus({
      src: src ?? undefined,
      canRetry,
    });
  /**
   * INFO: Up until the element below reveals the picture the caller ultimately asked for. Past that it is either revealed — and the stand-in is what would show through it — or failed, where DESIGN.md § 7.8.'s glyph on its own plate is the documented ending rather than a thumbnail left standing in for an object that is gone.
   * WARN: The first arm is what keeps this **one element across the swap**. DESIGN.md § 4.7.3. has the viewer hold `src` at the preview until its opening morph lands and only then point it at the original, and that swap remounts the element below (it is keyed on the URL). Tested on `status` alone the layer would unmount on the same commit the original's element mounts empty — one element leaving as another arrives, with a blank frame between them if the cached decode does not land in that paint.
   */
  const hasPreview =
    Boolean(previewSrc) &&
    (previewSrc === attemptSrc || status === "loading") &&
    status !== "failed";

  return (
    <PreloadFrame
      className={className}
      placeholderClassName={placeholderClassName}
      style={style}
      status={status}
      isRevealed={isRevealed}
      hasSkeleton={hasSkeleton}
      hasDeferredSkeleton={hasDeferredSkeleton}
      blurhash={blurhash}
      blurhashRatio={blurhashRatio}
      blurhashFit={blurhashFit}
      // WARN: Never while a preview is standing in — that thumbnail is the same picture, already on screen, so saying it cannot be shown is plainly contradicted by what the reader is looking at.
      isOfflineHeld={hasOfflineNotice && isAwaitingNetwork && !hasPreview}
      failureIcon={ImageOff}
    >
      {/* INFO: Its lifetime and the reason it never fades are both on `hasPreview` above; a same-URL pair here is one request, since the second reads the first out of the memory cache. */}
      {hasPreview && (
        // eslint-disable-next-line @next/next/no-img-element -- As the element below.
        <img
          className={cn("col-start-1 row-start-1 min-h-0 min-w-0", imgClassName)}
          src={previewSrc ?? undefined}
          alt=""
          draggable={false}
          aria-hidden
        />
      )}
      {/* eslint-disable-next-line @next/next/no-img-element -- The asset routes of REQUIREMENTS.md § 9. and § 13.3. answer a 302 to a presigned R2 URL, which `next/image` cannot take as a loader source. */}
      <img
        {...props}
        // WARN: Keyed by the attempt URL so a swap — or a retry — remounts the element. The ref below only re-reads the cache on mount, and an animated emoticon only restarts its loop on a fresh element (REQUIREMENTS.md § 13.2.).
        key={attemptSrc}
        ref={syncCachedStatus}
        // WARN: The reveal fade is **skipped** while a preview is standing in, for that element's own reason: it is the same picture, already on screen at full strength, so there is nothing for a crossfade to reveal and everything for it to double. An unloaded `<img>` paints nothing either way, so full opacity from the start costs no flash of its own.
        className={toMediaElementClassName(isRevealed || hasPreview, imgClassName)}
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
