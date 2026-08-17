"use client";

import type { Emoticon } from "@/entities/emoticon";
import { toEmoticonAssetUrl, type EmoticonPackType } from "@/shared/config";
import {
  MINI_ANIMATION_LOOP_INTERVAL,
  cn,
  toReplaySrc,
  useViewportReplay,
  type EmoticonItemId,
} from "@/shared/lib";
import { PreloadImage } from "@/shared/ui";

export type EmoticonItemCellProps = {
  className?: string;
  /** INFO: REQUIREMENTS.md § 13. Only the caption differs — a mini carries no words, so it has nothing to put under the cell. */
  type: EmoticonPackType;
  item: Emoticon;
  isThumbnail: boolean;
  onSelect: (itemId: EmoticonItemId) => void;
};

/**
 * One cell of the pack's grid — tap to open its actions.
 */
export function EmoticonItemCell({
  className,
  type,
  item,
  isThumbnail,
  onSelect,
}: EmoticonItemCellProps) {
  const isMini = type === "mini";
  // WARN: § 13. Same fake-infinite loop as the send-message picker's mini grid — a GIF/WebP/APNG's own loop count is not always infinite, so this remounts on a timer while the cell is actually on screen.
  const { ref, replayToken } = useViewportReplay(isMini ? MINI_ANIMATION_LOOP_INTERVAL : undefined);

  return (
    <div className={cn("space-y-2xs", className)}>
      <button
        ref={ref}
        className={cn(
          "relative aspect-square w-full rounded-sm border p-2xs transition-colors hover:bg-surface-soft focus-visible:ring-2 focus-visible:ring-primary focus-visible:outline-none active:bg-surface-strong",
          isThumbnail ? "border-primary bg-primary-tint" : "border-hairline bg-canvas",
        )}
        type="button"
        aria-label={item.keywords[0] ?? "이모티콘"}
        onClick={() => onSelect(item.id)}
      >
        <PreloadImage
          // WARN: Keyed by the replay token, and the token also rides the URL (`toReplaySrc`) — a mini's own loop count is not always infinite, and a fresh element alone does not restart one on iOS Safari (`useViewportReplay`).
          key={replayToken}
          className="size-full"
          imgClassName="size-full object-contain"
          placeholderClassName="rounded-sm"
          alt=""
          draggable={false}
          // WARN: § 13. `replayToken > 0` only happens while the cell is in view (`useViewportReplay`), so the element being remounted already painted once and sits in the browser's own cache — `lazy` there re-runs the viewport check on the fresh `<img>` and reads as a reload; `eager` plus the deferred skeleton is what the send-message picker's grid uses for the same remount.
          hasDeferredSkeleton={replayToken > 0}
          loading={replayToken > 0 ? "eager" : "lazy"}
          // INFO: REQUIREMENTS.md § 13. A mini is only ever shown moving — the send-message picker's own rule — so this grid draws the same slot rather than the still an 이모티콘 pack's cell draws.
          src={toReplaySrc(
            toEmoticonAssetUrl(item.id, isMini ? "animated-image" : "still-image", item.version),
            replayToken,
          )}
        />
      </button>
      {/* INFO: § 13.8.1. One line, clamped. The grid is four columns wide, so a full chip row per cell would be taller than the emoticon it describes — and 키워드 없음 is what makes 자동으로 채우기's count legible on the grid rather than only in its label. */}
      {type !== "mini" && (
        <p
          className={cn(
            "truncate text-center text-caption",
            item.keywords.length ? "text-meta" : "text-meta-soft",
          )}
        >
          {item.keywords.length ? item.keywords.join(", ") : "키워드 없음"}
        </p>
      )}
    </div>
  );
}
