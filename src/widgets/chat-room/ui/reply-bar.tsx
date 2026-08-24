"use client";

import type { ReplyPreview } from "@/entities/message";
import { cn } from "@/shared/lib";
import { X } from "lucide-react";
import { ReplyQuote } from "./reply-quote";

export type ReplyBarProps = {
  className?: string;
  replyTo: ReplyPreview;
  /** `toQuoteHeading`'s sentence, composed by the caller (REQUIREMENTS.md § 8.7.). */
  heading: string;
  onCancel: () => void;
};

/**
 * DESIGN.md § 6.10. The staged quote, the composer pill's own first row.
 *
 * WARN: In the composer's flow, unlike the staged emoticon of § 13.6. That one is a
 * single object standing where its own bubble will land and floats over the history;
 * this is a bar, and `useComposerClearance` measures the stack it sits in, so the
 * messages ride up by exactly its height instead of hiding behind it.
 */
export function ReplyBar({ className, replyTo, heading, onCancel }: ReplyBarProps) {
  return (
    // INFO: DESIGN.md § 6.10. No surface of its own — the pill around it is already one, and a filled card nested in it would be the box-in-a-box § 6.6. refuses for the field.
    // INFO: DESIGN.md § 6.6. Over the pill's own `2xs`: `sm` at the left puts the text on the `+` glyph's edge, and `xs` at the top, which is shorter on purpose — the row under it is spaced by the padding inside its 44px controls, and matching that number here reads taller than it is against text with almost no leading.
    <div className={cn("flex items-center gap-2xs pt-xs pl-sm", className)}>
      <ReplyQuote replyTo={replyTo} heading={heading} />
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
