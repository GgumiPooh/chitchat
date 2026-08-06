import { cn } from "@/shared/lib";

export type TypingIndicatorProps = {
  className?: string;
  isVisible: boolean;
};

// INFO: DESIGN.md § 6.7.1. Three dots and no name — this conversation has exactly two people in it (REQUIREMENTS.md § 1.), so naming the one who is not me says nothing the reader does not already know.
const DOT_DELAYS = ["[animation-delay:0ms]", "[animation-delay:150ms]", "[animation-delay:300ms]"];

/**
 * REQUIREMENTS.md § 8.12. 입력 중, above the composer.
 *
 * WARN: An overlay in the composer's absolute wrapper, never a row in the
 * virtualized list. A tail item that appears and disappears every few seconds
 * re-measures the list and drags the scroll position with it (§ 8.3.), which
 * reads as the conversation twitching while the other person types.
 */
export function TypingIndicator({ className, isVisible }: TypingIndicatorProps) {
  return (
    // WARN: DESIGN.md § 6.7.1. The live region is never itself hidden and never itself removed. A region inside an `aria-hidden` subtree is not watched at all, and one that is unmounted takes its own announcement with it.
    <div
      className={cn(
        "pointer-events-none flex transition-all duration-150",
        isVisible ? "translate-y-0 opacity-100" : "translate-y-1 opacity-0",
        className,
      )}
      // INFO: Announced politely rather than assertively — it is ambient status, and it changes often enough that an assertive live region would interrupt a screen reader mid-message.
      aria-live="polite"
    >
      {/* WARN: The sentence is mounted by the transition, not merely revealed by it. A live region announces a *mutation* of its contents, so text that is always present and only styled away is announced exactly never — which is what `aria-hidden` toggling over static text bought. */}
      {isVisible && <span className="sr-only">상대방이 입력 중이에요</span>}
      <span
        className="inline-flex items-center gap-2xs rounded-full border border-hairline glass px-sm py-xs shadow-floating"
        aria-hidden
      >
        {DOT_DELAYS.map((delay) => (
          <span key={delay} className={cn("size-1.5 animate-bounce rounded-full bg-meta", delay)} />
        ))}
      </span>
    </div>
  );
}
