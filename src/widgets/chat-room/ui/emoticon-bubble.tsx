"use client";

import type { Emoticon } from "@/entities/emoticon";
import { toEmoticonAssetUrl } from "@/shared/config";
import {
  cn,
  toPreviousReplaySrc,
  toReplaySrc,
  useSyncedEmoticonPlayback,
  useViewportReplay,
} from "@/shared/lib";
import { MediaTombstone, PreloadImage, Skeleton } from "@/shared/ui";
import { useEffect } from "react";
import { toEmoticonBox } from "../model/to-emoticon-box";

// INFO: REQUIREMENTS.md § 13. 해요체, matching `삭제된 사진이에요` — the same event said about an emoticon. Written out because the noun is fixed, where `toDeletedMediaText` picks a copula for one that varies.
const DELETED_EMOTICON_TEXT = "삭제된 이모티콘이에요";

export type EmoticonBubbleProps = {
  className?: string;
  emoticon: Emoticon;
  /**
   * REQUIREMENTS.md § 13.6. This row is the arrival the room is about to sound, so
   * the picture waits and starts on the sound's own frame instead of ahead of it.
   *
   * WARN: The room sets it for one row at a time and takes it back, which is what
   * keeps it off every other bubble — scrolling past a sounding emoticon must not
   * hold anything. `useArrivalEmoticonSound` also caps it, for a row that never mounts.
   */
  awaitsArrivalSound?: boolean;
  /** REQUIREMENTS.md § 13.9. 따라하기 — the same tap that replays this also opens the picker where this emoticon is. */
  onFollow?: () => void;
  /** REQUIREMENTS.md § 13.6. This bubble has taken the arrival's playback over, so the room can stand its own timer down. */
  onArrivalSoundReady?: () => void;
};

/**
 * DESIGN.md § 6.5. The image alone — no bubble, no border, no background.
 *
 * INFO: REQUIREMENTS.md § 13.2. One image slot, so nothing here knows whether the
 * item animates — an animated file plays because the browser plays it. A tap
 * restarts it and replays the sound on one frame (`useSyncedEmoticonPlayback`); the
 * sound a newly arrived emoticon makes by itself is the room's business (§ 13.6.),
 * so scrolling past four of them still plays nothing. § 13. It also replays whenever
 * it re-enters the viewport, silently — `useViewportReplay` is a remount, without the sound.
 *
 * INFO: REQUIREMENTS.md § 13.9. That one tap now also opens the picker on this
 * emoticon. The replay and the sound are kept rather than traded away — they are two
 * of § 13.6.'s four moments, and a tap that stopped sounding to open a panel would
 * be answering a different question than the one that was asked.
 */
export function EmoticonBubble({
  className,
  emoticon,
  awaitsArrivalSound = false,
  onFollow,
  onArrivalSoundReady,
}: EmoticonBubbleProps) {
  const { hasAnimated, hasAudio, isDeleted } = emoticon;
  const { ref, replayToken } = useViewportReplay();
  const box = toEmoticonBox(emoticon);
  const emoticonAssetUrl = toEmoticonAssetUrl(
    emoticon.id,
    hasAnimated ? "animated-image" : "still-image",
    emoticon.version,
  );
  const { phase, frameRef, play } = useSyncedEmoticonPlayback({
    imageSrc: emoticonAssetUrl,
    audioSrc: toEmoticonAssetUrl(emoticon.id, "audio", emoticon.version),
    hasAnimated,
    hasAudio,
    isEnabled: !isDeleted,
    startsHeld: awaitsArrivalSound && !isDeleted,
  });

  // INFO: § 13.6. The arrival's own playback — from here the room's timer is only for a row that never got this far.
  useEffect(() => {
    if (awaitsArrivalSound && !isDeleted) {
      onArrivalSoundReady?.();
      void play();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- Once, on the mount the flag was set for.
  }, []);

  // INFO: § 13. Once a frame of its own is up, a viewport re-entry restarts it the way the keyed `PreloadImage` below restarts the network one — silently.
  useEffect(() => {
    if (replayToken > 0 && phase === "frame") {
      void play({ isSilent: true });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- On the token alone.
  }, [replayToken]);

  // WARN: § 13. Not a `<button>`. The objects are purged, so there is nothing to replay and no 따라하기 target — every picker list filters the item out.
  if (isDeleted) {
    return (
      <div className={cn("flex", className)} style={{ width: box.width, height: box.height }}>
        <MediaTombstone text={DELETED_EMOTICON_TEXT} />
      </div>
    );
  }

  return (
    <div
      ref={hasAnimated ? ref : undefined}
      className={cn("flex", className)}
      style={{ width: box.width, height: box.height }}
    >
      <button
        className="size-full cursor-pointer rounded-sm transition-transform focus-visible:ring-2 focus-visible:ring-primary focus-visible:outline-none active:scale-[0.96]"
        type="button"
        aria-label="이모티콘"
        onClick={handleTap}
      >
        {/* WARN: `hidden` until the frame is in — a `display: none` box has no renderer, so WebKit does not start the clock on the attach; the reveal is what does, on the frame `play` chose. */}
        <div ref={frameRef} className={cn("size-full", phase !== "frame" && "hidden")} />
        {phase === "held" && <Skeleton className="size-full rounded-sm" />}
        {phase === "idle" && (
          <PreloadImage
            // WARN: Keyed by the replay token so a re-entry remounts the element, and the token also rides the URL (`toReplaySrc`) — iOS Safari ties a GIF/WebP's running loop to the request URL rather than the element, so a fresh element on an unchanged `src` restarts nothing there.
            key={hasAnimated ? replayToken : undefined}
            className="size-full"
            imgClassName="size-full object-contain"
            alt=""
            width={box.width}
            height={box.height}
            draggable={false}
            hidesPreviewOnReveal={hasAnimated}
            src={hasAnimated ? toReplaySrc(emoticonAssetUrl, replayToken) : emoticonAssetUrl}
            // WARN: The previous replay's own frame stands in while this one decodes (`toPreviousReplaySrc`), so a re-entry never shows a skeleton over a bubble that was already on screen. `hidesPreviewOnReveal`, since an emoticon's own background is transparent — two frames stacked past the reveal double-expose into a ghost.
            previewSrc={
              hasAnimated ? toPreviousReplaySrc(emoticonAssetUrl, replayToken) : undefined
            }
          />
        )}
      </button>
    </div>
  );

  function handleTap() {
    void play();
    onFollow?.();
  }
}
