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
    // INFO: Aligned to the send side, so the staged emoticon sits where its own bubble will land (DESIGN.md § 6.2.).
    <div
      className={cn(
        "pointer-events-auto flex animate-in justify-end duration-200 fade-in slide-in-from-bottom-2",
        className,
      )}
    >
      <div className="relative rounded-lg border border-hairline glass p-2xs shadow-floating">
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
            imgClassName="size-full object-contain"
            alt=""
            width={box.width}
            height={box.height}
            draggable={false}
            src={toEmoticonAssetUrl(emoticon.id, "image", emoticon.version)}
          />
        </button>
        <IconButton
          className="absolute -top-2xs -right-2xs size-7 border border-hairline bg-canvas shadow-floating hover:bg-surface-soft"
          iconClassName="size-3.5"
          Icon={X}
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
