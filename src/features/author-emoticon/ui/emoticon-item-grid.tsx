"use client";

import type { Emoticon } from "@/entities/emoticon";
import { cn, useSortableSensors, type Nullable } from "@/shared/lib";
import { toast } from "@/shared/ui";
import { DndContext, closestCenter, type DragEndEvent } from "@dnd-kit/core";
import { restrictToParentElement } from "@dnd-kit/modifiers";
import { SortableContext, arrayMove, rectSortingStrategy } from "@dnd-kit/sortable";
import { saveEmoticonOrder } from "../api/write-emoticon";
import { EmoticonItemCell } from "./emoticon-item-cell";

export type EmoticonItemGridProps = {
  className?: string;
  packId: string;
  items: Emoticon[];
  thumbnailItemId: Nullable<string>;
  onSelect: (itemId: string) => void;
  onReorder: (items: Emoticon[]) => void;
};

/**
 * REQUIREMENTS.md § 13.1. The pack's items, reordered by long-press and drag. The
 * order is written to `emoticon_items.sort_order` and is therefore **shared** —
 * the other participant's picker follows it too, unlike the per-user pack order of
 * § 13.5.
 *
 * WARN: The move is applied optimistically and only then persisted, for the same
 * reason § 13.5. does it: a cell that snapped back while the request flew would
 * read as the gesture having failed. A rejected write restores the previous order
 * and says so.
 */
export function EmoticonItemGrid({
  className,
  packId,
  items,
  thumbnailItemId,
  onSelect,
  onReorder,
}: EmoticonItemGridProps) {
  const sensors = useSortableSensors();

  return (
    <DndContext
      sensors={sensors}
      collisionDetection={closestCenter}
      modifiers={[restrictToParentElement]}
      onDragEnd={handleDragEnd}
    >
      <SortableContext items={items.map((item) => item.id)} strategy={rectSortingStrategy}>
        {/* INFO: DESIGN.md § 9. Arbitrary aspect ratios, so the cell is a fixed square and the still is `object-contain` inside it. */}
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
      </SortableContext>
    </DndContext>
  );

  function handleDragEnd({ active, over }: DragEndEvent) {
    if (!over || active.id === over.id) {
      return;
    }

    const from = items.findIndex((item) => item.id === active.id);
    const to = items.findIndex((item) => item.id === over.id);

    if (from < 0 || to < 0) {
      return;
    }

    const previous = items;
    const next = arrayMove(items, from, to);

    onReorder(next);

    void saveEmoticonOrder(
      packId,
      next.map((item) => item.id),
    ).catch(() => {
      onReorder(previous);
      toast.error("순서를 저장하지 못했어요");
    });
  }
}
