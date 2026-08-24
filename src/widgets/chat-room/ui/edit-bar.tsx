"use client";

import { cn } from "@/shared/lib";
import { Pencil, X } from "lucide-react";

export type EditBarProps = {
  className?: string;
  onCancel: () => void;
};

/**
 * DESIGN.md § 6.10.1. The correction in progress, in the composer pill's header row.
 *
 * WARN: In the composer's flow, exactly as `ReplyBar` is. `useComposerClearance`
 * measures the stack this sits in, so the history rides up by the bar's height
 * instead of scrolling behind it.
 *
 * INFO: It names the mode and nothing else — the message being corrected is in the
 * field below, so echoing it here would print the same sentence twice.
 */
export function EditBar({ className, onCancel }: EditBarProps) {
  return (
    // INFO: DESIGN.md § 6.10.1. Flat inside the pill and inset like it, exactly as the staged quote it stands in place of.
    <div className={cn("flex items-center gap-2xs pt-xs pl-sm", className)}>
      <Pencil className="size-4 shrink-0 text-meta-soft" strokeWidth={1.75} />
      <span className="min-w-0 flex-1 truncate text-chat-name text-meta">메시지 수정</span>
      {/* INFO: DESIGN.md § 3.2. The glyph stays small while the button keeps a finger-sized hit area. */}
      <button
        className="inline-flex size-8 shrink-0 cursor-pointer items-center justify-center rounded-full text-meta-soft transition-colors outline-none hover:bg-surface-strong hover:text-ink focus-visible:ring-2 focus-visible:ring-primary active:bg-surface-pressed"
        type="button"
        aria-label="수정 취소"
        onClick={onCancel}
      >
        <X className="size-4" strokeWidth={1.75} />
      </button>
    </div>
  );
}
