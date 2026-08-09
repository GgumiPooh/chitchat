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
import { AppHeader, Container, IconButton } from "@/shared/ui";
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
    // WARN: DESIGN.md § 3.4. The one screen that is not in the document's flow, and the reason is the keyboard rather than the layout. WebKit pans the visual viewport to reveal a focused field, and it can only do that to a document there is something to scroll — a `fixed` box sized to the visual viewport leaves it nothing, so `offsetTop` stays `0` and no chrome has to chase it from script. Every other screen keeps the document scroller, and Safari's collapsing toolbar with it (§ 3.3.).
    // WARN: `Container`, because a `fixed` box has left the shell column and inherits neither its max width nor its centring — the same re-application `AppHeader` and `BottomOverlay` make.
    // WARN: DESIGN.md § 3.4. The height eases and `top` never does. WebKit reports `visualViewport.height` in a couple of coarse steps while the keys slide, so a raw height lands the composer in its new place in one jump — the keyboard glides, the input bar teleports. `top` is the opposite case: it corrects a pan the user can already see, so easing it would draw the wrong position out instead of hiding it.
    // WARN: REQUIREMENTS.md § 12.2. The background carries `--chat-chrome-tint`, exactly as `body` does for every other screen. This box is `fixed` and borders both obscured content insets, so on iOS 26 it is what Safari samples its status bar and toolbar from (§ 3.3.) — `body` is behind it and never reached, and `useBackdropTint`'s wallpaper colour would have nowhere to land.
    <Container
      className={cn(
        // WARN: DESIGN.md § 3.3. `border-x`, matching the shell's own — this box covers the column's edges, so without it the hairline that separates the app from the desktop gutter stops at the chat route.
        "fixed inset-x-0 top-[var(--viewport-top,0px)] flex h-[var(--viewport-height,100dvh)] flex-col border-x border-hairline bg-[var(--chat-chrome-tint,var(--color-chat-canvas))] px-0 transition-[height] duration-200 ease-out",
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
    </Container>
  );
}
