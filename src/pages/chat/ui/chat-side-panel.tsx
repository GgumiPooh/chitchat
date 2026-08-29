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
  const hasSearchResults = search.submitted.trim().length > 0;

  return (
    <div className={cn("flex h-full flex-col gap-xs p-md", className)}>
      {partner && (
        <button
          className="mb-xs flex cursor-pointer items-center gap-xs rounded-md p-xs text-left transition-colors outline-none hover:bg-surface-soft focus-visible:ring-2 focus-visible:ring-primary active:bg-surface-soft"
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

      <section className="flex flex-none flex-col gap-xs">
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
      </section>

      {/* INFO: `flex-grow` interpolates as a number, so the hits and 다가오는 일정 trade height over `--duration-state` instead of jumping when a search lands. */}
      {/* WARN: The hits are a flex item of their own, and the field above is `flex-none` outside it — a section holding both sizes its basis from the list's content, which is then added to whatever share `grow` hands out, so an even split does not land on screen as one. */}
      {/* WARN: Mounted whether or not there are hits, so the field being emptied animates back down rather than snapping. */}
      {/* INFO: The panel's own gap is `xs`, and the `md` every block but the field wants is made up by a margin that travels with the grow — a zero-height item still takes its gap, so a flat `gap-md` left `md` twice over between the field and 다가오는 일정 while no hits were showing. */}
      <div
        className={cn(
          "min-h-0 basis-0 overflow-hidden transition-[flex-grow,margin] duration-(--duration-state) ease-out motion-reduce:transition-none",
          hasSearchResults ? "mb-xs grow" : "grow-0",
        )}
      >
        {hasSearchResults && (
          <MessageSearchResultList
            className="h-full overflow-y-auto"
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
      </div>

      <section className="flex min-h-0 grow basis-0 flex-col gap-xs">
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
