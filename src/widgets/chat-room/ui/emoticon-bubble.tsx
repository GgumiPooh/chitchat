"use client";

import type { Emoticon } from "@/entities/emoticon";
import { toEmoticonAssetUrl } from "@/shared/config";
import { cn } from "@/shared/lib";
import { PreloadImage } from "@/shared/ui";
import { useState } from "react";
import { playEmoticonSound } from "../model/play-emoticon-sound";
import { toEmoticonBox } from "../model/to-emoticon-box";

export type EmoticonBubbleProps = {
  className?: string;
  emoticon: Emoticon;
  /** REQUIREMENTS.md § 13.9. 따라하기 — the same tap that replays this also opens the picker where this emoticon is. */
  onFollow?: () => void;
};

/**
 * DESIGN.md § 6.5. The image alone — no bubble, no border, no background.
 *
 * INFO: REQUIREMENTS.md § 13.2. One image slot, so nothing here knows whether the
 * item animates — an animated file plays because the browser plays it. A tap
 * restarts it and replays the sound; the sound a newly arrived emoticon makes by
 * itself is the room's business, not the bubble's (§ 13.6.), so scrolling past
 * four of them still plays nothing.
 *
 * INFO: REQUIREMENTS.md § 13.9. That one tap now also opens the picker on this
 * emoticon. The replay and the sound are kept rather than traded away — they are two
 * of § 13.6.'s four moments, and a tap that stopped sounding to open a panel would
 * be answering a different question than the one that was asked.
 */
export function EmoticonBubble({ className, emoticon, onFollow }: EmoticonBubbleProps) {
  const [replayToken, setReplayToken] = useState(0);
  const box = toEmoticonBox(emoticon);

  return (
    <div className={cn("flex", className)} style={{ width: box.width, height: box.height }}>
      <button
        className="size-full cursor-pointer rounded-sm transition-transform focus-visible:ring-2 focus-visible:ring-primary focus-visible:outline-none active:scale-[0.96]"
        type="button"
        aria-label="이모티콘"
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
          src={toEmoticonAssetUrl(emoticon.id, "animated-image", emoticon.version)}
        />
      </button>
    </div>
  );

  function handleTap() {
    setReplayToken((current) => current + 1);
    // WARN: Inside the click handler with nothing awaited before it — iOS grants the gesture's audio permission to this call stack alone, so any `await` first loses it.
    playEmoticonSound(emoticon);
    onFollow?.();
  }
}
