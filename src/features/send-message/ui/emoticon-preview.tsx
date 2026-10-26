"use client";

import type { Emoticon } from "@/entities/emoticon";
import { toEmoticonAssetUrl } from "@/shared/config";
import { cn, useSyncedEmoticonPlayback } from "@/shared/lib";
import { IconButton, PreloadImage, Skeleton } from "@/shared/ui";
import { Search, Star, X } from "lucide-react";
import { useEffect } from "react";
import { useEmoticonFavorites } from "../model/use-emoticon-favorites";
import { useHiddenEmoticonPacks } from "../model/use-hidden-emoticon-packs";

// INFO: Smaller than the § 6.5. bubble — this is a staged attachment, and it sits above the composer where `MediaTray`'s thumbnails do.
const MAX_EDGE = 96;

export type EmoticonPreviewProps = {
  className?: string;
  emoticon: Emoticon;
  onRemove: () => void;
  /** REQUIREMENTS.md § 13.9. Opens the search/reveal picker for this emoticon. */
  onFollow?: () => void;
};

/**
 * REQUIREMENTS.md § 13.6. The staged emoticon, waiting for send.
 *
 * INFO: The animation and the sound start together the moment it is staged — unlike
 * a bubble there is no scrolling for an observer to track, it is on screen by
 * definition. A tap replays both, which is the bubble's gesture (§ 13.6.).
 *
 * WARN: Keyed by the emoticon at the call site, so staging another remounts this and the mount effect plays it.
 */
export function EmoticonPreview({ className, emoticon, onRemove, onFollow }: EmoticonPreviewProps) {
  const { hasAnimated, hasAudio } = emoticon;
  const { isFavorite, toggleFavorite } = useEmoticonFavorites();
  const { isOfficeMode, isPackHidden } = useHiddenEmoticonPacks();
  const isAssetBlocked = isOfficeMode && isPackHidden(emoticon.packId);
  // INFO: REQUIREMENTS.md § 12. Office Mode silences emoticon staging preview.
  const isAudioBlocked = isOfficeMode || isAssetBlocked;
  const favorited = isFavorite(emoticon.id);
  const box = toBox(emoticon);
  const emoticonAssetUrl = isAssetBlocked
    ? ""
    : toEmoticonAssetUrl(
        emoticon.id,
        hasAnimated ? "animated-image" : "still-image",
        emoticon.version,
      );
  const { phase, frameRef, play } = useSyncedEmoticonPlayback({
    imageSrc: emoticonAssetUrl,
    audioSrc: isAudioBlocked ? "" : toEmoticonAssetUrl(emoticon.id, "audio", emoticon.version),
    hasAnimated: isAssetBlocked ? false : hasAnimated,
    hasAudio: isAudioBlocked ? false : hasAudio,
    frameClassName: "rounded-md",
    startsHeld: isAssetBlocked ? false : hasAnimated,
    isEnabled: !isAssetBlocked,
  });

  useEffect(() => {
    if (!isAssetBlocked) {
      void play();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- Once, on the stage.
  }, [isAssetBlocked]);

  return (
    // INFO: REQUIREMENTS.md § 13.6. Centered rather than aligned to the send side — this is what is about to be sent, not a rehearsal of where its bubble lands.
    // WARN: REQUIREMENTS.md § 13.6. The row stays transparent to the pointer and only the card below takes taps. It floats over the history rather than pushing it, so a full-width band that took them would be a strip of dead history on either side of a 96px card.
    <div
      className={cn(
        "flex animate-in justify-center duration-200 fade-in slide-in-from-bottom-2",
        className,
      )}
    >
      <div className="pointer-events-auto flex min-h-[68px] items-stretch gap-1 rounded-2xl border border-hairline bg-surface-soft/90 p-xs shadow-floating backdrop-blur-md">
        {/* Left column: Star on top, Search on bottom */}
        <div className="flex flex-col justify-between self-stretch">
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
          {onFollow && (
            <IconButton
              buttonClassName="size-7 text-meta transition-colors hover:bg-canvas/60"
              iconClassName="size-4"
              Icon={Search}
              haptic
              aria-label="연관 이모티콘 검색"
              onClick={onFollow}
            />
          )}
        </div>

        {/* Emoticon asset button */}
        <button
          className="flex cursor-pointer items-center justify-center self-center rounded-lg transition-transform focus-visible:ring-2 focus-visible:ring-primary focus-visible:outline-none active:scale-[0.96]"
          type="button"
          style={{ width: box.width, height: box.height }}
          aria-label={isAssetBlocked ? (emoticon.keywords[0] ?? "이모티콘") : "이모티콘 다시 재생"}
          onClick={() => {
            if (!isAssetBlocked) {
              void play();
            }
          }}
        >
          {isAssetBlocked ? (
            <div className="flex size-full flex-col items-center justify-center p-xs text-center select-none">
              <span className="truncate text-body-sm font-medium text-meta">
                {emoticon.keywords[0] ?? "이모티콘"}
              </span>
            </div>
          ) : (
            <>
              {/* WARN: `hidden` until the frame is in — see `EmoticonBubble`. */}
              <div ref={frameRef} className={cn("size-full", phase !== "frame" && "hidden")} />
              {phase === "held" && <Skeleton className="size-full rounded-md" />}
              {phase === "idle" && (
                <PreloadImage
                  className="size-full"
                  imgClassName="size-full object-contain rounded-md"
                  placeholderClassName="rounded-md"
                  alt=""
                  width={box.width}
                  height={box.height}
                  draggable={false}
                  src={emoticonAssetUrl}
                />
              )}
            </>
          )}
        </button>

        {/* Right column: Close button on top */}
        <div className="flex flex-col justify-start self-stretch">
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
    </div>
  );
}

function toBox({ width, height }: Emoticon) {
  const scale = Math.min(1, MAX_EDGE / Math.max(width, height));

  return { width: Math.round(width * scale), height: Math.round(height * scale) };
}
