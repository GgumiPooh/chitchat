"use client";

import type { EventOccurrence } from "@/entities/event";
import type { MessageBookmark } from "@/entities/message";
import type { Participant } from "@/entities/user";
import { MessageBookmarkList } from "@/features/bookmark-messages";
import {
  MessageSearchField,
  MessageSearchResultList,
  type MessageSearch,
} from "@/features/search-messages";
import { useProfileViewer } from "@/features/view-profile";
import { cn, useRovingTabIndex, type MessageId, type UserId } from "@/shared/lib";
import { Avatar, Button, HeaderTextButton, Modal } from "@/shared/ui";
import { UpcomingEventsList } from "@/widgets/upcoming-events";
import { useState } from "react";

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
  bookmarks: MessageBookmark[];
  activeTab: "upcoming" | "bookmarks";
  onLoadMoreUpcoming: () => void;
  onSelectEvent: (occurrence: EventOccurrence) => void;
  onTabChange: (tab: "upcoming" | "bookmarks") => void;
  onSelectBookmark: (id: MessageId) => void;
  onRemoveBookmark?: (id: MessageId) => Promise<boolean>;
  onRenameBookmark?: (id: MessageId, name: string) => Promise<boolean>;
  onRemoveAllBookmarks?: () => Promise<boolean>;
};

/**
 * AGENTS.md § 4.1. Chat's `md` panel — 검색, 다가오는 일정/책갈피 and the other
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
  bookmarks,
  activeTab,
  onLoadMoreUpcoming,
  onSelectEvent,
  onTabChange,
  onSelectBookmark,
  onRemoveBookmark,
  onRenameBookmark,
  onRemoveAllBookmarks,
}: ChatSidePanelProps) {
  const { openProfile } = useProfileViewer();
  const [isEditingBookmarks, setIsEditingBookmarks] = useState(false);
  const [isConfirmingRemoveAll, setIsConfirmingRemoveAll] = useState(false);

  const partner = participants.find((participant) => participant.id !== currentUserId);
  const hasSearchResults = search.submitted.trim().length > 0;

  const activeIndex = activeTab === "upcoming" ? 0 : 1;
  const handleKeyDown = useRovingTabIndex({
    orientation: "horizontal",
    selector: "[data-chat-side-tab]",
  });

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
            {/* INFO: REQUIREMENTS.md § 8.12. Always mounted and transitioned between zero and one caption line — the button centres on the avatar, so a row appearing at its full height snaps the name up and back down every time the signal lapses. */}
            {/* WARN: The height is the caption tokens' own product, never a literal — the line it opens for is `text-caption`, and a number written here crops it the next time that token moves. */}
            <span
              className={cn(
                "block overflow-hidden text-caption text-meta transition-[height,opacity] duration-(--duration-state) ease-out motion-reduce:transition-none",
                typingUserIds.includes(partner.id)
                  ? "h-[calc(var(--text-caption)*var(--text-caption--line-height))] opacity-100"
                  : "h-0 opacity-0",
              )}
              aria-hidden={!typingUserIds.includes(partner.id)}
            >
              입력 중...
            </span>
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
        <div className="flex h-11 items-center justify-between px-xs">
          <div className="flex items-stretch rounded-full border border-hairline glass p-2xs">
            <div className="relative flex items-stretch" onKeyDown={handleKeyDown}>
              <span
                className="pointer-events-none absolute inset-y-0 left-0 rounded-full bg-primary-tint transition-[translate] duration-(--duration-tab-travel) ease-route motion-reduce:duration-0"
                aria-hidden="true"
                style={{
                  translate: `${activeIndex * 100}% 0`,
                  width: "50%",
                }}
              />
              <div className="relative z-10 flex items-stretch" role="tablist">
                <button
                  className="flex w-[100px] cursor-pointer items-center justify-center rounded-full py-1 text-button-sm outline-none select-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-inset"
                  role="tab"
                  tabIndex={activeTab === "upcoming" ? 0 : -1}
                  type="button"
                  data-chat-side-tab=""
                  aria-selected={activeTab === "upcoming"}
                  onClick={() => onTabChange("upcoming")}
                >
                  <span
                    className={cn(
                      "transition-colors duration-(--duration-tab-travel) motion-reduce:duration-0",
                      activeTab === "upcoming" ? "text-primary" : "text-meta hover:text-ink",
                    )}
                  >
                    다가오는 일정
                  </span>
                </button>
                <button
                  className="flex w-[100px] cursor-pointer items-center justify-center gap-1 rounded-full py-1 text-button-sm outline-none select-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-inset"
                  role="tab"
                  tabIndex={activeTab === "bookmarks" ? 0 : -1}
                  type="button"
                  data-chat-side-tab=""
                  aria-selected={activeTab === "bookmarks"}
                  onClick={() => onTabChange("bookmarks")}
                >
                  <span
                    className={cn(
                      "flex items-center gap-1 transition-colors duration-(--duration-tab-travel) motion-reduce:duration-0",
                      activeTab === "bookmarks" ? "text-primary" : "text-meta hover:text-ink",
                    )}
                  >
                    <span>책갈피</span>
                    {bookmarks.length > 0 && (
                      <span className="text-caption tabular-nums opacity-80">
                        {bookmarks.length}
                      </span>
                    )}
                  </span>
                </button>
              </div>
            </div>
          </div>
          {activeTab === "bookmarks" && bookmarks.length > 0 && (
            <HeaderTextButton
              variant="plain"
              haptic
              onClick={() => setIsEditingBookmarks((prev) => !prev)}
            >
              {isEditingBookmarks ? "완료" : "편집"}
            </HeaderTextButton>
          )}
        </div>

        {activeTab === "upcoming" ? (
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
        ) : (
          <div className="flex min-h-0 flex-1 flex-col">
            <MessageBookmarkList
              className="flex-1"
              bookmarks={bookmarks}
              participants={participants}
              isEditing={isEditingBookmarks}
              onSelect={onSelectBookmark}
              onRemove={onRemoveBookmark}
              onRename={onRenameBookmark}
              onStopEditing={() => setIsEditingBookmarks(false)}
            />
            {isEditingBookmarks && bookmarks.length > 0 && onRemoveAllBookmarks && (
              <div className="shrink-0 pt-sm">
                <Button variant="destructive" haptic onClick={() => setIsConfirmingRemoveAll(true)}>
                  전체 해제
                </Button>
              </div>
            )}
          </div>
        )}
      </section>

      {onRemoveAllBookmarks && (
        <Modal
          isOpen={isConfirmingRemoveAll}
          header={{ title: "책갈피를 모두 해제할까요?" }}
          onClose={() => setIsConfirmingRemoveAll(false)}
        >
          <div className="flex gap-xs">
            <Button
              className="flex-1"
              variant="secondary"
              onClick={() => setIsConfirmingRemoveAll(false)}
            >
              취소
            </Button>
            <Button
              className="flex-1"
              variant="destructive"
              onClick={async () => {
                setIsConfirmingRemoveAll(false);
                await onRemoveAllBookmarks();
                setIsEditingBookmarks(false);
              }}
            >
              전체 해제
            </Button>
          </div>
        </Modal>
      )}
    </div>
  );
}
