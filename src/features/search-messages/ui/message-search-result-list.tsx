"use client";

import type { MessageSearchResult } from "@/entities/message";
import type { Participant } from "@/entities/user";
import { cn, formatDate, useIsOffline, type Nullable } from "@/shared/lib";
import { EmptyState, HapticTarget, Skeleton } from "@/shared/ui";
import { CloudOff, LoaderCircle, Search, SearchX } from "lucide-react";
import { useEffect, useRef } from "react";
import { SearchHighlight } from "./search-highlight";

export type MessageSearchResultListProps = {
  className?: string;
  query: string;
  results: MessageSearchResult[];
  participants: Participant[];
  activeIndex: Nullable<number>;
  isLoading: boolean;
  isLoadingMore: boolean;
  hasMore: boolean;
  onLoadMore: () => void;
  onSelect: (index: number) => void;
};

// INFO: How many rows of skeleton stand in for the first page — a screenful, so the list does not visibly grow into the space it was always going to take.
const SKELETON_ROW_COUNT = 6;

/**
 * DESIGN.md § 6.8.'s result rows, shared by the mobile overlay
 * (`MessageSearchResults`) and the desktop side panel.
 */
export function MessageSearchResultList({
  className,
  query,
  results,
  participants,
  activeIndex,
  isLoading,
  isLoadingMore,
  hasMore,
  onLoadMore,
  onSelect,
}: MessageSearchResultListProps) {
  const sentinelRef = useRef<HTMLDivElement>(null);
  const isOffline = useIsOffline();
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

  return <div className={cn("flex flex-col gap-2xs", className)}>{renderBody()}</div>;

  function renderBody() {
    if (query.trim().length === 0) {
      return (
        <EmptyState className="mt-2xl" Icon={Search} description="대화 내용을 검색해 보세요" />
      );
    }

    // WARN: Before the skeleton and scoped to an empty list, and both halves are load-bearing. Before, because § 8.6. searches the server and offline the request never lands. Scoped, because DESIGN.md § 7.19. forbids the offline signal withdrawing what the reader already has.
    if (isOffline && results.length === 0) {
      return (
        <EmptyState
          className="mt-2xl"
          Icon={CloudOff}
          description="인터넷에 연결되어 있지 않아 검색하지 못했어요"
        />
      );
    }

    if (isLoading) {
      return Array.from({ length: SKELETON_ROW_COUNT }, (_, index) => (
        <Skeleton key={index} className="h-[4.5rem] rounded-md" />
      ));
    }

    if (results.length === 0) {
      return <EmptyState className="mt-2xl" Icon={SearchX} description="검색 결과가 없어요" />;
    }

    return (
      <>
        {results.map((result, index) => (
          // WARN: `keepsScroll`, because the rows tile the scroller — without it the switch keeps the drag a finger began on a row and ends it as a tap (DESIGN.md § 7.15.1.).
          <HapticTarget key={result.id} className="flex" overlayClassName="touch-pan-y" keepsScroll>
            <button
              className={cn(
                "flex w-full cursor-pointer flex-col gap-2xs rounded-md border border-hairline-soft bg-canvas p-sm text-left outline-none group-active:bg-surface-strong hover:bg-surface-soft focus-visible:ring-2 focus-visible:ring-primary active:bg-surface-strong",
                index === activeIndex && "border-primary",
              )}
              type="button"
              onClick={() => onSelect(index)}
            >
              <div className="flex items-baseline gap-xs">
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
          </HapticTarget>
        ))}
        {/* INFO: DESIGN.md § 7.8. A spinner here rather than more skeletons — the wait is unbounded and there is already a list of the real shape above it. */}
        <div ref={sentinelRef} className="flex h-10 items-center justify-center">
          {isLoadingMore && <LoaderCircle className="size-4 animate-spin text-meta-soft" />}
        </div>
      </>
    );
  }
}
