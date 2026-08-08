"use client";

import type { Emoticon } from "@/entities/emoticon";
import { toEmoticonAssetUrl } from "@/shared/config";
import { cn } from "@/shared/lib";
import { PreloadImage } from "@/shared/ui";

export type EmoticonItemCellProps = {
  className?: string;
  item: Emoticon;
  isThumbnail: boolean;
  onSelect: (itemId: string) => void;
};

/**
 * One cell of the pack's grid — tap to open its actions.
 */
export function EmoticonItemCell({
  className,
  item,
  isThumbnail,
  onSelect,
}: EmoticonItemCellProps) {
  return (
    <div className={cn("space-y-2xs", className)}>
      <button
        className={cn(
          "relative aspect-square w-full rounded-sm border p-2xs transition-colors hover:bg-surface-soft focus-visible:ring-2 focus-visible:ring-primary focus-visible:outline-none active:bg-surface-strong",
          isThumbnail ? "border-primary bg-primary-tint" : "border-hairline bg-canvas",
        )}
        type="button"
        aria-label="이모티콘"
        onClick={() => onSelect(item.id)}
      >
        <PreloadImage
          className="size-full"
          imgClassName="size-full object-contain"
          placeholderClassName="rounded-sm"
          src={toEmoticonAssetUrl(item.id, "image", item.version)}
          alt=""
          draggable={false}
          loading="lazy"
        />
      </button>
      {/* INFO: § 13.8.1. One line, clamped. The grid is four columns wide, so a full chip row per cell would be taller than the emoticon it describes — and 키워드 없음 is what makes 자동으로 채우기's count legible on the grid rather than only in its label. */}
      <p
        className={cn(
          "truncate text-center text-caption",
          item.keywords.length ? "text-meta" : "text-meta-soft",
        )}
      >
        {item.keywords.length ? item.keywords.join(", ") : "키워드 없음"}
      </p>
    </div>
  );
}
