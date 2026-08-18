"use client";

import type { Emoticon } from "@/entities/emoticon";
import { toEmoticonAssetUrl } from "@/shared/config";
import { cn, playSound, toPreviousReplaySrc, toReplaySrc } from "@/shared/lib";
import { IconButton, PreloadImage } from "@/shared/ui";
import { Star, X } from "lucide-react";
import { useState } from "react";
import { useEmoticonFavorites } from "../model/use-emoticon-favorites";

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
  const { hasAnimated } = emoticon;
  const [replayToken, setReplayToken] = useState(0);
  const { isFavorite, toggleFavorite } = useEmoticonFavorites();
  const favorited = isFavorite(emoticon.id);
  const box = toBox(emoticon);
  const emoticonAssetUrl = toEmoticonAssetUrl(
    emoticon.id,
    hasAnimated ? "animated-image" : "still-image",
    emoticon.version,
  );

  return (
    // INFO: REQUIREMENTS.md § 13.6. Centered rather than aligned to the send side — this is what is about to be sent, not a rehearsal of where its bubble lands.
    // WARN: REQUIREMENTS.md § 13.6. The row stays transparent to the pointer and only the card below takes taps. It floats over the history rather than pushing it, so a full-width band that took them would be a strip of dead history on either side of a 96px card.
    <div
      className={cn(
        "flex animate-in justify-center duration-200 fade-in slide-in-from-bottom-2",
        className,
      )}
    >
      <div className="pointer-events-auto flex items-start gap-1 rounded-2xl border border-hairline bg-surface-soft/90 p-xs shadow-floating backdrop-blur-md">
        {/* Top-left Star button */}
        <IconButton
          buttonClassName={cn(
            "size-7 transition-colors hover:bg-canvas/60",
            favorited ? "fill-primary text-primary" : "text-meta",
          )}
          iconClassName={cn("size-4", favorited && "fill-primary text-primary")}
          Icon={Star}
          haptic
          aria-label={favorited ? "즐겨찾기 해제" : "즐겨찾기 추가"}
          onClick={() => toggleFavorite(emoticon)}
        />

        {/* Emoticon asset button */}
        <button
          className="flex cursor-pointer items-center justify-center rounded-lg transition-transform focus-visible:ring-2 focus-visible:ring-primary focus-visible:outline-none active:scale-[0.96]"
          type="button"
          style={{ width: box.width, height: box.height }}
          aria-label="이모티콘 다시 재생"
          onClick={handleTap}
        >
          <PreloadImage
            // WARN: Keyed by the replay token so a tap remounts the element, and the token also rides the URL (`toReplaySrc`) — iOS Safari ties a GIF/WebP's running loop to the request URL rather than the element, so a fresh element on an unchanged `src` restarts nothing there.
            key={hasAnimated ? replayToken : undefined}
            className="size-full"
            imgClassName="size-full object-contain rounded-md"
            placeholderClassName="rounded-md"
            alt=""
            width={box.width}
            height={box.height}
            draggable={false}
            hidesPreviewOnReveal={hasAnimated}
            src={hasAnimated ? toReplaySrc(emoticonAssetUrl, replayToken) : emoticonAssetUrl}
            // WARN: The previous replay's own frame stands in while this one decodes (`toPreviousReplaySrc`), which is what keeps the remount from ever showing the skeleton. `hidesPreviewOnReveal`, since an emoticon's own background is transparent — two frames stacked past the reveal double-expose into a ghost.
            previewSrc={
              hasAnimated ? toPreviousReplaySrc(emoticonAssetUrl, replayToken) : undefined
            }
          />
        </button>

        {/* Top-right Close button */}
        <IconButton
          buttonClassName="size-7 text-meta transition-colors hover:bg-canvas/60"
          iconClassName="size-4"
          Icon={X}
          haptic
          aria-label="이모티콘 취소"
          onClick={onRemove}
        />
      </div>
    </div>
  );

  function handleTap() {
    if (hasAnimated) {
      setReplayToken((current) => current + 1);
    }

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
