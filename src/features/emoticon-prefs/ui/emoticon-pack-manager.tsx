"use client";

import type { EmoticonPackSummary } from "@/entities/emoticon";
import { cn, useSortableSensors } from "@/shared/lib";
import { EmptyState, toast } from "@/shared/ui";
import { DndContext, closestCenter, type DragEndEvent } from "@dnd-kit/core";
import { restrictToParentElement, restrictToVerticalAxis } from "@dnd-kit/modifiers";
import { SortableContext, arrayMove, verticalListSortingStrategy } from "@dnd-kit/sortable";
import { Smile } from "lucide-react";
import { saveEmoticonPackEnabled, saveEmoticonPackOrder } from "../api/write-prefs";
import { EmoticonPackRow } from "./emoticon-pack-row";

export type EmoticonPackManagerProps = {
  className?: string;
  packs: EmoticonPackSummary[];
  onOpenPack: (packId: string) => void;
  onManagePack: (packId: string) => void;
  onPacksChange: (packs: EmoticonPackSummary[]) => void;
};

/**
 * REQUIREMENTS.md § 13.5. The KakaoTalk 이모티콘 관리 list — long-press to move a
 * pack, a switch to hide it. Both are per-user and neither touches the pack itself.
 *
 * WARN: Fully controlled — the order lives in the caller, which also creates,
 * renames and deletes packs. Holding it here as well would let a rename overwrite
 * a drag that had already been persisted.
 *
 * The order is applied optimistically and only then persisted. A drag that snapped
 * back while the request flew would read as the gesture having failed, so a
 * rejected write restores the previous order and says so instead.
 */
export function EmoticonPackManager({
  className,
  packs,
  onOpenPack,
  onManagePack,
  onPacksChange,
}: EmoticonPackManagerProps) {
  const sensors = useSortableSensors();

  if (packs.length === 0) {
    return (
      <EmptyState
        className={className}
        Icon={Smile}
        description="오른쪽 위 + 를 눌러 이모티콘 그룹을 만들면 여기에서 관리할 수 있어요"
      />
    );
  }

  return (
    <div className={cn("flex flex-col", className)}>
      <DndContext
        sensors={sensors}
        collisionDetection={closestCenter}
        // INFO: DESIGN.md § 3.3. A one-column list inside a 576px shell — horizontal travel would only ever be a mis-drag.
        modifiers={[restrictToVerticalAxis, restrictToParentElement]}
        onDragEnd={handleDragEnd}
      >
        <SortableContext
          items={packs.map((pack) => pack.id)}
          strategy={verticalListSortingStrategy}
        >
          {packs.map((pack) => (
            <EmoticonPackRow
              key={pack.id}
              pack={pack}
              onOpen={onOpenPack}
              onManage={onManagePack}
              onToggle={handleToggle}
            />
          ))}
        </SortableContext>
      </DndContext>
    </div>
  );

  function handleDragEnd({ active, over }: DragEndEvent) {
    if (!over || active.id === over.id) {
      return;
    }

    const from = packs.findIndex((pack) => pack.id === active.id);
    const to = packs.findIndex((pack) => pack.id === over.id);

    if (from < 0 || to < 0) {
      return;
    }

    const previous = packs;
    const next = arrayMove(packs, from, to);

    onPacksChange(next);

    void saveEmoticonPackOrder(next.map((pack) => pack.id)).catch(() => {
      onPacksChange(previous);
      toast.error("순서를 저장하지 못했어요");
    });
  }

  function handleToggle(packId: string, isEnabled: boolean) {
    const previous = packs;

    onPacksChange(packs.map((pack) => (pack.id === packId ? { ...pack, isEnabled } : pack)));

    void saveEmoticonPackEnabled(packId, isEnabled).catch(() => {
      onPacksChange(previous);
      toast.error("설정을 저장하지 못했어요");
    });
  }
}
