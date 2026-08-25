"use client";

import { A_SECOND, cn } from "@/shared/lib";
import { Check } from "lucide-react";
import { useEffect, useRef, useState, type PropsWithChildren } from "react";

export type SelectableRowProps = PropsWithChildren<{
  className?: string;
  /** Whether AI 질문 모드's selection sweep is on at all. */
  isSelecting: boolean;
  /**
   * REQUIREMENTS.md § 8.5. Whether this row's own content should translate for
   * the gutter — `false` for a `mine` row, whose content is right-aligned and
   * would overflow the row's right edge under the same translate that opens
   * room on the left for every other row. Defaults `true`.
   */
  isTranslated?: boolean;
  /** Absent for a row nothing can select — a date divider, a still-sending bubble. */
  isSelectable?: boolean;
  isSelected?: boolean;
  onToggle?: () => void;
}>;

// INFO: DESIGN.md § 4.7. `--duration-state`'s 200ms plus a settle margin — `ChatRoom`'s own suppression window imports this so the virtualizer stops ignoring re-measure compensation on the same beat this fades out.
export const SELECTION_TRANSITION_SETTLE = A_SECOND / 4;

/**
 * REQUIREMENTS.md § 8.5. The KakaoTalk-style forward-select gutter: a leading
 * 40px column carrying a 24px check circle, every selectable row's own gesture
 * suppressed by an overlay that answers a tap with a toggle instead.
 *
 * WARN: `pointer-events-none` on the row's own content and a same-sized overlay
 * above it, rather than threading a `disabled` flag through `MessageRow`,
 * `SystemNotice` and `AssistantMessageRow` — the reply swipe, the long-press sheet
 * and the media viewer all reach the DOM directly, and this is the one place that
 * suppresses every one of them without a prop apiece.
 *
 * WARN: DESIGN.md § 4.7. The gutter is a `translate-x-10` on the row's own content,
 * never a flex sibling that reflows it — REQUIREMENTS.md § 8.3.'s virtualizer
 * measures every mounted row on each frame of a height change, and a layout-shifting
 * gutter would feed it a cascade of real resizes rather than one settled change. The
 * check column sits `absolute` in the space the translate opens up on the left, so
 * the row is always mounted (never bypassed by an early return) — the transition has
 * to play on the way in and out, not snap.
 *
 * WARN: `isTranslated` is what keeps a `mine` row inside the column. Its content is
 * right-aligned, so the same translate that opens the check column's room on the
 * left for a `theirs`/assistant/system row would instead push a `mine` one that
 * far past the row's *right* edge — `MessageRow`'s own cap reduction already frees
 * the left-side room a `mine` row needs, with nothing to translate.
 */
export function SelectableRow({
  className,
  isSelecting,
  isTranslated = true,
  isSelectable = false,
  isSelected = false,
  children,
  onToggle,
}: SelectableRowProps) {
  const wasSelectingRef = useRef(isSelecting);
  // WARN: `will-change-transform` only while a transition is actually running — left on for the whole time AI 질문 모드 is up, it would pin every mounted row to its own compositing layer for no reason once the gutter has settled.
  const [isAnimating, setIsAnimating] = useState(false);

  useEffect(() => {
    if (wasSelectingRef.current === isSelecting) {
      return;
    }

    wasSelectingRef.current = isSelecting;
    setIsAnimating(true);

    // WARN: A timer and not just `onTransitionEnd` — `prefers-reduced-motion` drops the transition to `0s`, which fires no `transitionend` at all, and this is what still clears the hint.
    const timeout = setTimeout(() => setIsAnimating(false), SELECTION_TRANSITION_SETTLE);

    return () => clearTimeout(timeout);
  }, [isSelecting]);

  return (
    <div className={cn("relative flex items-start", className)}>
      {/* INFO: `pt-sm` matches the row's own top padding on the common `isFirstOfGroup` case (`MessageRow`, `AssistantMessageRow`), which is close enough to line the circle up with the avatar/name line or, for a `mine` row, the bubble's own first line. */}
      <span
        className={cn(
          "pointer-events-none absolute inset-y-0 left-0 flex w-10 shrink-0 items-start justify-center self-stretch pt-sm opacity-0 transition-opacity duration-(--duration-state) ease-out motion-reduce:transition-none",
          isSelecting && "opacity-100",
        )}
      >
        {isSelecting && isSelectable && (
          <button
            className={cn(
              "pointer-events-auto flex size-6 shrink-0 cursor-pointer items-center justify-center rounded-full transition-colors outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 focus-visible:ring-offset-canvas",
              isSelected
                ? "bg-primary text-on-primary hover:bg-primary-hover active:bg-primary-pressed"
                : "bg-canvas text-transparent ring-1 ring-hairline hover:ring-hairline-strong active:bg-surface-soft",
            )}
            type="button"
            aria-pressed={isSelected}
            aria-label={isSelected ? "선택 해제" : "선택"}
            onClick={onToggle}
          >
            <Check className="size-3.5" strokeWidth={2.5} />
          </button>
        )}
      </span>
      <div
        className={cn(
          "relative min-w-0 flex-1 transition-transform duration-(--duration-state) ease-out motion-reduce:transition-none",
          isSelecting && isTranslated && "translate-x-10",
          isAnimating && isTranslated && "will-change-transform",
        )}
      >
        <div className={cn(isSelecting && "pointer-events-none")}>{children}</div>
        {isSelecting && isSelectable && (
          <button
            className="absolute inset-0 cursor-pointer"
            type="button"
            aria-pressed={isSelected}
            aria-label={isSelected ? "선택 해제" : "선택"}
            onClick={onToggle}
          />
        )}
      </div>
    </div>
  );
}
