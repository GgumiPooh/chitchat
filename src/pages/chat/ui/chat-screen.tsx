"use client";

import type { CalendarSummary, EventOccurrence } from "@/entities/event";
import type { ChatMessage } from "@/entities/message";
import {
  ChatStreamConnection,
  rememberInlineEmoticons,
  useChatStream,
} from "@/features/chat-stream";
import { EventDetailDialog, EventFormSheet } from "@/features/manage-event";
import {
  MessageSearchBar,
  MessageSearchNav,
  MessageSearchResults,
  useMessageSearch,
} from "@/features/search-messages";
import type { InlineEmoticonMap } from "@/shared/config";
import { CALENDAR_ROUTE, LOGIN_ROUTE } from "@/shared/config";
import {
  cn,
  getPreviousAppRoute,
  useDocumentBackground,
  usePinnedDocument,
  type Maybe,
  type MessageId,
  type Nullable,
  type UserId,
} from "@/shared/lib";
import { AppHeader, Container, IconButton } from "@/shared/ui";
import { ChatRoom, toChromeTint } from "@/widgets/chat-room";
import { CalendarClock, ChevronLeft, Search } from "lucide-react";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import { useImminentPanel } from "../model/use-imminent-panel";
import { useUpcomingEvents } from "../model/use-upcoming-events";
import { UpcomingEventsPanel } from "./upcoming-events-panel";

export type ChatScreenProps = {
  className?: string;
  currentUserId: UserId;
  initialMessages: ChatMessage[];
  /** REQUIREMENTS.md § 13. What the emoticons written into those messages draw, resolved by the same server render. */
  initialEmoticons: InlineEmoticonMap;
  /** REQUIREMENTS.md § 11.5.1. 다가오는 일정, for the header's own copy of the calendar's card. */
  initialSummary: CalendarSummary;
  /** REQUIREMENTS.md § 10. A message 보관함 opened this screen on, if any. */
  jumpMessageId?: Maybe<MessageId>;
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
  initialEmoticons,
  initialSummary,
  jumpMessageId,
}: ChatScreenProps) {
  const search = useMessageSearch();
  const upcoming = useUpcomingEvents(initialSummary);
  // INFO: REQUIREMENTS.md § 11.5.1. Arriving with something imminent opens the panel; closing it is what stops that happening again.
  const imminent = useImminentPanel(upcoming.occurrences);
  const [isUpcomingOpen, setIsUpcomingOpen] = useState(false);
  // INFO: REQUIREMENTS.md § 11.5.1. One-way — the panel takes its taller, scrolling shape at the first 더 보기 and keeps it, so the box does not resize again under the reader.
  // INFO: Two ways in, one state out — the arrival prompt and the header button, either of which the same 닫기 puts away.
  const isPanelOpen = isUpcomingOpen || imminent.isPrompted;
  // INFO: REQUIREMENTS.md § 11.5.1. A row opens the event here rather than crossing to 캘린더 — the question the panel answers is "when is that again", and a tab change to read a memo loses the conversation.
  const [detailed, setDetailed] = useState<Nullable<EventOccurrence>>(null);
  // INFO: REQUIREMENTS.md § 11.4. The composer's 일정 row lands here, and `null` is "no form up" — a token because `EventFormSheet` seeds its draft once, at mount.
  const [formToken, setFormToken] = useState<Nullable<number>>(null);
  const { participants, chatBackgroundBlurhash } = useChatStream();
  const router = useRouter();

  // INFO: 이전 앱 라우트가 있고 로그인 페이지가 아니면 router.back(), 없으면 캘린더로 폴백.
  const goBack = useCallback(() => {
    const prevAppRoute = getPreviousAppRoute();

    if (prevAppRoute && !prevAppRoute.includes(LOGIN_ROUTE)) {
      router.back();
    } else {
      router.push(CALENDAR_ROUTE);
    }
  }, [router]);

  const closeUpcoming = useCallback(() => {
    setIsUpcomingOpen(false);
    imminent.dismiss();
  }, [imminent]);

  // WARN: DESIGN.md § 3.4. This box is sized from the visual viewport, so the document beneath it may never carry an offset of its own — see `usePinnedDocument` for the one iOS gives it anyway.
  usePinnedDocument(true);

  // WARN: REQUIREMENTS.md § 13. In an effect and never in the render, because the store is a module singleton this component is also rendered on the server against — written there it would be one request's emoticons handed to the next one's reader.
  useEffect(() => {
    rememberInlineEmoticons(initialEmoticons);
  }, [initialEmoticons]);

  // INFO: REQUIREMENTS.md § 12.2. Read here rather than by the backdrop that draws the photo: the tint is *this* box's own background, so it belongs to this component and cannot outlive it.
  // WARN: In the render, so the colour is in the server's HTML and is what Safari samples at the first paint of a cold launch — an effect publishes it after that read, which iOS 26 never repeats (DESIGN.md § 3.3.).
  const chromeTint = toChromeTint(chatBackgroundBlurhash);

  // WARN: DESIGN.md § 3.4. The keyboard is the one moment this box does not cover the document — it is sized to the visual viewport and iOS leaves the layout viewport its full height, so `body` is what shows under the composer and what Safari samples there.
  // INFO: REQUIREMENTS.md § 12.2. The same colour the box above wears, so the strip the keys leave reads as the room continuing rather than as a `canvas` seam cutting it off.
  useDocumentBackground(chromeTint ?? "var(--color-chat-canvas)");

  return (
    // WARN: DESIGN.md § 3.4. The one screen that is not in the document's flow, and the reason is the keyboard rather than the layout. WebKit pans the visual viewport to reveal a focused field, and it can only do that to a document there is something to scroll — a `fixed` box sized to the visual viewport leaves it nothing, so `offsetTop` stays `0` and no chrome has to chase it from script. Every other screen keeps the document scroller, and Safari's collapsing toolbar with it (§ 3.3.).
    // WARN: `Container`, because a `fixed` box has left the shell column and inherits neither its max width nor its centring — the same re-application `AppHeader` and `BottomOverlay` make.
    // INFO: DESIGN.md § 3.4. `--chat-screen-height` is the visual viewport until 검색's field holds the keyboard, where `ChatRoom` holds it at the resting height so the keys cover the sheet rather than shrink it.
    // WARN: DESIGN.md § 3.4. The height eases and `top` never does. WebKit reports `visualViewport.height` in a couple of coarse steps while the keys slide, so a raw height lands the composer in its new place in one jump — the keyboard glides, the input bar teleports. `top` is the opposite case: it corrects a pan the user can already see, so easing it would draw the wrong position out instead of hiding it.
    // WARN: REQUIREMENTS.md § 12.2. The background carries the wallpaper's tint, exactly as `body` does for every other screen. This box is `fixed` and borders both obscured content insets, so on iOS 26 it is what Safari samples its status bar and toolbar from (§ 3.3.) — `body` is behind it and never reached, and the wallpaper's colour would have nowhere to land.
    // WARN: DESIGN.md § 3.3. What Safari reads is the strip of pixels at the top edge, not this box's declared colour, so nothing drawn over it there may be opaque — `ChatRoom` gave up its own floor for that reason and must not get one back.
    <Container
      className={cn(
        // WARN: DESIGN.md § 3.3. `shell-edge`, matching the shell's own — this box covers the column's edges, so without it the hairline that separates the app from the desktop gutter stops at the chat route.
        "fixed inset-x-0 top-(--keyboard-pan) flex h-(--chat-screen-height) flex-col bg-chat-canvas px-0 shell-edge transition-[height] duration-(--viewport-settle-duration) ease-out",
        className,
      )}
      // INFO: REQUIREMENTS.md § 12.2. Overrides `bg-chat-canvas` above, which stays as the no-wallpaper answer and as the fallback for a hash the base83 pass rejects.
      // WARN: `--bottom-inset` is seeded here to match what `BottomOverlay` will measure once it runs. `theme.css` seeds it at tab-bar height because every other screen needs that clearance on first paint; the chat tab has no tab bar, so the seed is off by a full bar and the composer jumps down the frame the observer fires. `--bar-lift` (safe-area + float-gap) is exactly what the overlay will measure and write, so there is no jump.
      style={{
        ...(chromeTint ? { backgroundColor: chromeTint } : {}),
        ["--bottom-inset" as string]: "var(--bar-lift)",
      }}
    >
      {/* INFO: REQUIREMENTS.md § 8.4.2. The app's one `EventSource`, open only while the conversation is. It renders nothing. */}
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
          leading={
            <IconButton
              Icon={ChevronLeft}
              variant="floating"
              haptic
              aria-label="뒤로"
              onClick={goBack}
            />
          }
          trailing={
            <div className="flex items-center gap-2xs">
              {/* INFO: DESIGN.md § 7.12. The bloom is a sibling behind the glass rather than a shadow on the button, because `icon-button-floating` already spends its `box-shadow` on `shadow-floating` — a second one silently replaces it. */}
              <span className="relative flex">
                {upcoming.isSoon && (
                  <span
                    className="pointer-events-none absolute -inset-2xs event-bloom rounded-full bg-primary blur-md"
                    aria-hidden
                  />
                )}
                <IconButton
                  variant="floating"
                  haptic
                  aria-label={upcoming.isSoon ? "다가오는 일정, 곧 시작" : "다가오는 일정"}
                  aria-expanded={isPanelOpen}
                  // INFO: DESIGN.md § 7.12. The dot is § 7.3.'s 캘린더 one, glyph corner and all, because it says the same kind of thing — and it goes through `icon` so it rides the glyph rather than the 44 target, which is what keeps it on the button's own glass.
                  icon={
                    <span className="pointer-events-none relative">
                      <CalendarClock className="size-5" strokeWidth={1.75} />
                      {upcoming.isSoon && (
                        <span className="absolute -top-0.5 -right-1 size-1.5 rounded-full bg-primary" />
                      )}
                    </span>
                  }
                  onClick={() => (isPanelOpen ? closeUpcoming() : setIsUpcomingOpen(true))}
                />
              </span>
              <IconButton
                Icon={Search}
                variant="floating"
                haptic
                aria-label="메시지 검색"
                onClick={search.open}
              />
            </div>
          }
        />
      )}
      {/* WARN: Withheld while 검색 is up, for the reason § 8.6. withholds the composer's stack — the bar that opens it is not on screen, so nothing would say what this panel is doing there. */}
      {!search.isOpen && (
        <UpcomingEventsPanel
          isOpen={isPanelOpen}
          occurrences={upcoming.occurrences}
          todayKey={upcoming.todayKey}
          now={upcoming.now}
          hasMore={upcoming.hasMore}
          isLoadingMore={upcoming.isLoadingMore}
          onLoadMore={upcoming.loadMore}
          onSelect={setDetailed}
          onClose={closeUpcoming}
        />
      )}
      <EventDetailDialog
        occurrence={detailed}
        participants={participants}
        onClose={() => setDetailed(null)}
        onChanged={upcoming.reload}
      />
      {formToken !== null && (
        <EventFormSheet
          key={formToken}
          isOpen
          dayKey={upcoming.todayKey}
          occurrence={null}
          onClose={() => setFormToken(null)}
          onSaved={upcoming.reload}
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
        onAddEvent={() => setFormToken((token) => (token ?? 0) + 1)}
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
