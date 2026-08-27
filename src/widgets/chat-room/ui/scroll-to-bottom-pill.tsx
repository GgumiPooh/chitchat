import { cn } from "@/shared/lib";
import { ChevronDown } from "lucide-react";
import type { CSSProperties } from "react";

export type ScrollToBottomPillProps = {
  className?: string;
  isVisible: boolean;
  newMessageCount: number;
  style?: CSSProperties;
  onClick: () => void;
};

/**
 * DESIGN.md § 6.7. One component for both jobs — returning from history and
 * returning from a search jump (REQUIREMENTS.md § 8.6.1.).
 */
export function ScrollToBottomPill({
  className,
  isVisible,
  newMessageCount,
  style,
  onClick,
}: ScrollToBottomPillProps) {
  const hasNewMessages = newMessageCount > 0;

  return (
    <button
      className={cn(
        // WARN: `w-fit` is load-bearing. The caller centers this with `inset-x-0 mx-auto`, and an absolutely positioned box with both offsets set stretches to the full width, so the hit area would swallow taps and scrolls meant for the bubbles behind it.
        "group inline-flex min-h-11 w-fit cursor-pointer items-center justify-center py-0.5 transition-all duration-150 outline-none",
        isVisible ? "translate-y-0 opacity-100" : "pointer-events-none translate-y-1 opacity-0",
        className,
      )}
      style={style}
      type="button"
      tabIndex={isVisible ? undefined : -1}
      aria-hidden={!isVisible}
      aria-label="맨 아래로"
      onClick={onClick}
    >
      {/* INFO: DESIGN.md § 6.7. The count variant recolours the pill instead of stacking a badge on top of it. */}
      <span
        className={cn(
          "inline-flex min-h-10 press-bloom items-center gap-2xs rounded-full px-3.5 py-xs shadow-raised",
          hasNewMessages
            ? "bg-primary text-on-primary group-hover:bg-primary-hover"
            : "border border-hairline bg-canvas text-meta group-hover:bg-surface-soft",
        )}
      >
        <ChevronDown className="size-4" strokeWidth={1.75} />
        {hasNewMessages && <span className="text-button-sm">새 메시지 {newMessageCount}</span>}
      </span>
    </button>
  );
}
