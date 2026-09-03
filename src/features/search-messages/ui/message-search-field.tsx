"use client";

import { MAX_SEARCH_QUERY_LENGTH } from "@/shared/config";
import { cn } from "@/shared/lib";
import { IconButton } from "@/shared/ui";
import { LoaderCircle, Search, X } from "lucide-react";
import { useRef, type KeyboardEvent } from "react";

export type MessageSearchFieldProps = {
  className?: string;
  fieldClassName?: string;
  query: string;
  isLoading?: boolean;
  /** Off for the desktop side panel — it stands on screen at all times and must not steal focus on mount. */
  autoFocus?: boolean;
  /** `floating` is the header bar's glass pill; `flat` sits on a panel that already has a surface. */
  variant?: "floating" | "flat";
  onQueryChange: (query: string) => void;
  onSubmit: () => void;
  /** `Escape`'s handler. Left unset, the field just blurs — the mobile bar passes its own `onClose` instead. */
  onEscape?: () => void;
};

/**
 * DESIGN.md § 6.6. The composer's pill, reused as the field the mobile search
 * bar (`MessageSearchBar`) and the desktop side panel both drive.
 *
 * WARN: A real `<form>`. The implicit submit is what makes iOS draw its search
 * key instead of a return key — REQUIREMENTS.md § 8.6. steps to the next hit
 * on that key, since the scan itself already runs debounced as the user types.
 */
export function MessageSearchField({
  className,
  fieldClassName,
  query,
  isLoading = false,
  autoFocus = true,
  variant = "floating",
  onQueryChange,
  onSubmit,
  onEscape,
}: MessageSearchFieldProps) {
  const fieldRef = useRef<HTMLInputElement | null>(null);
  const hasFocusedRef = useRef(false);

  return (
    <form
      className={cn(
        "flex h-11 min-w-0 flex-1 items-center gap-2xs border border-hairline pr-2xs pl-sm",
        variant === "floating"
          ? "rounded-full glass shadow-floating"
          : "rounded-md bg-surface-soft",
        className,
      )}
      onSubmit={(event) => {
        event.preventDefault();
        onSubmit();
      }}
    >
      {isLoading && variant === "flat" ? (
        <LoaderCircle className="size-4 shrink-0 animate-spin text-meta-soft" aria-hidden />
      ) : (
        <Search className="size-4 shrink-0 text-meta-soft" strokeWidth={1.75} aria-hidden />
      )}
      <input
        ref={captureField}
        className={cn(
          // WARN: `min-w-0` is what stops the field pushing the buttons out of the pill — a flex item refuses by default to shrink below its content.
          "min-h-8 min-w-0 flex-1 bg-transparent text-body-md text-ink outline-none selection:bg-primary-tint placeholder:text-meta-soft",
          fieldClassName,
        )}
        maxLength={MAX_SEARCH_QUERY_LENGTH}
        enterKeyHint="search"
        // WARN: Not `type="search"`. WebKit and Chrome draw their own clear glyph inside such a field, which lands beside the one below it — two ✕ in one pill, only one of them styled.
        type="text"
        value={query}
        placeholder="대화 내용 검색"
        aria-label="대화 내용 검색"
        onChange={(event) => onQueryChange(event.target.value)}
        onKeyDown={handleFieldKeyDown}
      />
      {query.length > 0 && (
        <IconButton
          buttonClassName="size-8"
          iconClassName="size-4"
          Icon={X}
          haptic
          keepsFocus
          aria-label="검색어 지우기"
          onClick={clear}
        />
      )}
    </form>
  );

  // WARN: `isComposing` first — `Escape` is how a Hangul IME abandons the syllable being assembled, so unguarded the first correction a typist makes fires this instead.
  function handleFieldKeyDown(event: KeyboardEvent<HTMLInputElement>) {
    if (event.key !== "Escape" || event.nativeEvent.isComposing) {
      return;
    }

    event.preventDefault();
    event.stopPropagation();

    if (onEscape) {
      onEscape();
    } else {
      fieldRef.current?.blur();
    }
  }

  // WARN: A ref callback, not an effect — WebKit only raises the keyboard for a `focus()` still inside the gesture that opened the bar, and an effect fires a task too late.
  function captureField(element: HTMLInputElement | null) {
    fieldRef.current = element;

    if (!autoFocus || element === null || hasFocusedRef.current) {
      return;
    }

    hasFocusedRef.current = true;
    element.focus();
  }

  function clear() {
    onQueryChange("");
    fieldRef.current?.focus();
  }
}
