"use client";

import type { Emoticon } from "@/entities/emoticon";
import { toEmoticonAssetUrl } from "@/shared/config";
import { cn } from "@/shared/lib";
import { PreloadImage } from "@/shared/ui";
import { useSortable } from "@dnd-kit/sortable";

export type EmoticonItemCellProps = {
  className?: string;
  item: Emoticon;
  isThumbnail: boolean;
  onSelect: (itemId: string) => void;
};

/**
 * One cell of the pack's grid — tap to open its actions, long-press to drag.
 *
 * WARN: The listeners go on the cell itself, because a 4-column square leaves no
 * room for the § 13.5. grip handle. `touch-manipulation` rather than `touch-none`
 * is what keeps the page scrollable over the grid: the touch sensor activates on a
 * delay, so a finger that starts scrolling cancels the press instead of being
 * swallowed by it.
 */
export function EmoticonItemCell({
  className,
  item,
  isThumbnail,
  onSelect,
}: EmoticonItemCellProps) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: item.id,
  });

  return (
    <button
      ref={setNodeRef}
      className={cn(
        "relative aspect-square touch-manipulation rounded-sm border p-2xs transition-colors hover:bg-surface-soft focus-visible:ring-2 focus-visible:ring-primary focus-visible:outline-none active:bg-surface-strong",
        isThumbnail ? "border-primary bg-primary-tint" : "border-hairline bg-canvas",
        // INFO: DESIGN.md § 4.5. The lifted cell is genuinely floating above the others, which is the one case a shadow is earned.
        isDragging && "z-10 shadow-raised",
        className,
      )}
      type="button"
      aria-label="이모티콘"
      // INFO: Both axes, unlike the § 13.5. list — a grid moves a cell sideways as often as it moves it down.
      style={{
        transform: transform ? `translate3d(${transform.x}px, ${transform.y}px, 0)` : undefined,
        transition,
      }}
      {...attributes}
      {...listeners}
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
