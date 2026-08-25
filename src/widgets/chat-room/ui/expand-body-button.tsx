"use client";

import { cn } from "@/shared/lib";
import { ChevronRight } from "lucide-react";

export type ExpandBodyButtonProps = {
  className?: string;
  iconClassName?: string;
  onClick?: () => void;
};

/**
 * DESIGN.md § 6.2.2. The row under a cut bubble (`REQUIREMENTS.md § 8.16.`).
 *
 * WARN: § 8.3. Its box is priced by `toExpandRowHeight` — `mt-2xs`, the hairline, `pt-2xs`
 * and one `chat-body` line, the `size-4` chevron staying under that line either engine
 * lays it out at. Nothing here may grow past it.
 *
 * INFO: AGENTS.md § 4.2. A real button because the whole bubble's tap is a `div`'s and
 * reaches no keyboard — the same action, offered where a keyboard can take it.
 */
export function ExpandBodyButton({ className, iconClassName, onClick }: ExpandBodyButtonProps) {
  return (
    <button
      className={cn(
        "mt-2xs flex w-full cursor-pointer items-center justify-between gap-xs border-t border-quote-divider pt-2xs text-chat-body transition-colors outline-none hover:text-bubble-ink/70 focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-inset active:text-bubble-ink/55",
        className,
      )}
      type="button"
      onClick={onClick}
    >
      전체보기
      <ChevronRight className={cn("size-4 shrink-0", iconClassName)} strokeWidth={1.75} />
    </button>
  );
}
