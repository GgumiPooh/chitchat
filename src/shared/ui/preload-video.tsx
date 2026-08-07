"use client";

import { A_SECOND, type Nullable, type Optional } from "@/shared/lib";
import { VideoOff } from "lucide-react";
import {
  useEffect,
  useRef,
  type ComponentProps,
  type CSSProperties,
  type SyntheticEvent,
} from "react";
import { PreloadFrame, toMediaElementClassName, useLoadStatus } from "./preload-media";

// INFO: REQUIREMENTS.md § 12.1. How long a poster-less element waits for a real frame before metadata is taken as arrival regardless — bounded, because an engine that stops at `HAVE_METADATA` sends nothing further to wait for.
const FIRST_FRAME_GRACE = A_SECOND;

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
 *
 * WARN: `loadeddata` is what reveals a poster-less element, and `loadedmetadata` only
 * starts a bounded deadline — `HAVE_METADATA` is zero decoded frames, so revealing
 * there is revealing the black. The deadline is what keeps that from becoming a hang:
 * an engine honouring `preload="metadata"`, or WebKit having refused autoplay, sends
 * no further event at all (REQUIREMENTS.md § 12.1.).
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
  const { status, isRevealed, attemptSrc, markLoaded, markFailed } = useLoadStatus({
    src,
    canRetry: false,
    hasPoster: poster !== undefined,
  });
  const graceTimer = useRef<Optional<ReturnType<typeof setTimeout>>>(undefined);

  // WARN: Keyed on `src`, not empty — the hook resets to `loading` when the source changes, and a deadline left running from the old one would reveal the new one's black frame.
  useEffect(() => () => clearTimeout(graceTimer.current), [src]);

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
        // WARN: Keyed and sourced by the attempt URL, exactly as `PreloadImage` is. The retry is off for every caller today, so the two are the same string — but the shell owns that machinery now, and a wrapper that reads `src` instead is one that silently ignores it the day a caller turns it on.
        key={attemptSrc}
        className={toMediaElementClassName(isRevealed, "no-start-playback-button", videoClassName)}
        src={attemptSrc}
        poster={poster}
        autoPlay={autoPlay}
        muted={muted}
        onLoadedMetadata={handleLoadedMetadata}
        onLoadedData={handleLoadedData}
        onError={handleError}
      />
    </PreloadFrame>
  );

  // WARN: With a poster the element is already revealed and this is bookkeeping; without one it is a deadline, never a reveal — REQUIREMENTS.md § 12.1. for why neither `autoPlay` nor `preload` can decide it.
  function handleLoadedMetadata(event: SyntheticEvent<HTMLVideoElement>) {
    if (poster !== undefined) {
      markLoaded();
    } else {
      graceTimer.current = setTimeout(markLoaded, FIRST_FRAME_GRACE);
    }

    onLoadedMetadata?.(event);
  }

  function handleLoadedData(event: SyntheticEvent<HTMLVideoElement>) {
    clearTimeout(graceTimer.current);
    markLoaded();
    startPlayback(event.currentTarget);
    onLoadedData?.(event);
  }

  function handleError(event: SyntheticEvent<HTMLVideoElement>) {
    clearTimeout(graceTimer.current);
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
