"use client";

import type { ReplyPreview } from "@/entities/message";
import { cn, type Optional } from "@/shared/lib";
import { X } from "lucide-react";
import { ReplyQuote } from "./reply-quote";

export type ReplyBarProps = {
  className?: string;
  replyTo: ReplyPreview;
  /** Resolved from the participant set by the caller (REQUIREMENTS.md § 8.7.). */
  name: Optional<string>;
  onCancel: () => void;
};

/**
 * DESIGN.md § 6.9. The staged quote, above the composer.
 *
 * WARN: In the composer's flow, unlike the staged emoticon of § 13.6. That one is a
 * single object standing where its own bubble will land and floats over the history;
 * this is a bar, and `useComposerClearance` measures the stack it sits in, so the
 * messages ride up by exactly its height instead of hiding behind it.
 */
export function ReplyBar({ className, replyTo, name, onCancel }: ReplyBarProps) {
  return (
    // INFO: DESIGN.md § 6.9. The composer pill's own surface at a calmer radius — the quote is a header for the bar below it, not a second floating card stacked on one.
    <div
      className={cn(
        "pointer-events-auto flex items-center gap-2xs rounded-lg border border-hairline glass py-2xs pr-2xs pl-sm shadow-raised",
        className,
      )}
    >
      <ReplyQuote replyTo={replyTo} name={name} />
      {/* INFO: DESIGN.md § 3.2. The glyph stays small while the button keeps a finger-sized hit area. */}
      <button
        className="inline-flex size-8 shrink-0 cursor-pointer items-center justify-center rounded-full text-meta-soft transition-colors outline-none hover:bg-surface-strong hover:text-ink focus-visible:ring-2 focus-visible:ring-primary active:bg-surface-pressed"
        type="button"
        aria-label="답장 취소"
        onClick={onCancel}
      >
        <X className="size-4" strokeWidth={1.75} />
      </button>
    </div>
  );
}
