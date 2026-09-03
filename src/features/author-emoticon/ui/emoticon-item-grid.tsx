"use client";

import type { Emoticon } from "@/entities/emoticon";
import type { EmoticonPackType } from "@/shared/config";
import { cn, type EmoticonItemId, type Nullable } from "@/shared/lib";
import { EmoticonItemCell } from "./emoticon-item-cell";

/** INFO: § 13. The management grid's own column counts, matching the panel a user picks from — four for 이모티콘, six for the smaller 미니이모티콘. */
const ITEM_GRID_CLASS: Record<EmoticonPackType, string> = {
  emoticon: "square-grid-4",
  mini: "square-grid-6",
};

export type EmoticonItemGridProps = {
  className?: string;
  /** REQUIREMENTS.md § 13. Which kind's grid this is — a mini is drawn six to a row, as it is in § 13.6.'s panel. */
  type: EmoticonPackType;
  items: Emoticon[];
  thumbnailItemId: Nullable<string>;
  onSelect: (itemId: EmoticonItemId) => void;
};

/**
 * REQUIREMENTS.md § 13.1. The pack's items, in the shared
 * `emoticon_items.sort_order` the server returns them in.
 */
export function EmoticonItemGrid({
  className,
  type,
  items,
  thumbnailItemId,
  onSelect,
}: EmoticonItemGridProps) {
  return (
    // INFO: DESIGN.md § 9. Arbitrary aspect ratios, so the cell is a fixed square and the still is `object-contain` inside it.
    // WARN: Written out per kind rather than interpolated — Tailwind scans source text, so a computed `grid-cols-${n}` produces no class at all.
    <div className={cn(ITEM_GRID_CLASS[type], className)}>
      {items.map((item) => (
        <EmoticonItemCell
          key={item.id}
          type={type}
          item={item}
          isThumbnail={item.id === thumbnailItemId}
          onSelect={onSelect}
        />
      ))}
    </div>
  );
}
