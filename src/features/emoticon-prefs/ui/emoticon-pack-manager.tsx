"use client";

import type { EmoticonPackSummary } from "@/entities/emoticon";
import { cn, useSortableSensors, type Nullable } from "@/shared/lib";
import { EmptyState, toast } from "@/shared/ui";
import { DndContext, closestCenter, type DragEndEvent } from "@dnd-kit/core";
import { restrictToParentElement, restrictToVerticalAxis } from "@dnd-kit/modifiers";
import { SortableContext, arrayMove, verticalListSortingStrategy } from "@dnd-kit/sortable";
import { Smile } from "lucide-react";
import { useRef } from "react";
import { saveEmoticonPackOrder } from "../api/write-prefs";
import { EmoticonPackRow } from "./emoticon-pack-row";

export type EmoticonPackManagerProps = {
  className?: string;
  packs: EmoticonPackSummary[];
  /** REQUIREMENTS.md § 13.5. The pack 숨기기 was chosen for, while its row collapses. */
  hidingId: Nullable<string>;
  onOpenPack: (packId: string) => void;
  onManagePack: (packId: string) => void;
  onPackHidden: (packId: string) => void;
  onPacksChange: (packs: EmoticonPackSummary[]) => void;
};

/**
 * REQUIREMENTS.md § 13.5. The 사용중 list — long-press to move a pack, and the row's
 * own `⋮` to rename, hide or delete it. All three are per-user or the pack's own; none
 * of them is a viewport decision.
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
  hidingId,
  onOpenPack,
  onManagePack,
  onPackHidden,
  onPacksChange,
}: EmoticonPackManagerProps) {
  const sensors = useSortableSensors();
  /**
   * REQUIREMENTS.md § 13.5. The chain every move is written on, and the generation
   * that abandons whatever is still queued on it.
   *
   * WARN: § 13.5. Serialized, and that is correctness rather than politeness. The
   * server bisects the moved pack's two neighbours **as the request finds them**, so
   * two moves in flight at once both compute against a list the other has not landed
   * in — the screen is right and a reload shows an order nobody asked for. The
   * whole-list `PUT` this replaced survived the same race because every request
   * carried a complete order; a one-row write does not.
   *
   * WARN: § 13.5. A failure ends the chain rather than pausing it. The rollback
   * restores the list as it stood before the move that failed, so every write still
   * queued behind it names a neighbour out of a list that no longer exists — sent
   * anyway, it would persist an order off a screen the user is no longer looking at.
   * The generation is bumped there, which drops those; a drag made afterwards is
   * against the restored list and starts a fresh chain.
   */
  const orderWritesRef = useRef({ tail: Promise.resolve(), generation: 0 });

  if (packs.length === 0) {
    return (
      <EmptyState
        className={className}
        Icon={Smile}
        description="사용 중인 이모티콘 그룹이 없어요. 이모티콘셋 검색에서 켜거나 오른쪽 위 + 로 만들 수 있어요"
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
              isHiding={pack.id === hidingId}
              onOpen={onOpenPack}
              onManage={onManagePack}
              onHidden={onPackHidden}
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

    // INFO: § 13.5. The moved pack lands at `to`, so the pack it now sits behind is the one before it — and none at all when it landed at the front.
    const after = to === 0 ? null : next[to - 1].id;

    queueOrderWrite(next[to].id, after, previous);
  }

  function queueOrderWrite(
    packId: string,
    after: Nullable<string>,
    previous: EmoticonPackSummary[],
  ) {
    const writes = orderWritesRef.current;
    const { generation } = writes;

    // WARN: The chain itself never rejects — the failure is handled inside, so a rejected write cannot leave an unhandled rejection behind or stop the moves the user makes after it.
    writes.tail = writes.tail.then(async () => {
      if (writes.generation !== generation) {
        return;
      }

      try {
        await saveEmoticonPackOrder(packId, after);
      } catch {
        writes.generation += 1;
        onPacksChange(previous);
        toast.error("순서를 저장하지 못했어요");
      }
    });
  }
}
