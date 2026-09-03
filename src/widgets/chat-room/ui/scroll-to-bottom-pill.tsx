import { cn } from "@/shared/lib";
import { HapticTarget } from "@/shared/ui";
import { ChevronDown } from "lucide-react";

export type ScrollToBottomPillProps = {
  className?: string;
  isVisible: boolean;
  newMessageCount: number;
  onClick: () => void;
};

/**
 * DESIGN.md § 6.7. One component for both jobs — returning from history and
 * returning from a search jump (REQUIREMENTS.md § 8.6.1.). Round, at the
 * `BookmarkCornerButton`'s own geometry — the caller stacks the two.
 */
export function ScrollToBottomPill({
  className,
  isVisible,
  newMessageCount,
  onClick,
}: ScrollToBottomPillProps) {
  const hasNewMessages = newMessageCount > 0;

  return (
    // WARN: The fade lives on the wrapper, not the button — the haptic overlay covers the button, so a hidden button under a live overlay would still take the tap.
    <HapticTarget
      className={cn(
        "inline-flex shrink-0 transition-all duration-150",
        isVisible ? "translate-y-0 opacity-100" : "pointer-events-none translate-y-1 opacity-0",
        className,
      )}
      isTicking={isVisible}
    >
      <button
        className={cn(
          "inline-flex min-h-10 min-w-10 press-bloom cursor-pointer items-center justify-center rounded-full p-2 shadow-raised transition-colors outline-none focus-visible:ring-2 focus-visible:ring-primary",
          hasNewMessages
            ? "bg-primary text-on-primary hover:bg-primary-hover"
            : "border border-hairline bg-canvas text-meta hover:bg-surface-soft",
        )}
        type="button"
        tabIndex={isVisible ? undefined : -1}
        aria-hidden={!isVisible}
        aria-label={hasNewMessages ? `새 메시지 ${newMessageCount}` : "맨 아래로"}
        onClick={onClick}
      >
        {hasNewMessages ? (
          <span className="text-button-sm tabular-nums">{newMessageCount}</span>
        ) : (
          <ChevronDown className="size-4" strokeWidth={1.75} />
        )}
      </button>
    </HapticTarget>
  );
}
