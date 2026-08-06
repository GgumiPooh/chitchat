"use client";

import { MAX_SEARCH_QUERY_LENGTH } from "@/shared/config";
import { cn } from "@/shared/lib";
import { AppHeader, IconButton } from "@/shared/ui";
import { LoaderCircle, Search, X } from "lucide-react";
import { useRef } from "react";

export type MessageSearchBarProps = {
  className?: string;
  fieldClassName?: string;
  query: string;
  /** Whether the field holds anything to ask for — the disc is dead otherwise. */
  canSubmit: boolean;
  isLoading?: boolean;
  onQueryChange: (query: string) => void;
  onSubmit: () => void;
  onClose: () => void;
};

/**
 * The header, while a search is open (REQUIREMENTS.md § 8.6.). It takes the
 * floating strip's place rather than covering it, so the conversation goes on
 * scrolling underneath exactly as it does the rest of the time.
 *
 * WARN: DESIGN.md § 6.8. Built on `AppHeader` itself, never on a copy of its
 * geometry. The two strips swap in place and have to stay pixel-identical, so
 * the sticky root, the safe-area padding, the negative margin and the row height
 * have one definition — written out twice, a later change to the header's inset
 * lands in one of them and the swap starts jumping.
 */
export function MessageSearchBar({
  className,
  fieldClassName,
  query,
  canSubmit,
  isLoading = false,
  onQueryChange,
  onSubmit,
  onClose,
}: MessageSearchBarProps) {
  const fieldRef = useRef<HTMLInputElement | null>(null);

  return <AppHeader className={className} leading={renderField()} trailing={renderCancel()} />;

  /**
   * INFO: DESIGN.md § 6.6. The composer's pill, which is the app's one shape for a
   * field floating over the conversation — the field on the left, the action it
   * feeds as a disc on the right.
   *
   * WARN: A real `<form>`. The implicit submit is what makes iOS draw its search
   * key instead of a return key, and on a phone that key is the whole trigger —
   * REQUIREMENTS.md § 8.6. does not scan while the user types.
   *
   * WARN: A fixed height, unlike the composer's. That one grows because its
   * textarea does; this one holds a single line, and letting it size to its
   * contents means the clear button appearing on the first keystroke changes the
   * pill's height under the finger.
   */
  function renderField() {
    return (
      <form
        className="flex h-11 min-w-0 flex-1 items-center gap-2xs rounded-full border border-hairline glass pr-2xs pl-sm shadow-floating"
        onSubmit={(event) => {
          event.preventDefault();
          onSubmit();
        }}
      >
        <Search className="size-4 shrink-0 text-meta-soft" strokeWidth={1.75} aria-hidden />
        <input
          ref={captureField}
          className={cn(
            // WARN: `min-w-0` is what stops the field pushing the buttons out of the pill — a flex item refuses by default to shrink below its content.
            "min-h-8 min-w-0 flex-1 bg-transparent text-body-md text-ink outline-none selection:bg-primary-tint placeholder:text-meta-soft",
            fieldClassName,
          )}
          maxLength={MAX_SEARCH_QUERY_LENGTH}
          // INFO: What turns the iOS return key into the blue search key, which is the trigger this bar is built around.
          enterKeyHint="search"
          // WARN: Not `type="search"`. WebKit and Chrome draw their own clear glyph inside such a field, which lands beside the one below it — two ✕ in one pill, only one of them styled.
          type="text"
          value={query}
          placeholder="대화 내용 검색"
          aria-label="대화 내용 검색"
          onChange={(event) => onQueryChange(event.target.value)}
        />
        {/* INFO: Clears the query without closing the search — 취소 beside it is the one that leaves. */}
        {/* WARN: `className`, not `buttonClassName` — `IconButton` only diverts the latter onto the button when `haptic` moves `className` to the wrapper. Left on `buttonClassName` the size is silently dropped, and the default 44 circle is what grew the pill. */}
        {query.length > 0 && (
          <IconButton
            className="size-8"
            iconClassName="size-4"
            Icon={X}
            aria-label="검색어 지우기"
            onClick={clear}
          />
        )}
        {/* INFO: DESIGN.md § 6.6. The composer's send disc, in the composer's position. The keyboard's search key does the same thing; this is what a pointer has instead (AGENTS.md § 4.2.). */}
        <button
          className="inline-flex size-9 shrink-0 press-bloom cursor-pointer items-center justify-center rounded-full bg-primary text-on-primary outline-none hover:bg-primary-hover focus-visible:ring-2 focus-visible:ring-primary active:bg-primary-pressed disabled:cursor-not-allowed disabled:bg-primary-disabled"
          disabled={!canSubmit || isLoading}
          type="submit"
          aria-label="검색"
        >
          {isLoading ? (
            <LoaderCircle className="size-4 animate-spin" />
          ) : (
            <Search className="size-4" strokeWidth={2} />
          )}
        </button>
      </form>
    );
  }

  // INFO: A word rather than a back arrow — it dismisses a mode rather than navigating anywhere, and 취소 is what iOS puts beside a search field.
  function renderCancel() {
    return (
      <button
        className="shrink-0 cursor-pointer rounded-md px-2xs py-xs text-body-md text-meta outline-none hover:text-ink focus-visible:ring-2 focus-visible:ring-primary active:text-ink"
        type="button"
        onClick={onClose}
      >
        취소
      </button>
    );
  }

  /**
   * WARN: Focused from the ref callback, which React runs inside the commit — the
   * same task as the tap that opened the bar. A passive effect is flushed in a
   * scheduler task after it, and WebKit raises the keyboard only for a `focus()`
   * still inside the gesture, so the field came up focused with no keyboard and
   * the search key that submits it was a second tap away.
   */
  function captureField(element: HTMLInputElement | null) {
    fieldRef.current = element;
    element?.focus();
  }

  function clear() {
    onQueryChange("");
    fieldRef.current?.focus();
  }
}
