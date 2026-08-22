"use client";

import type { Emoticon } from "@/entities/emoticon";
import { toEmoticonAssetUrl } from "@/shared/config";
import { cn, toPreviousReplaySrc, toReplaySrc, useViewportReplay, warmSound } from "@/shared/lib";
import { MediaTombstone, PreloadImage } from "@/shared/ui";
import { useEffect, useState } from "react";
import { playEmoticonSound } from "../model/play-emoticon-sound";
import { toEmoticonBox } from "../model/to-emoticon-box";

// INFO: REQUIREMENTS.md § 13. 해요체, matching `삭제된 사진이에요` — the same event said about an emoticon. Written out because the noun is fixed, where `toDeletedMediaText` picks a copula for one that varies.
const DELETED_EMOTICON_TEXT = "삭제된 이모티콘이에요";

export type EmoticonBubbleProps = {
  className?: string;
  emoticon: Emoticon;
  /**
   * REQUIREMENTS.md § 13.6. This row is the live arrival the room is about to sound,
   * so the picture waits for the sound instead of appearing ahead of it.
   *
   * WARN: The room sets it for one row at a time and takes it back, which is what
   * keeps it off every other bubble — scrolling past a sounding emoticon must not
   * hold anything. It is also the cap: `useArrivalEmoticonSound` clears it on a timer,
   * so a sound that never arrives releases the picture instead of hiding the message.
   */
  awaitsArrivalSound?: boolean;
  /** REQUIREMENTS.md § 13.9. 따라하기 — the same tap that replays this also opens the picker where this emoticon is. */
  onFollow?: () => void;
  /** REQUIREMENTS.md § 13.6. The picture is on screen — the moment the room plays the sound. */
  onArrivalSoundReady?: () => void;
};

/**
 * DESIGN.md § 6.5. The image alone — no bubble, no border, no background.
 *
 * INFO: REQUIREMENTS.md § 13.2. One image slot, so nothing here knows whether the
 * item animates — an animated file plays because the browser plays it. A tap
 * restarts it and replays the sound; the sound a newly arrived emoticon makes by
 * itself is the room's business, not the bubble's (§ 13.6.), so scrolling past
 * four of them still plays nothing. § 13. It also replays whenever it re-enters
 * the viewport, silently — `useViewportReplay` is the same remount, without the sound.
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
  const { ref, replayToken, replay } = useViewportReplay();
  const audioUrl = toEmoticonAssetUrl(emoticon.id, "audio", emoticon.version);
  const [isSoundWarm, setSoundWarm] = useState(false);

  // INFO: REQUIREMENTS.md § 13.6. A bubble's picture is decoded before the tap and its sound was not, which is the whole of the lag between the two — the row is on screen well before anyone taps it.
  useEffect(() => {
    if (!hasAudio || isDeleted) {
      return;
    }

    let isCancelled = false;

    // INFO: § 13.6. Resolves on a failed fetch too, so the hold below is lifted by a sound that is not coming.
    void warmSound(audioUrl).then(() => {
      if (!isCancelled) {
        setSoundWarm(true);
      }
    });

    return () => {
      isCancelled = true;
    };
  }, [audioUrl, hasAudio, isDeleted]);

  const box = toEmoticonBox(emoticon);
  const emoticonAssetUrl = toEmoticonAssetUrl(
    emoticon.id,
    hasAnimated ? "animated-image" : "still-image",
    emoticon.version,
  );

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
        <PreloadImage
          // WARN: Keyed by the replay token so a tap remounts the element, and the token also rides the URL (`toReplaySrc`) — iOS Safari ties a GIF/WebP's running loop to the request URL rather than the element, so a fresh element on an unchanged `src` restarts nothing there.
          key={hasAnimated ? replayToken : undefined}
          className="size-full"
          imgClassName="size-full object-contain"
          alt=""
          width={box.width}
          height={box.height}
          draggable={false}
          // WARN: The previous replay's own frame stands in while this one decodes (`toPreviousReplaySrc`), so a tap or a re-entry never shows a skeleton over a bubble that was already on screen. `hidesPreviewOnReveal`, since an emoticon's own background is transparent — two frames stacked past the reveal double-expose into a ghost.
          previewSrc={hasAnimated ? toPreviousReplaySrc(emoticonAssetUrl, replayToken) : undefined}
          hidesPreviewOnReveal={hasAnimated}
          // WARN: § 13.6. The picture is held back so it and the sound land together, and the room's own timer is what guarantees the hold is lifted — see `awaitsArrivalSound`.
          isHeld={awaitsArrivalSound && hasAudio && !isSoundWarm}
          src={hasAnimated ? toReplaySrc(emoticonAssetUrl, replayToken) : emoticonAssetUrl}
          onReveal={handleReveal}
        />
      </button>
    </div>
  );

  // INFO: § 13.6. The sound stays the room's decision (`useArrivalEmoticonSound`); the bubble only reports the frame its picture went up on.
  function handleReveal() {
    if (awaitsArrivalSound) {
      onArrivalSoundReady?.();
    }
  }

  function handleTap() {
    if (hasAnimated) {
      replay();
    }
    // WARN: Inside the click handler with nothing awaited before it — iOS grants the gesture's audio permission to this call stack alone, so any `await` first loses it.
    playEmoticonSound(emoticon);
    onFollow?.();
  }
}
