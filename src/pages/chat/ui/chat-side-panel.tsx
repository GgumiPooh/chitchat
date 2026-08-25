"use client";

import type { EventOccurrence } from "@/entities/event";
import type { Participant } from "@/entities/user";
import {
  MessageSearchField,
  MessageSearchResultList,
  type MessageSearch,
} from "@/features/search-messages";
import { useProfileViewer } from "@/features/view-profile";
import { cn, type UserId } from "@/shared/lib";
import { Avatar } from "@/shared/ui";
import { UpcomingEventsList } from "./upcoming-events-list";

export type ChatSidePanelProps = {
  className?: string;
  currentUserId: UserId;
  participants: Participant[];
  typingUserIds: UserId[];
  search: MessageSearch;
  occurrences: EventOccurrence[];
  todayKey: string;
  now: number;
  hasMoreUpcoming: boolean;
  isLoadingMoreUpcoming: boolean;
  onLoadMoreUpcoming: () => void;
  onSelectEvent: (occurrence: EventOccurrence) => void;
};

/**
 * AGENTS.md § 4.1. Chat's `md` panel — 검색, 다가오는 일정 and the other
 * participant, which the mobile header's icons and 뒤로 open one at a time,
 * standing beside the room once there is space for them.
 *
 * INFO: One `useMessageSearch()` instance, owned by `ChatScreen` and shared with
 * the room's own jump target — a hit here calls `search.select`, the same as a
 * mobile result row, and never opens `MessageSearchResults`.
 */
export function ChatSidePanel({
  className,
  currentUserId,
  participants,
  typingUserIds,
  search,
  occurrences,
  todayKey,
  now,
  hasMoreUpcoming,
  isLoadingMoreUpcoming,
  onLoadMoreUpcoming,
  onSelectEvent,
}: ChatSidePanelProps) {
  const { openProfile } = useProfileViewer();
  const partner = participants.find((participant) => participant.id !== currentUserId);

  return (
    <div className={cn("flex h-full flex-col gap-md p-md", className)}>
      {partner && (
        <button
          className="flex cursor-pointer items-center gap-xs rounded-md p-xs text-left transition-colors outline-none hover:bg-surface-soft focus-visible:ring-2 focus-visible:ring-primary active:bg-surface-soft"
          type="button"
          onClick={() => openProfile(partner.id)}
        >
          <Avatar name={partner.name} mediaId={partner.avatarMediaId} />
          <span className="min-w-0 flex-1">
            <span className="block truncate text-title-sm text-ink">{partner.name}</span>
            {typingUserIds.includes(partner.id) && (
              <span className="block text-caption text-meta">입력 중</span>
            )}
          </span>
        </button>
      )}

      <section className="flex min-h-0 grow basis-0 flex-col gap-xs">
        <h2 className="px-xs text-title-sm text-meta">검색</h2>
        <MessageSearchField
          className="flex-none"
          variant="flat"
          autoFocus={false}
          query={search.query}
          canSubmit={search.canSubmit}
          isLoading={search.isLoading}
          onQueryChange={search.setQuery}
          onSubmit={search.submit}
        />
        {search.submitted.trim().length > 0 && (
          <MessageSearchResultList
            className="min-h-0 flex-1 overflow-y-auto"
            query={search.submitted}
            results={search.results}
            participants={participants}
            activeIndex={search.activeIndex}
            isLoading={search.isLoading}
            isLoadingMore={search.isLoadingMore}
            hasMore={search.hasMore}
            onLoadMore={search.loadMore}
            onSelect={search.select}
          />
        )}
      </section>

      <section className="flex min-h-0 grow-2 basis-0 flex-col gap-xs">
        <h2 className="px-xs text-title-sm text-meta">다가오는 일정</h2>
        <UpcomingEventsList
          className="min-h-0 flex-1 overflow-y-auto"
          pinsHeight={false}
          loadsOnScroll
          occurrences={occurrences}
          todayKey={todayKey}
          now={now}
          hasMore={hasMoreUpcoming}
          isLoadingMore={isLoadingMoreUpcoming}
          onLoadMore={onLoadMoreUpcoming}
          onSelect={onSelectEvent}
        />
      </section>
    </div>
  );
}
