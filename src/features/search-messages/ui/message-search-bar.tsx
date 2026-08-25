"use client";

import { AppHeader, HeaderTextButton } from "@/shared/ui";
import { MessageSearchField } from "./message-search-field";

export type MessageSearchBarProps = {
  className?: string;
  fieldClassName?: string;
  query: string;
  canSubmit: boolean;
  isLoading?: boolean;
  /** AGENTS.md § 4.1. Forwarded to `AppHeader` — 채팅's own panel toggle stays reachable while a search is open. */
  hasSidePanel?: boolean;
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
  hasSidePanel = false,
  onQueryChange,
  onSubmit,
  onClose,
}: MessageSearchBarProps) {
  return (
    <AppHeader
      className={className}
      hasSidePanel={hasSidePanel}
      leadingFills
      trailing={renderCancel()}
      leading={
        <MessageSearchField
          fieldClassName={fieldClassName}
          query={query}
          canSubmit={canSubmit}
          isLoading={isLoading}
          onQueryChange={onQueryChange}
          onSubmit={onSubmit}
          onEscape={onClose}
        />
      }
    />
  );

  // INFO: A word rather than a back arrow — it dismisses a mode rather than navigating anywhere, and 취소 is what iOS puts beside a search field.
  function renderCancel() {
    return (
      <HeaderTextButton haptic onClick={onClose}>
        취소
      </HeaderTextButton>
    );
  }
}
