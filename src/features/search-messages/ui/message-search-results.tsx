"use client";

import type { MessageSearchResult } from "@/entities/message";
import type { Participant } from "@/entities/user";
import { cn, formatDate, type Nullable } from "@/shared/lib";
import { EmptyState, ShellOverlay, Skeleton } from "@/shared/ui";
import { LoaderCircle, Search, SearchX } from "lucide-react";
import { useEffect, useRef } from "react";
import { SearchHighlight } from "./search-highlight";

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

// INFO: How many rows of skeleton stand in for the first page — a screenful, so the list does not visibly grow into the space it was always going to take.
const SKELETON_ROW_COUNT = 6;

/**
 * The result list of DESIGN.md § 6.8. Portalled into the shell so it covers the
 * tab bar and the composer's stack, which are siblings of the screen's scroller
 * rather than children of it (AGENTS.md § 4.4.).
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
  const sentinelRef = useRef<HTMLDivElement>(null);
  const nameById = new Map(participants.map((participant) => [participant.id, participant.name]));

  // INFO: REQUIREMENTS.md § 8.6. Cursor paging, driven off the end of the list coming into view rather than off a scroll handler measuring distances.
  useEffect(() => {
    const sentinel = sentinelRef.current;

    if (!sentinel || !hasMore) {
      return;
    }

    const observer = new IntersectionObserver((entries) => {
      if (entries.some((entry) => entry.isIntersecting)) {
        onLoadMore();
      }
    });

    observer.observe(sentinel);

    return () => observer.disconnect();
  }, [hasMore, onLoadMore, results.length]);

  return (
    <ShellOverlay>
      {/* WARN: DESIGN.md § 7.12. Padded below the header rather than under it — this is the one surface the floating strip must not be transparent over. A row sliding beneath the search field would put message text behind 취소, and unlike the conversation there is no fade mask to dissolve it. */}
      <div
        className={cn(
          "absolute inset-0 z-20 flex flex-col bg-surface-soft pt-(--app-header-inset)",
          className,
        )}
      >
        {/* WARN: REQUIREMENTS.md § 8.6.1. The list has to hand the reader back to the arrows. It covers the navigation bar completely, so without a way out of it the only exits are picking a result or 취소 — and 취소 tears down the query and the parked position with it. */}
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
        {/* WARN: § 3.5. The tab bar floats over the bottom, so the list clears it itself — without the inset the last result is unreachable behind the bar. */}
        <div className={cn("min-h-0 flex-1 overflow-y-auto overscroll-contain", listClassName)}>
          <div className="flex flex-col gap-2xs px-md pb-[calc(var(--bottom-inset,0px)_+_var(--spacing-md))]">
            {renderBody()}
          </div>
        </div>
      </div>
    </ShellOverlay>
  );

  function renderBody() {
    if (query.trim().length === 0) {
      return (
        <EmptyState className="mt-2xl" Icon={Search} description="대화 내용을 검색해 보세요" />
      );
    }

    if (isLoading) {
      return Array.from({ length: SKELETON_ROW_COUNT }, (_, index) => (
        // INFO: DESIGN.md § 7.8. A skeleton rather than a spinner — the row's geometry is known before the page lands, so the placeholder can take its shape.
        <Skeleton key={index} className="h-[4.5rem] rounded-md" />
      ));
    }

    if (results.length === 0) {
      return <EmptyState className="mt-2xl" Icon={SearchX} description="검색 결과가 없어요" />;
    }

    return (
      <>
        {results.map((result, index) => (
          <button
            key={result.id}
            // INFO: DESIGN.md § 6.8. `canvas` rows on the `surface-soft` list, so a row reads as a card rather than as a band of the background.
            className={cn(
              "flex cursor-pointer flex-col gap-2xs rounded-md border border-hairline-soft bg-canvas p-sm text-left outline-none hover:bg-surface-soft focus-visible:ring-2 focus-visible:ring-primary active:bg-surface-strong",
              index === activeIndex && "border-primary",
            )}
            type="button"
            onClick={() => onSelect(index)}
          >
            <div className="flex items-baseline gap-xs">
              {/* INFO: REQUIREMENTS.md § 8.7. Resolved against the participant set at render time, exactly as the bubble's own name is — never carried on the result. */}
              <span className="min-w-0 flex-1 truncate text-title-sm text-ink">
                {nameById.get(result.senderId) ?? ""}
              </span>
              <span className="shrink-0 text-caption text-meta">
                {formatDate(result.createdAt)}
              </span>
            </div>
            <SearchHighlight
              className="line-clamp-2 text-body-sm text-body"
              text={result.excerpt}
              query={query}
            />
          </button>
        ))}
        {/* INFO: DESIGN.md § 7.8. A spinner here rather than more skeletons — the wait is unbounded and there is already a list of the real shape above it. */}
        <div ref={sentinelRef} className="flex h-10 items-center justify-center">
          {isLoadingMore && <LoaderCircle className="size-4 animate-spin text-meta-soft" />}
        </div>
      </>
    );
  }
}
