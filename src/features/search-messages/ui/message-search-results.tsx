"use client";

import type { MessageSearchResult } from "@/entities/message";
import type { Participant } from "@/entities/user";
import { cn, type Nullable } from "@/shared/lib";
import { ShellOverlay } from "@/shared/ui";
import { MessageSearchResultList } from "./message-search-result-list";

export type MessageSearchResultsProps = {
  className?: string;
  listClassName?: string;
  query: string;
  results: MessageSearchResult[];
  participants: Participant[];
  activeIndex: Nullable<number>;
  isLoading: boolean;
  isLoadingMore: boolean;
  hasMore: boolean;
  total: number;
  onLoadMore: () => void;
  onClose: () => void;
  onSelect: (index: number) => void;
};

/**
 * The result list of DESIGN.md § 6.8. Portalled into the shell so it covers the
 * tab bar and the composer's stack, which are siblings of this screen rather than
 * children of it (§ 3.5.).
 */
export function MessageSearchResults({
  className,
  listClassName,
  query,
  results,
  participants,
  activeIndex,
  isLoading,
  isLoadingMore,
  hasMore,
  total,
  onLoadMore,
  onClose,
  onSelect,
}: MessageSearchResultsProps) {
  return (
    <ShellOverlay>
      {/* WARN: DESIGN.md § 7.12. Padded below the header rather than under it — this is the one surface the floating strip must not be transparent over. */}
      <div
        className={cn(
          "pointer-events-auto absolute inset-0 z-20 flex flex-col bg-surface-soft pt-(--app-header-inset)",
          className,
        )}
      >
        {/* WARN: REQUIREMENTS.md § 8.6.1. The list has to hand the reader back to the arrows — 취소 tears down the query and the parked position with it, so this is the only other way out. */}
        <div className="flex shrink-0 items-center justify-between gap-2xs px-md py-2xs">
          <p className="truncate text-caption text-meta">
            {total > 0 ? `검색 결과 ${total}건` : ""}
          </p>
          <button
            className="shrink-0 cursor-pointer rounded-md px-2xs py-2xs text-caption text-meta outline-none hover:text-ink focus-visible:ring-2 focus-visible:ring-primary active:text-ink"
            type="button"
            onClick={onClose}
          >
            목록 닫기
          </button>
        </div>
        {/* WARN: § 3.5. The tab bar floats over the bottom, so the list clears it itself. */}
        <div className={cn("min-h-0 flex-1 overflow-y-auto overscroll-contain", listClassName)}>
          <MessageSearchResultList
            className="px-md pb-[calc(var(--bottom-inset,0px)_+_var(--spacing-md))]"
            query={query}
            results={results}
            participants={participants}
            activeIndex={activeIndex}
            isLoading={isLoading}
            isLoadingMore={isLoadingMore}
            hasMore={hasMore}
            onLoadMore={onLoadMore}
            onSelect={onSelect}
          />
        </div>
      </div>
    </ShellOverlay>
  );
}
