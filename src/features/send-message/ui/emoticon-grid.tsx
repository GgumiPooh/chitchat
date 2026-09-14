"use client";

import type { Emoticon } from "@/entities/emoticon";
import { cn, type EmoticonItemId, type Nullable } from "@/shared/lib";
import { EmoticonCell } from "./emoticon-cell";

export type EmoticonGridProps = {
  className?: string;
  items: Emoticon[];
  isMini?: boolean;
  /** Index offset in the list its scroller holds, for multi-section tabs (recents, favorites, all). */
  offset?: number;
  /** REQUIREMENTS.md § 8.14. Index of the cell in the tab sequence (roving tabindex). */
  focusableIndex: number;
  /** REQUIREMENTS.md § 8.14. Whether the panel is being driven by the keyboard. */
  isKeyboardDriven: boolean;
  isWarmed?: boolean;
  eagerCount?: number;
  revealedId?: Nullable<EmoticonItemId>;
  ariaLabel: string;
  onSelect: (item: Emoticon) => void;
  onFocusCell?: (index: number) => void;
};

/**
 * Renders a 4-column (emoticon) or 6-column (mini) grid of EmoticonCells,
 * with unified roving tabindex and accessibility attributes.
 */
export function EmoticonGrid({
  className,
  items,
  isMini = false,
  offset = 0,
  focusableIndex,
  isKeyboardDriven,
  isWarmed = false,
  eagerCount = 0,
  revealedId = null,
  ariaLabel,
  onSelect,
  onFocusCell,
}: EmoticonGridProps) {
  return (
    <div
      className={cn(isMini ? "square-grid-6" : "square-grid-4", className)}
      role="group"
      aria-label={ariaLabel}
    >
      {items.map((item, i) => {
        const cellIndex = offset + i;

        return (
          <EmoticonCell
            key={item.id}
            className="flex"
            buttonClassName="square-cell w-full"
            item={item}
            index={cellIndex}
            isFocusable={cellIndex === focusableIndex}
            isWarmed={isWarmed}
            eagerCount={eagerCount}
            isKeyboardDriven={isKeyboardDriven}
            isRevealed={revealedId === item.id}
            isMini={isMini}
            onSelect={onSelect}
            onFocusCell={onFocusCell}
          />
        );
      })}
    </div>
  );
}
