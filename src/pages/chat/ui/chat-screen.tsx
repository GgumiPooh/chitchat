"use client";

import type { ChatMessage } from "@/entities/message";
import { ChatStreamConnection, useChatStream } from "@/features/chat-stream";
import {
  MessageSearchBar,
  MessageSearchNav,
  MessageSearchResults,
  useMessageSearch,
} from "@/features/search-messages";
import { cn, type Maybe } from "@/shared/lib";
import { AppHeader, IconButton } from "@/shared/ui";
import { ChatRoom } from "@/widgets/chat-room";
import { Search } from "lucide-react";

export type ChatScreenProps = {
  className?: string;
  currentUserId: string;
  initialMessages: ChatMessage[];
  /** REQUIREMENTS.md § 10. A message 보관함 opened this screen on, if any. */
  jumpMessageId?: Maybe<number>;
};

/**
 * The chat screen's client half: the header, the room, and the § 8.6. search
 * that swaps one for the other.
 *
 * INFO: The search lives here rather than inside `ChatRoom` because it owns the
 * header, which REQUIREMENTS.md § 7. keeps per-screen. The room is told where to
 * go and reports nothing back — the jump itself is already its own (§ 8.6.1.).
 */
export function ChatScreen({
  className,
  currentUserId,
  initialMessages,
  jumpMessageId,
}: ChatScreenProps) {
  const search = useMessageSearch();
  const { participants } = useChatStream();

  return (
    // WARN: DESIGN.md § 3.5. Cancels `RouteTransition`'s `--bottom-inset` spacer rather than honouring it — chat is the one screen whose messages run all the way under the floating bars, and the composer reserves that room inside the list instead (§ 6.6.).
    <div
      className={cn(
        "mb-[calc(var(--bottom-inset,0px)*-1)] flex min-h-0 flex-1 flex-col bg-chat-canvas",
        className,
      )}
    >
      {/* INFO: REQUIREMENTS.md § 8.4.2. The app's one `EventSource`, open only while the conversation is. It renders nothing but the § 8.4.1. overlay. */}
      <ChatStreamConnection />
      {search.isOpen ? (
        <MessageSearchBar
          query={search.query}
          canSubmit={search.canSubmit}
          isLoading={search.isLoading}
          onQueryChange={search.setQuery}
          onSubmit={search.submit}
          onClose={search.close}
        />
      ) : (
        // INFO: DESIGN.md § 7.12. No title — the tab bar already says which screen this is, and the messages read better with the full column.
        <AppHeader
          trailing={
            <IconButton
              Icon={Search}
              variant="floating"
              haptic
              aria-label="메시지 검색"
              onClick={search.open}
            />
          }
        />
      )}
      <ChatRoom
        currentUserId={currentUserId}
        initialMessages={initialMessages}
        jumpTarget={search.target}
        // WARN: REQUIREMENTS.md § 10. A prop of its own rather than a fallback for the target above. Closing the search takes its target back to null, and a fallback would read that as a fresh instruction — jumping back to the tile's message from wherever the reader had got to.
        initialJumpMessageId={jumpMessageId}
        searchQuery={search.isOpen ? search.submitted : undefined}
        bottomBar={
          search.isOpen ? (
            <MessageSearchNav
              activeIndex={search.activeIndex}
              total={search.total}
              hasOlder={search.hasOlder}
              hasNewer={search.hasNewer}
              onOpenList={search.openList}
              onOlder={search.goOlder}
              onNewer={search.goNewer}
            />
          ) : undefined
        }
      />
      {search.isOpen && search.isListOpen && (
        <MessageSearchResults
          query={search.submitted}
          results={search.results}
          participants={participants}
          activeIndex={search.activeIndex}
          isLoading={search.isLoading}
          isLoadingMore={search.isLoadingMore}
          hasMore={search.hasMore}
          total={search.total}
          onLoadMore={search.loadMore}
          onClose={search.closeList}
          onSelect={search.select}
        />
      )}
    </div>
  );
}
