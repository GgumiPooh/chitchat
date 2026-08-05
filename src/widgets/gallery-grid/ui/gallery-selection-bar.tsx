"use client";

import { cn } from "@/shared/lib";
import { Button, ShellOverlay } from "@/shared/ui";
import { Download, Trash2 } from "lucide-react";

export type GallerySelectionBarProps = {
  className?: string;
  selectedCount: number;
  isBusy: boolean;
  onDownload: () => void;
  onDelete: () => void;
};

/**
 * The 저장 / 삭제 bar of REQUIREMENTS.md § 10., in the floating-surface language of
 * DESIGN.md § 3.5.
 *
 * WARN: Portalled into the shell rather than left in the screen. It has to sit
 * over the tab bar, which is a sibling of the scroller this screen lives in — and
 * going `fixed` to reach it is what AGENTS.md § 4.4. rules out.
 */
export function GallerySelectionBar({
  className,
  selectedCount,
  isBusy,
  onDownload,
  onDelete,
}: GallerySelectionBarProps) {
  const isDisabled = selectedCount === 0 || isBusy;

  return (
    <ShellOverlay>
      <div
        className={cn(
          "pointer-events-none absolute inset-x-0 bottom-0 z-30 px-md pb-[calc(env(safe-area-inset-bottom)+var(--bar-float-gap))]",
          className,
        )}
      >
        <div className="pointer-events-auto flex items-stretch gap-2xs rounded-full border border-hairline glass p-2xs shadow-floating">
          <Button
            // WARN: `flex-1 w-auto` overrides `Button`'s own `w-full shrink-0` — two of those in a row each claim the full bar and the second is pushed off the edge.
            className="min-h-11 w-auto flex-1 rounded-full"
            variant="ghost"
            disabled={isDisabled}
            onClick={onDownload}
          >
            <Download className="size-4" strokeWidth={1.75} />
            저장
          </Button>
          {/* INFO: DESIGN.md § 7.5. A destructive action in a list of choices is the label in `semantic-error`, not a filled red button — the bar is a surface of equals, not a confirmation. */}
          <Button
            className="min-h-11 w-auto flex-1 rounded-full text-semantic-error"
            variant="ghost"
            disabled={isDisabled}
            onClick={onDelete}
          >
            <Trash2 className="size-4" strokeWidth={1.75} />
            삭제
          </Button>
        </div>
      </div>
    </ShellOverlay>
  );
}
