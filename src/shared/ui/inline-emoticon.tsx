"use client";

import { toEmoticonAssetUrl } from "@/shared/config";
import {
  cn,
  toPreviousReplaySrc,
  toReplaySrc,
  useSyncedEmoticonPlayback,
  useViewportReplay,
  type EmoticonItemId,
  type Nullable,
} from "@/shared/lib";
import { useEffect } from "react";
import { PreloadImage } from "./preload-image";
import { Skeleton } from "./skeleton";

export type InlineEmoticonProps = {
  className?: string;
  imgClassName?: string;
  itemId: EmoticonItemId;
  /** REQUIREMENTS.md § 13.4. The item's `updated_at` in milliseconds — an edit keeps the id, so nothing else tells the cached redirect apart from the new object. */
  version: number;
  /** The asset's own pixels. Only their ratio is used: the box is one line tall whatever they are. */
  width: number;
  height: number;
  name?: Nullable<string>;
  hasAudio?: boolean;
  /** REQUIREMENTS.md § 13. `MessageRow`'s solo (bubble-less, box-drawn) rendering is a tap target that restarts the animation, matching `EmoticonBubble`; an inline run and the composer draft are not. */
  isTappable?: boolean;
  /**
   * REQUIREMENTS.md § 13.6. This is the arrival the room is about to sound — the solo
   * rendering's half of `EmoticonBubble`'s own contract, which carries the argument.
   *
   * WARN: Set by the room for one row and taken back, and capped there. An inline run
   * and the composer draft never pass it: neither is a message arriving.
   */
  awaitsArrivalSound?: boolean;
  /** REQUIREMENTS.md § 13.6. This element has taken the arrival's playback over. */
  onArrivalSoundReady?: () => void;
};

/**
 * An emoticon standing between the characters of a line — what one
 * `OBJECT_PLACEHOLDER` draws as (REQUIREMENTS.md § 6.).
 *
 * INFO: In `shared/ui` because the draft in the composer and the bubble it is sent as
 * must be the same box, and the two are written in different layers.
 *
 * WARN: One line tall (`1lh`) with the ratio doing the width, so nothing here has to
 * measure the line or wait for the asset — and the box is the same before and after
 * the image lands, which is what keeps a load from re-wrapping the text around it.
 *
 * WARN: `align-bottom`, never the default baseline and never `align-middle`. An
 * inline-block's baseline is its bottom margin edge, so a box on the baseline hangs
 * a whole descender below the line and grows every line box it lands in.
 *
 * INFO: REQUIREMENTS.md § 13. Replays whenever it re-enters the viewport — `useViewportReplay`
 * remounts the image on that transition, same as a tap restarts `EmoticonBubble`.
 */
export function InlineEmoticon({
  className,
  imgClassName,
  itemId,
  version,
  width,
  height,
  name,
  hasAudio = false,
  isTappable = false,
  awaitsArrivalSound = false,
  onArrivalSoundReady,
}: InlineEmoticonProps) {
  const { ref, replayToken } = useViewportReplay();
  const emoticonAssetUrl = toEmoticonAssetUrl(itemId, "animated-image", version);
  const { phase, frameRef, play } = useSyncedEmoticonPlayback<HTMLSpanElement>({
    imageSrc: emoticonAssetUrl,
    audioSrc: toEmoticonAssetUrl(itemId, "audio", version),
    hasAnimated: true,
    hasAudio,
    frameClassName: cn("object-center", imgClassName),
    isEnabled: isTappable || awaitsArrivalSound,
    startsHeld: awaitsArrivalSound,
  });

  useEffect(() => {
    if (awaitsArrivalSound) {
      onArrivalSoundReady?.();
      void play();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- Once, on the mount the flag was set for.
  }, []);

  useEffect(() => {
    if (replayToken > 0 && phase === "frame") {
      void play({ isSilent: true });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- On the token alone.
  }, [replayToken]);

  const image = (
    <>
      {/* WARN: `hidden` until the frame is in — see `EmoticonBubble`. */}
      <span ref={frameRef} className={cn("block size-full", phase !== "frame" && "hidden")} />
      {phase === "held" && <Skeleton className="size-full" />}
      {phase === "idle" && (
        <PreloadImage
          // WARN: Keyed by the replay token, same as `EmoticonBubble`, and the token also rides the URL (`toReplaySrc`) — iOS Safari ties a GIF/WebP's running loop to the request URL rather than the element, so a fresh element on an unchanged `src` restarts nothing there.
          key={replayToken}
          className="size-full"
          // INFO: `object-contain`, since an emoticon is not square and a crop would cut the drawing rather than letterbox it.
          imgClassName={cn("size-full object-contain object-center", imgClassName)}
          // WARN: DESIGN.md § 7.8. Deferred, for the picker cells' reason — an emoticon in a draft was chosen from a panel that had already loaded it, so a skeleton at one line tall only ever flashes.
          hasDeferredSkeleton
          alt={name ?? ""}
          draggable={false}
          // WARN: The previous replay's own frame stands in while this one decodes (`toPreviousReplaySrc`), so a tap or a re-entry never shows a skeleton either. `hidesPreviewOnReveal`, since an emoticon's own background is transparent — two frames stacked past the reveal double-expose into a ghost.
          previewSrc={toPreviousReplaySrc(emoticonAssetUrl, replayToken)}
          hidesPreviewOnReveal
          // INFO: The animated slot, which the asset route falls back from when the item holds only a still (REQUIREMENTS.md § 13.3.).
          src={toReplaySrc(emoticonAssetUrl, replayToken)}
        />
      )}
    </>
  );

  return (
    <span
      ref={ref}
      className={cn("inline-block align-bottom", className)}
      style={{ height: "1lh", aspectRatio: `${width} / ${height}` }}
    >
      {isTappable ? (
        <button
          className="size-full cursor-pointer focus-visible:ring-2 focus-visible:ring-primary focus-visible:outline-none active:scale-[0.96]"
          type="button"
          aria-label="이모티콘"
          onClick={() => void play()}
        >
          {image}
        </button>
      ) : (
        image
      )}
    </span>
  );
}
