"use client";

import { BottomSheet, Slider } from "@/shared/ui";
import { runColumnsTransition } from "../model/run-columns-transition";
import type { ArchiveColumnCount } from "../model/use-pinch-columns";

export type ArchiveColumnsSheetProps = {
  className?: string;
  isOpen: boolean;
  columns: ArchiveColumnCount;
  onClose: () => void;
  onColumnsChange: (columns: ArchiveColumnCount) => void;
};

const MIN_COLUMNS = 1;
const MAX_COLUMNS = 7;

/**
 * AGENTS.md § 4.1. 사진의 열 개수 — the header's `LayoutGrid` control,
 * for a pointer that cannot pinch. `BottomSheet` becomes a centred Modal at `md`+
 * on its own, so this is the same control on every pointer and every width.
 */
export function ArchiveColumnsSheet({
  className,
  isOpen,
  columns,
  onClose,
  onColumnsChange,
}: ArchiveColumnsSheetProps) {
  return (
    <BottomSheet
      className={className}
      isOpen={isOpen}
      header={{ title: "열 개수" }}
      onClose={onClose}
    >
      <div className="flex items-center gap-md p-md">
        <Slider
          className="flex-1"
          min={MIN_COLUMNS}
          max={MAX_COLUMNS}
          step={1}
          value={[columns]}
          aria-label="열 개수"
          onValueChange={handleChange}
        />
        <span className="w-10 shrink-0 text-right text-body-sm text-meta tabular-nums" aria-hidden>
          {columns}열
        </span>
      </div>
    </BottomSheet>
  );

  function handleChange(next: number[]) {
    const value = next[0];

    if (value === undefined || value === columns) {
      return;
    }

    // INFO: AGENTS.md § 4.1. A slider step reads as the grid's tiles resizing rather than a layout cut, exactly as the pinch does.
    runColumnsTransition(() => onColumnsChange(value as ArchiveColumnCount));
  }
}
