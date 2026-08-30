"use client";

import type { EventOccurrence } from "@/entities/event";
import { EventDetailDialog } from "@/features/manage-event";
import type { CalendarSnapshot, ChatSnapshot, ShellSnapshot } from "@/features/offline-snapshot";
import {
  MessageSearchBar,
  MessageSearchNav,
  MessageSearchResults,
} from "@/features/search-messages";
import { SilentSendButton, useSilentSend } from "@/features/silent-send";
import { CALENDAR_ROUTE, MESSAGE_FLASH_DURATION, toQuoteHeading } from "@/shared/config";
import {
  A_DAY,
  cn,
  composeEventNotice,
  isForReader,
  isImminent,
  nextTimeLeftChangeAt,
  toDayKey,
  useDocumentBackground,
  type MessageId,
  type Nullable,
  type UserId,
} from "@/shared/lib";
import { useSnapshot } from "@/shared/snapshot";
import { AppHeader, Container, IconButton, ShellOverlay, TwoPane } from "@/shared/ui";
import { toChromeTint } from "@/widgets/chat-room";
import { SnapshotEmpty, SnapshotStamp } from "@/widgets/offline-shell";
import { UpcomingEventsPanel } from "@/widgets/upcoming-events";
import { CalendarClock, ChevronLeft, MessageCircle, Search } from "lucide-react";
import { useEffect, useMemo, useState, type CSSProperties } from "react";
import { buildMirrorRows, formatMirrorDayLabel, type MirrorRow } from "../model/build-mirror-rows";
import { useMirrorMessageSearch } from "../model/use-mirror-message-search";
import { MirrorAssistantRow } from "./mirror-assistant-row";
import { MirrorChatRow } from "./mirror-chat-row";
import { MirrorChatSidePanel } from "./mirror-chat-side-panel";
import { MirrorLoading } from "./mirror-loading";

export type MirrorChatProps = {
  className?: string;
  shell: ShellSnapshot;
};

// INFO: Hoisted for `message-row.tsx`'s own reason — a fresh object per render of every flashing row is an allocation that can never differ from this one.
const FLASH_STYLE = {
  "--message-flash-duration": `${MESSAGE_FLASH_DURATION}ms`,
} as CSSProperties;

/**
 * 채팅 as it was last received (REQUIREMENTS.md § 16.2.) — now carrying the live
 * screen's header (뒤로 / 다가오는 일정 / 검색 / 조용히 보내기), its `lg` side panel,
 * and a search that scans the snapshot in memory rather than `entities/message`'s
 * server route.
 *
 * INFO: The document scrolls this, where the live room is a `fixed` box of its own
 * (AGENTS.md § 4.4.) — that box exists for the composer's keyboard, and a read-only
 * mirror raises no keyboard and has no composer of its own.
 */
export function MirrorChat({ className, shell }: MirrorChatProps) {
  // INFO: REQUIREMENTS.md § 16.2. Cookie-backed (`useSilentSend`), so this works offline the way changing the mode always has.
  const { mode: notifyMode } = useSilentSend();
  const snapshot = useSnapshot<ChatSnapshot>(notifyMode === "onlyMe" ? "chat-only-me" : "chat");
  const calendarSnapshot = useSnapshot<CalendarSnapshot>("calendar");
  const messages = snapshot.status === "hit" ? snapshot.payload.messages : undefined;
  const participantById = useMemo(
    () => new Map(shell.participants.map((participant) => [participant.id, participant])),
    [shell.participants],
  );
  const rows = useMemo(
    () => (messages ? buildMirrorRows(messages, shell.currentUserId) : []),
    [messages, shell.currentUserId],
  );
  const search = useMirrorMessageSearch(messages ?? []);
  const [isUpcomingOpen, setIsUpcomingOpen] = useState(false);
  const [detailed, setDetailed] = useState<Nullable<EventOccurrence>>(null);
  const [flashedId, setFlashedId] = useState<Nullable<MessageId>>(null);
  // WARN: `0` and never `Date.now()` — `use-upcoming-events.ts`'s own guard, so the bloom never lights on the first frame ahead of the clock being read.
  const [now, setNow] = useState(0);
  // INFO: The device's own day, for the reason `mirror-calendar.tsx` reads it the same way — nothing here is a number two devices have to agree on.
  const [todayKey] = useState(() => toDayKey(Date.now()));

  useEffect(() => {
    // WARN: In a frame rather than in the effect body, the pattern `use-imminent-panel.ts` already reads the clock through — a client-only read may not decide the markup the server sent, and calling `setNow` directly here is flagged as exactly that.
    const frame = requestAnimationFrame(() => setNow(Date.now()));

    return () => cancelAnimationFrame(frame);
  }, []);

  const occurrences = useMemo(
    () => (calendarSnapshot.status === "hit" ? calendarSnapshot.payload.summary.upcoming : []),
    [calendarSnapshot],
  );
  const changeAt = useMemo(() => nextTimeLeftChangeAt(occurrences, now), [occurrences, now]);

  // INFO: REQUIREMENTS.md § 11.5.1. `use-upcoming-events.ts`'s own re-read, so a countdown and the bloom move while the mirror stays up; the `A_DAY` bound is its too.
  useEffect(() => {
    if (now === 0 || changeAt === null || changeAt - Date.now() > A_DAY) {
      return;
    }

    const timer = setTimeout(() => setNow(Date.now()), Math.max(changeAt - Date.now(), 0));

    return () => clearTimeout(timer);
  }, [now, changeAt]);
  // INFO: REQUIREMENTS.md § 11.5.1. The same set the header's live bloom reads — a 우리 일정 or the reader's own 개인 일정, starting within the day.
  const isSoon =
    now > 0 &&
    occurrences.some(
      (occurrence) => isForReader(occurrence, shell.currentUserId) && isImminent(occurrence, now),
    );

  // INFO: REQUIREMENTS.md § 12.2. The wallpaper's own tint, exactly as `ChatScreen` reads it — in the render, so it is there on the first paint rather than swapped in after hydration.
  const chromeTint = toChromeTint(shell.chatBackgroundBlurhash);
  useDocumentBackground(chromeTint ?? "var(--color-chat-canvas)");

  // INFO: DESIGN.md § 6.7. The newest message is what the room opens on, and the mirror is read from the same end.
  useEffect(() => {
    if (rows.length > 0) {
      window.scrollTo(0, document.body.scrollHeight);
    }
  }, [rows.length]);

  // INFO: REQUIREMENTS.md § 8.6.1. The jump, over the DOM rather than a virtualizer — the mirror renders every row at once, so there is no window to replace and no offset to compute by hand.
  useEffect(() => {
    if (!search.target) {
      return;
    }

    const targetId = search.target.id;

    // WARN: In a frame, for `setNow`'s reason above — `document.getElementById` and the scroll it feeds are both external reads, and the frame is what keeps `setFlashedId` out of the effect body's own synchronous call chain.
    const frame = requestAnimationFrame(() => {
      const row = document.getElementById(targetId);

      if (!row) {
        return;
      }

      row.scrollIntoView({
        block: "center",
        behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth",
      });
      setFlashedId(targetId);
    });

    return () => cancelAnimationFrame(frame);
  }, [search.target]);

  // INFO: DESIGN.md § 6.10. The wash dissolves on its own — `message-row.tsx`'s own flash carries the same fixed hold.
  useEffect(() => {
    if (flashedId === null) {
      return;
    }

    const timer = setTimeout(() => setFlashedId(null), MESSAGE_FLASH_DURATION);

    return () => clearTimeout(timer);
  }, [flashedId]);

  return (
    <div
      className={cn("bg-chat-canvas", className)}
      style={chromeTint ? { backgroundColor: chromeTint } : undefined}
    >
      <TwoPane
        panel={
          <MirrorChatSidePanel
            currentUserId={shell.currentUserId}
            participants={shell.participants}
            search={search}
            occurrences={occurrences}
            todayKey={todayKey}
            now={now}
            onSelectEvent={setDetailed}
          />
        }
      >
        {/* WARN: `relative` — `UpcomingEventsPanel` below is `absolute`, and `TwoPane`'s own main-column wrapper carries no position of its own to anchor it (ChatScreen's fixed box wraps its counterpart in the same class for the same reason). */}
        <div className="relative flex min-w-0 flex-1 flex-col">
          {search.isOpen ? (
            <MessageSearchBar
              className="lg:hidden"
              query={search.query}
              canSubmit={search.canSubmit}
              isLoading={search.isLoading}
              hasSidePanel
              onQueryChange={search.setQuery}
              onSubmit={search.submit}
              onClose={search.close}
            />
          ) : (
            renderHeader()
          )}
          {!search.isOpen && (
            <UpcomingEventsPanel
              className="lg:hidden"
              isOpen={isUpcomingOpen}
              occurrences={occurrences}
              todayKey={todayKey}
              now={now}
              hasMore={false}
              isLoadingMore={false}
              onLoadMore={() => undefined}
              onSelect={setDetailed}
              onClose={() => setIsUpcomingOpen(false)}
            />
          )}
          {/* INFO: § 16.2. Reading is the whole of what the mirror offers, so the dialog opens without its 일정 관리 — a control that could only refuse. */}
          <EventDetailDialog
            occurrence={detailed}
            participants={shell.participants}
            isReadOnly
            onClose={() => setDetailed(null)}
            onChanged={() => undefined}
          />
          <Container className="flex flex-col px-0 pt-[calc(var(--app-header-inset)+var(--spacing-xs))] pb-[calc(var(--bottom-inset,0px)+var(--spacing-md))]">
            {snapshot.status === "loading" && <MirrorLoading variant="bubbles" />}
            {snapshot.status === "miss" && <SnapshotEmpty Icon={MessageCircle} subject="메시지" />}
            {rows.map(renderRow)}
            {snapshot.status === "hit" && (
              <SnapshotStamp className="py-md text-center" savedAt={snapshot.savedAt} />
            )}
          </Container>
          {/* INFO: AGENTS.md § 4.4. `ShellOverlay` rather than a sixth `fixed` box — the mirror has no composer to hold `ChatRoom`'s `bottomBar`, so the nav sits above the tab bar on the layer the pill already rides. */}
          {search.isOpen && (
            <ShellOverlay>
              <div className="absolute inset-x-0 bottom-(--bottom-inset) px-md lg:hidden">
                <MessageSearchNav
                  className="pointer-events-auto"
                  activeIndex={search.activeIndex}
                  total={search.total}
                  hasOlder={search.hasOlder}
                  hasNewer={search.hasNewer}
                  hasNoResults={search.hasNoResults}
                  onOpenList={search.openList}
                  onOlder={search.goOlder}
                  onNewer={search.goNewer}
                />
              </div>
            </ShellOverlay>
          )}
          {search.isOpen && (
            <MessageSearchResults
              isOpen={search.isListOpen}
              query={search.submitted}
              results={search.results}
              participants={shell.participants}
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
      </TwoPane>
    </div>
  );

  // INFO: DESIGN.md § 7.12. No title — the tab bar already says which screen this is, exactly as the live header leaves it.
  function renderHeader() {
    return (
      <AppHeader
        hasSidePanel
        leading={
          // WARN: `IconButton` renders only a `<button>` — this is a document navigation (REQUIREMENTS.md § 16.2. — the mirror never `history.pushState`s), so it is a plain `<a>` wearing `IconButton`'s own `variant="floating"` classes by hand.
          <a
            className="inline-flex size-11 shrink-0 press-bloom cursor-pointer items-center justify-center rounded-full border border-hairline glass text-ink shadow-floating transition-colors outline-none hover:bg-canvas focus-visible:ring-2 focus-visible:ring-primary active:bg-surface-soft lg:hidden"
            href={CALENDAR_ROUTE}
            aria-label="뒤로"
          >
            <ChevronLeft className="size-5" strokeWidth={1.75} />
          </a>
        }
        trailing={
          // INFO: REQUIREMENTS.md § 16.1., § 16.2. Unlike 일정/검색, 조용히 보내기 has no side-panel equivalent from `lg` — the group below stays `lg:hidden`, this one does not. A mode switch is a cookie write, so it works offline.
          <div className="flex items-center gap-2xs">
            <SilentSendButton />
            <div className="flex items-center gap-2xs lg:hidden">
              <span className="relative flex">
                {isSoon && (
                  <span
                    className="pointer-events-none absolute -inset-2xs event-bloom rounded-full bg-primary blur-md"
                    aria-hidden
                  />
                )}
                <IconButton
                  variant="floating"
                  haptic
                  aria-label={isSoon ? "다가오는 일정, 곧 시작" : "다가오는 일정"}
                  aria-expanded={isUpcomingOpen}
                  icon={
                    <span className="pointer-events-none relative">
                      <CalendarClock className="size-5" strokeWidth={1.75} />
                      {isSoon && (
                        <span className="absolute -top-0.5 -right-1 size-1.5 rounded-full bg-primary" />
                      )}
                    </span>
                  }
                  onClick={() => setIsUpcomingOpen((current) => !current)}
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
          </div>
        }
      />
    );
  }

  function renderRow(row: MirrorRow) {
    if (row.kind === "date") {
      return (
        <div key={row.key} className="flex justify-center py-md">
          <span className="rounded-full bg-chat-pill px-sm py-2xs text-caption text-chat-pill-ink">
            {formatMirrorDayLabel(row.dayKey)}
          </span>
        </div>
      );
    }

    if (row.kind === "assistant") {
      return <MirrorAssistantRow key={row.key} message={row.message} />;
    }

    if (row.kind === "system") {
      return (
        // INFO: DESIGN.md § 6.5. The divider's own treatment, without the calendar link the live notice carries — the day it would open is not the day this snapshot holds.
        <div key={row.key} className="flex justify-center px-md py-sm">
          <span className="min-w-0 rounded-full bg-chat-pill px-sm py-2xs text-center text-caption text-chat-pill-ink">
            {composeEventNotice(
              row.message.systemAction,
              row.message.eventTitle,
              row.message.eventStartsAt,
              toName(row.message.senderId),
            )}
          </span>
        </div>
      );
    }

    const isFlashed = flashedId === row.message.id;

    return (
      <MirrorChatRow
        key={row.key}
        className={cn("scroll-mt-(--app-header-inset)", isFlashed && "message-flash")}
        style={isFlashed ? FLASH_STYLE : undefined}
        message={row.message}
        sender={participantById.get(row.message.senderId)}
        isMine={row.isMine}
        isFirstOfGroup={row.isFirstOfGroup}
        hasNotch={row.hasNotch}
        isLastOfGroup={row.isLastOfGroup}
        searchQuery={search.isOpen ? search.submitted : undefined}
        id={row.message.id}
        replyToHeading={
          row.message.replyTo
            ? toQuoteHeading(
                toName(row.message.replyTo.senderId),
                row.message.replyTo.senderId === shell.currentUserId,
                row.message.replyTo.llmProvider,
              )
            : undefined
        }
      />
    );
  }

  function toName(userId: UserId) {
    return participantById.get(userId)?.name;
  }
}
