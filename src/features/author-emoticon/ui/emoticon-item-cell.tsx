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
    <button
      className={cn(
        "relative aspect-square rounded-sm border p-2xs transition-colors hover:bg-surface-soft focus-visible:ring-2 focus-visible:ring-primary focus-visible:outline-none active:bg-surface-strong",
        isThumbnail ? "border-primary bg-primary-tint" : "border-hairline bg-canvas",
        className,
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
  );
}
