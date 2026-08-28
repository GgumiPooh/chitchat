"use client";

import type { EmoticonPackSummary } from "@/entities/emoticon";
import { cn, type EmoticonPackId } from "@/shared/lib";
import { HapticTarget, IconButton, Switch } from "@/shared/ui";
import { ChevronRight, MoreVertical } from "lucide-react";
import { EMOTICON_PACK_ROW_HEIGHT_CLASS } from "../model/pack-row-height";
import { EmoticonPackThumbnail } from "./emoticon-pack-thumbnail";

export type EmoticonPackSearchRowProps = {
  className?: string;
  pack: EmoticonPackSummary;
  onOpen: (packId: EmoticonPackId) => void;
  onToggle: (packId: EmoticonPackId, isEnabled: boolean) => void;
  onManage: (pack: EmoticonPackSummary, anchor: HTMLElement) => void;
};

/**
 * One row of the § 13.5. 이모티콘 묶음 검색 tab — the same pack as the 사용중 row, with
 * the switch instead of the grip.
 *
 * WARN: Its height is `EMOTICON_PACK_ROW_HEIGHT` exactly and nothing here may grow
 * it. The list is windowed off that number and measures nothing, so a row that sizes
 * to its contents puts every offset below it out by the difference.
 *
 * INFO: No drag handle, and that is what makes the tab possible at all — `dnd-kit`'s
 * `SortableContext` needs the whole array, which a windowed ten-thousand-row list
 * cannot give it (§ 13.5.).
 */
export function EmoticonPackSearchRow({
  className,
  pack,
  onOpen,
  onToggle,
  onManage,
}: EmoticonPackSearchRowProps) {
  return (
    <div
      className={cn(
        "flex items-center gap-sm border-b border-hairline-soft bg-canvas px-md py-xs",
        EMOTICON_PACK_ROW_HEIGHT_CLASS,
        className,
      )}
    >
      <EmoticonPackThumbnail pack={pack} />
      {/* WARN: `keepsScroll` — the name fills the row and the rows tile the document, so without it a finger scrolling ten thousand packs lands on the overlay and the list does not move at all (`DESIGN.md § 7.15.1.`). */}
      <HapticTarget className="flex min-w-0 flex-1" overlayClassName="touch-pan-y" keepsScroll>
        <button
          className="flex min-w-0 flex-1 items-center gap-2xs rounded-sm px-2xs text-left group-active:bg-surface-strong hover:bg-surface-soft focus-visible:ring-2 focus-visible:ring-primary focus-visible:outline-none active:bg-surface-strong"
          type="button"
          onClick={() => onOpen(pack.id)}
        >
          <span className="min-w-0 flex-1">
            <span
              className={cn(
                "block truncate text-title-md text-ink",
                !pack.isEnabled && "text-meta",
              )}
            >
              {pack.name}
            </span>
            <span className="block text-body-sm text-meta">{pack.itemCount}개</span>
          </span>
          <ChevronRight className="size-4 shrink-0 text-meta-soft" strokeWidth={1.75} />
        </button>
      </HapticTarget>
      <IconButton
        Icon={MoreVertical}
        haptic
        keepsScroll
        aria-label={`${pack.name} 관리`}
        onClick={(event) => onManage(pack, event.currentTarget)}
      />
      <Switch
        checked={pack.isEnabled}
        haptic
        aria-label={`${pack.name} 사용`}
        onCheckedChange={(checked) => onToggle(pack.id, checked)}
      />
    </div>
  );
}
