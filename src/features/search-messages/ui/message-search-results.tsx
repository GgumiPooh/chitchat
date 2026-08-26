"use client";

import type { MessageSearchResult } from "@/entities/message";
import type { Participant } from "@/entities/user";
import { cn, type Nullable } from "@/shared/lib";
import { IconButton, SideDrawer } from "@/shared/ui";
import { X } from "lucide-react";
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
    <SideDrawer
      className={cn("pt-(--app-header-inset)", className)}
      isOpen={true}
      onClose={onClose}
    >
      <div className="flex shrink-0 items-center justify-between gap-2xs border-b border-hairline/30 px-md py-xs">
        <p className="truncate text-title-md text-ink">
          {total > 0 ? `검색 결과 ${total}건` : "검색 결과"}
        </p>
        <IconButton Icon={X} haptic aria-label="목록 닫기" onClick={onClose} />
      </div>
      <div className={cn("min-h-0 flex-1 overflow-y-auto overscroll-contain", listClassName)}>
        <MessageSearchResultList
          className="px-md pt-sm pb-[calc(var(--bottom-inset,0px)_+_var(--spacing-md))]"
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
    </SideDrawer>
  );
}
