"use client";

import type { EventOccurrence } from "@/entities/event";
import type { Participant } from "@/entities/user";
import { MessageSearchField, MessageSearchResultList } from "@/features/search-messages";
import { cn, type UserId } from "@/shared/lib";
import { OFFLINE_MESSAGES, OFFLINE_NOTICE_ID } from "@/shared/offline-ux";
import { Avatar, toast } from "@/shared/ui";
import { UpcomingEventsList } from "@/widgets/upcoming-events";
import type { MirrorMessageSearch } from "../model/use-mirror-message-search";

export type MirrorChatSidePanelProps = {
  className?: string;
  currentUserId: UserId;
  participants: Participant[];
  search: MirrorMessageSearch;
  occurrences: EventOccurrence[];
  todayKey: string;
  now: number;
  onSelectEvent: (occurrence: EventOccurrence) => void;
};

// INFO: 다가오는 일정 has no next page offline — every row the snapshot holds is already here.
const noop = () => undefined;

/**
 * DESIGN.md § 7.20. 채팅's `lg` panel, mirrored — the partner block refuses
 * rather than opening the profile (REQUIREMENTS.md § 16.2.), and 검색 reads the
 * snapshot in memory instead of `entities/message`'s server search.
 */
export function MirrorChatSidePanel({
  className,
  currentUserId,
  participants,
  search,
  occurrences,
  todayKey,
  now,
  onSelectEvent,
}: MirrorChatSidePanelProps) {
  const partner = participants.find((participant) => participant.id !== currentUserId);
  const hasSearchResults = search.submitted.trim().length > 0;

  return (
    <div className={cn("flex h-full flex-col gap-md p-md", className)}>
      {partner && (
        <button
          className="flex cursor-pointer items-center gap-xs rounded-md p-xs text-left outline-none focus-visible:ring-2 focus-visible:ring-primary"
          type="button"
          aria-disabled
          aria-describedby={OFFLINE_NOTICE_ID}
          onClick={() => toast(OFFLINE_MESSAGES.view)}
        >
          {/* WARN: No `mediaId` — media is never cached offline (REQUIREMENTS.md § 16.2.), so the avatar draws its initial-letter fallback alone. */}
          <Avatar name={partner.name} />
          <span className="min-w-0 flex-1 truncate text-title-sm text-ink">{partner.name}</span>
        </button>
      )}

      <section
        className={cn(
          "flex min-h-0 flex-col gap-xs transition-[flex-grow] duration-(--duration-state) ease-out motion-reduce:transition-none",
          hasSearchResults ? "grow-2" : "grow-0",
        )}
      >
        <h2 className="px-xs text-title-sm text-meta">검색</h2>
        <MessageSearchField
          className="flex-none"
          variant="flat"
          autoFocus={false}
          query={search.query}
          isLoading={search.isLoading}
          onQueryChange={search.setQuery}
          onSubmit={search.submit}
        />
        {hasSearchResults && (
          <MessageSearchResultList
            className="h-0 min-h-0 flex-1 overflow-y-auto"
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
      <section className="flex min-h-0 grow-4 basis-0 flex-col gap-xs">
        <h2 className="px-xs text-title-sm text-meta">다가오는 일정</h2>
        <UpcomingEventsList
          className="min-h-0 flex-1 overflow-y-auto"
          pinsHeight={false}
          occurrences={occurrences}
          todayKey={todayKey}
          now={now}
          hasMore={false}
          isLoadingMore={false}
          onLoadMore={noop}
          onSelect={onSelectEvent}
        />
      </section>
    </div>
  );
}
