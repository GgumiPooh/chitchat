"use client";

import type { Emoticon } from "@/entities/emoticon";
import { cn, type Nullable } from "@/shared/lib";
import { EmoticonItemCell } from "./emoticon-item-cell";

export type EmoticonItemGridProps = {
  className?: string;
  items: Emoticon[];
  thumbnailItemId: Nullable<string>;
  onSelect: (itemId: string) => void;
};

/**
 * REQUIREMENTS.md § 13.1. The pack's items, in the shared
 * `emoticon_items.sort_order` the server returns them in.
 */
export function EmoticonItemGrid({
  className,
  items,
  thumbnailItemId,
  onSelect,
}: EmoticonItemGridProps) {
  return (
    // INFO: DESIGN.md § 9. Arbitrary aspect ratios, so the cell is a fixed square and the still is `object-contain` inside it.
    <div className={cn("grid grid-cols-4 gap-2xs", className)}>
      {items.map((item) => (
        <EmoticonItemCell
          key={item.id}
          item={item}
          isThumbnail={item.id === thumbnailItemId}
          onSelect={onSelect}
        />
      ))}
    </div>
  );
}
