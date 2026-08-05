"use client";

import type { Emoticon } from "@/entities/emoticon";
import { toEmoticonAssetUrl } from "@/shared/config";
import { cn, type Nullable } from "@/shared/lib";
import { useEffect, useRef, useState } from "react";

// INFO: DESIGN.md § 6.5. The emoticon renders at its own aspect ratio inside this square ceiling, never cropped to it.
const MAX_EDGE = 140;

// INFO: Enough of the row on screen to count as "being looked at" — a sliver appearing at the edge of the viewport is not.
const AUTOPLAY_VISIBILITY = 0.5;

export type EmoticonBubbleProps = {
  className?: string;
  emoticon: Emoticon;
};

/**
 * DESIGN.md § 6.5. The image alone — no bubble, no border, no background.
 *
 * REQUIREMENTS.md § 13.6. An animated item plays whenever it is on screen and
 * stops when it leaves, which is KakaoTalk's behaviour. Audio is a separate thing
 * and plays on tap only: iOS refuses to start audio outside a user gesture, and a
 * scroll past four animated emoticons must not play four sounds.
 */
export function EmoticonBubble({ className, emoticon }: EmoticonBubbleProps) {
  const [isPlaying, setIsPlaying] = useState(false);
  const [replayToken, setReplayToken] = useState(0);
  const rootRef = useRef<Nullable<HTMLDivElement>>(null);
  const audioRef = useRef<Nullable<HTMLAudioElement>>(null);
  const box = toBox(emoticon);

  // INFO: § 8.3. The virtualizer unmounts an offscreen row, so this observer is only ever watching rows near the viewport — the cost is bounded by the window, not by the history.
  useEffect(() => {
    const node = rootRef.current;

    if (!node || !emoticon.hasAnimation) {
      return;
    }

    const observer = new IntersectionObserver(([entry]) => setIsPlaying(entry.isIntersecting), {
      threshold: AUTOPLAY_VISIBILITY,
    });

    observer.observe(node);

    return () => observer.disconnect();
  }, [emoticon.hasAnimation]);

  return (
    <div
      ref={rootRef}
      className={cn("flex", className)}
      style={{ width: box.width, height: box.height }}
    >
      <button
        className="size-full cursor-pointer rounded-sm transition-transform focus-visible:ring-2 focus-visible:ring-primary focus-visible:outline-none active:scale-[0.96]"
        type="button"
        aria-label="이모티콘"
        onClick={handleTap}
      >
        {/* eslint-disable-next-line @next/next/no-img-element -- REQUIREMENTS.md § 13.3. serves a 302 to a presigned R2 URL, which `next/image` cannot take as a loader source. */}
        <img
          // WARN: Keyed by the replay token so a tap remounts the element. A GIF or animated WebP has no seek API — reassigning the same `src` is ignored by the cache, and only a fresh element restarts the loop.
          key={replayToken}
          className="size-full object-contain"
          alt=""
          width={box.width}
          height={box.height}
          draggable={false}
          src={toEmoticonAssetUrl(
            emoticon.id,
            emoticon.hasAnimation && isPlaying ? "animated" : "still",
          )}
        />
      </button>
      {emoticon.hasAudio && (
        // INFO: `preload="none"` — most emoticons in a page are scrolled past, and the audio is only ever reached by a deliberate tap.
        <audio ref={audioRef} src={toEmoticonAssetUrl(emoticon.id, "audio")} preload="none" />
      )}
    </div>
  );

  function handleTap() {
    if (emoticon.hasAnimation) {
      setIsPlaying(true);
      setReplayToken((current) => current + 1);
    }

    // WARN: Inside the click handler with nothing awaited before it — iOS grants the gesture's audio permission to this call stack alone, so any `await` first loses it.
    audioRef.current?.play().catch(() => undefined);
  }
}

/** DESIGN.md § 6.5. The box is reserved from the stored size before the asset loads (§ 8.3.), fitted inside the 140 ceiling. */
function toBox({ width, height }: Emoticon) {
  const scale = Math.min(1, MAX_EDGE / Math.max(width, height));

  return { width: Math.round(width * scale), height: Math.round(height * scale) };
}
