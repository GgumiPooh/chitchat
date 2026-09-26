"use client";

import { cn } from "@/shared/lib";
import { Button } from "@/shared/ui";
import { Ban, CheckCircle, Trash2, X } from "lucide-react";

export type VocaBatchActionsProps = {
  className?: string;
  selectedCount: number;
  onSuspendSelected: () => void;
  onUnsuspendSelected: () => void;
  onDeleteSelected: () => void;
  onClearSelection: () => void;
};

export function VocaBatchActions({
  className,
  selectedCount,
  onSuspendSelected,
  onUnsuspendSelected,
  onDeleteSelected,
  onClearSelection,
}: VocaBatchActionsProps) {
  if (selectedCount === 0) {
    return null;
  }

  return (
    <div
      className={cn(
        "bg-surface/95 fixed bottom-20 left-1/2 z-30 flex -translate-x-1/2 items-center gap-2 rounded-2xl border border-hairline px-4 py-2.5 shadow-lg backdrop-blur-md",
        className,
      )}
    >
      <span className="text-body-sm font-semibold text-ink">{selectedCount}개 선택됨</span>

      <div className="h-4 w-px bg-hairline" />

      <Button
        className="min-h-9 w-auto px-3 py-1 text-button-sm"
        variant="ghost"
        onClick={onSuspendSelected}
      >
        <Ban className="mr-1 h-3.5 w-3.5" />
        보류
      </Button>

      <Button
        className="min-h-9 w-auto px-3 py-1 text-button-sm"
        variant="ghost"
        onClick={onUnsuspendSelected}
      >
        <CheckCircle className="mr-1 h-3.5 w-3.5" />
        해제
      </Button>

      <Button
        className="min-h-9 w-auto px-3 py-1 text-button-sm"
        variant="destructive"
        onClick={onDeleteSelected}
      >
        <Trash2 className="mr-1 h-3.5 w-3.5" />
        삭제
      </Button>

      <Button
        className="min-h-9 w-auto px-2 py-1 text-button-sm"
        variant="ghost"
        onClick={onClearSelection}
      >
        <X className="h-3.5 w-3.5" />
      </Button>
    </div>
  );
}
