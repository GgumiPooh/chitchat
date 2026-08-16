"use client";

import type { Emoticon } from "@/entities/emoticon";
import { toEmoticonAssetUrl } from "@/shared/config";
import { cn, playSound } from "@/shared/lib";
import { IconButton, PreloadImage } from "@/shared/ui";
import { X } from "lucide-react";
import { useState } from "react";

// INFO: Smaller than the § 6.5. bubble — this is a staged attachment, and it sits above the composer where `MediaTray`'s thumbnails do.
const MAX_EDGE = 96;

export type EmoticonPreviewProps = {
  className?: string;
  emoticon: Emoticon;
  onRemove: () => void;
};

/**
 * REQUIREMENTS.md § 13.6. The staged emoticon, waiting for send.
 *
 * INFO: The animation runs from the moment it is staged — unlike a bubble there is
 * no scrolling for an observer to track, it is on screen by definition. A tap
 * replays it and plays the audio, which is the bubble's gesture (§ 13.6.).
 */
export function EmoticonPreview({ className, emoticon, onRemove }: EmoticonPreviewProps) {
  const [replayToken, setReplayToken] = useState(0);
  const box = toBox(emoticon);

  return (
    // INFO: REQUIREMENTS.md § 13.6. Centered rather than aligned to the send side — this is what is about to be sent, not a rehearsal of where its bubble lands.
    // WARN: REQUIREMENTS.md § 13.6. The row stays transparent to the pointer and only the card below takes taps. It floats over the history rather than pushing it, so a full-width band that took them would be a strip of dead history on either side of a 96px card.
    <div
      className={cn(
        "flex animate-in justify-center duration-200 fade-in slide-in-from-bottom-2",
        className,
      )}
    >
      <div className="pointer-events-auto relative rounded-lg border border-hairline glass p-2xs shadow-floating">
        <button
          className="flex cursor-pointer items-center justify-center rounded-sm transition-transform focus-visible:ring-2 focus-visible:ring-primary focus-visible:outline-none active:scale-[0.96]"
          type="button"
          style={{ width: box.width, height: box.height }}
          aria-label="이모티콘 다시 재생"
          onClick={handleTap}
        >
          <PreloadImage
            // WARN: Keyed by the replay token so a tap remounts the element. A GIF or animated WebP has no seek API — reassigning the same `src` is ignored by the cache, and only a fresh element restarts the loop.
            key={replayToken}
            className="size-full"
            // INFO: The plate's radius, for the plate's reason. `toBox` sizes this box to the asset's own ratio, so `object-contain` fills it exactly — and at `2xs` padding a square corner clears the card's 16px curve by under half a pixel, which is flush. A transparent sticker has nothing in that corner to clip; a full-bleed one is the case this is for.
            imgClassName="size-full object-contain rounded-sm"
            // INFO: `rounded-[inherit]` on the plate resolves against this wrapper, not the `rounded-sm` button above it — matched by hand so the skeleton is not a square inside a rounded card.
            placeholderClassName="rounded-sm"
            alt=""
            width={box.width}
            height={box.height}
            draggable={false}
            src={toEmoticonAssetUrl(emoticon.id, "animated-image", emoticon.version)}
          />
        </button>
        {/* INFO: `className` positions the haptic wrapper and `buttonClassName` styles the disc inside it — the split `IconButton` exposes precisely so a positioned control can still ask for `haptic` (`AGENTS.md § 1.2.`). */}
        <IconButton
          className="absolute -top-2xs -right-2xs"
          buttonClassName="size-7 border border-hairline bg-canvas shadow-floating hover:bg-surface-soft"
          iconClassName="size-3.5"
          Icon={X}
          haptic
          aria-label="이모티콘 취소"
          onClick={onRemove}
        />
      </div>
    </div>
  );

  function handleTap() {
    setReplayToken((current) => current + 1);

    if (emoticon.hasAudio) {
      // WARN: Inside the click handler with nothing awaited before it — iOS grants the gesture's audio permission to this call stack alone, so any `await` first loses it.
      playSound(toEmoticonAssetUrl(emoticon.id, "audio", emoticon.version));
    }
  }
}

function toBox({ width, height }: Emoticon) {
  const scale = Math.min(1, MAX_EDGE / Math.max(width, height));

  return { width: Math.round(width * scale), height: Math.round(height * scale) };
}
