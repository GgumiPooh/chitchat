"use client";

import type { ChatMessage } from "@/entities/message";
import { MessageComposer, useSendMessage } from "@/features/send-message";
import { buildFadeMask, cn, type Nullable } from "@/shared/lib";
import { ActionSheet, EmptyState, Skeleton, toast, type ActionSheetItem } from "@/shared/ui";
import { Copy, MessageCircle, Trash2 } from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Virtuoso, type VirtuosoHandle } from "react-virtuoso";
import { requestMessageDeletion } from "../api/request-message-deletion";
import { buildChatRows } from "../model/build-chat-rows";
import type { ChatParticipant, ChatRow } from "../model/types";
import { useComposerClearance } from "../model/use-composer-clearance";
import { useMessageHistory } from "../model/use-message-history";
import { usePrependAnchor } from "../model/use-prepend-anchor";
import { DateDivider } from "./date-divider";
import { MessageRow } from "./message-row";
import { ScrollToBottomPill } from "./scroll-to-bottom-pill";
import { SystemNotice } from "./system-notice";

export type ChatRoomProps = {
  className?: string;
  currentUserId: string;
  participants: ChatParticipant[];
  initialMessages: ChatMessage[];
};

type ListContext = {
  isLoadingOlder: boolean;
};

// INFO: DESIGN.md § 6.7. The pill appears once the newest message is roughly this far away.
const AT_BOTTOM_THRESHOLD = 200;

// INFO: DESIGN.md § 7.12. Deep enough that a bubble dissolves under the floating header rather than being clipped by it.
const TOP_FADE_LENGTH = "3rem";

// WARN: Short on purpose — it dissolves the sliver leaving the shell below the tab bar, not the strip behind the bars. Fading that strip would leave the glass with nothing to blur (DESIGN.md § 3.5.).
const BOTTOM_FADE_LENGTH = "2rem";

/**
 * The chat surface — virtualized list, composer, and the scroll-to-bottom pill.
 * Offscreen bubbles stay out of the DOM (REQUIREMENTS.md § 8.3.), which is what
 * keeps years of history scrollable on iOS Safari.
 */
export function ChatRoom({
  className,
  currentUserId,
  participants,
  initialMessages,
}: ChatRoomProps) {
  const listRef = useRef<VirtuosoHandle>(null);
  const containerRef = useRef<Nullable<HTMLDivElement>>(null);
  const composerRef = useRef<Nullable<HTMLDivElement>>(null);
  const scrollerRef = useRef<Nullable<HTMLElement>>(null);
  const [isAtBottom, setIsAtBottom] = useState(true);
  const isAtBottomRef = useRef(true);
  const [isAtTop, setIsAtTop] = useState(true);
  const [actionTarget, setActionTarget] = useState<Nullable<ChatMessage>>(null);
  // INFO: The newest id the user had in view when they last left the bottom — everything past it is what the § 6.7. pill counts.
  const [seenId, setSeenId] = useState(initialMessages.at(-1)?.id ?? 0);
  const { messages, isLoadingOlder, loadOlder, appendMessage, removeMessage } =
    useMessageHistory(initialMessages);
  const { pending, send, retry } = useSendMessage({ onSent: appendMessage });
  const participantById = useMemo(
    () => new Map(participants.map((participant) => [participant.id, participant])),
    [participants],
  );
  const rows = useMemo(
    () => buildChatRows({ messages, pending, currentUserId }),
    [messages, pending, currentUserId],
  );
  const firstItemIndex = usePrependAnchor(rows);
  // WARN: Captured once. Virtuoso re-runs its initial positioning whenever this value changes, and a live `rows.length - 1` re-runs it on every prepend, which empties the list.
  const [initialTopMostItemIndex] = useState(() => Math.max(rows.length - 1, 0));
  // INFO: My own send is not a new message to me — counting it flashes `새 메시지 1` on the pill for my own bubble.
  const unseenCount = isAtBottom
    ? 0
    : messages.filter((message) => message.id > seenId && message.senderId !== currentUserId)
        .length;
  const pendingCount = pending.length;
  const lastPendingCount = useRef(pendingCount);

  useComposerClearance({ containerRef, composerRef, scrollerRef, isAtBottomRef });

  // WARN: Deliberately the scroller's own maximum rather than `scrollToIndex`. The list's trailing spacer already _is_ the clearance, so the bottom of the scroll range is the newest message sitting on the composer — and Virtuoso resolves an aligned index against its own measurements, which land short by the row's height under `firstItemIndex`.
  const scrollToBottom = useCallback(() => {
    scrollerRef.current?.scrollTo({ top: scrollerRef.current.scrollHeight, behavior: "smooth" });
  }, []);

  // WARN: Scrolling inside the send handler resolves against the pre-send data, so a message sent from deep in history lands below the fold. The row only exists from this commit onward.
  useEffect(() => {
    if (pendingCount > lastPendingCount.current) {
      scrollToBottom();
    }

    lastPendingCount.current = pendingCount;
  }, [pendingCount, scrollToBottom]);

  return (
    // INFO: DESIGN.md § 3.5. One scroll region spanning the whole screen; the composer and the tab bar float over its bottom edge rather than shortening it.
    <div ref={containerRef} className={cn("relative min-h-0 flex-1 bg-chat-canvas", className)}>
      {rows.length === 0 ? (
        <div className="absolute inset-0 flex items-center justify-center p-md pb-(--chat-bottom-gap)">
          <EmptyState Icon={MessageCircle} description="아직 주고받은 메시지가 없어요" />
        </div>
      ) : (
        <>
          {/* WARN: The absolute box is what gives Virtuoso a height. Its scroller is `height: 100%` inline, and a `flex-1` parent is not a definite height for that to resolve against — the list would measure a zero-height viewport and render nothing. */}
          <div className="absolute inset-0">
            <Virtuoso
              ref={listRef}
              // INFO: The fade edges are the scroll affordance here (§ 6.1.); a bar on top of them would sit over the bubbles and cut through the floating composer.
              className="scrollbar-hidden"
              atBottomThreshold={AT_BOTTOM_THRESHOLD}
              components={{ Header: ListHeader, Footer: ListFooter }}
              computeItemKey={(_, row) => row.key}
              context={{ isLoadingOlder }}
              data={rows}
              // WARN: REQUIREMENTS.md § 8.3. Prepending decrements this instead of growing the list from 0; without it every loaded page jumps the viewport.
              firstItemIndex={firstItemIndex}
              followOutput={(atBottom) => (atBottom ? "smooth" : false)}
              increaseViewportBy={{ top: 600, bottom: 600 }}
              initialTopMostItemIndex={initialTopMostItemIndex}
              itemContent={(_, row) => renderRow(row)}
              scrollerRef={captureScroller}
              style={{ height: "100%", maskImage: buildScrollFadeMask() }}
              atBottomStateChange={handleAtBottomChange}
              atTopStateChange={setIsAtTop}
              startReached={() => void loadOlder()}
            />
          </div>
          <ScrollToBottomPill
            className="absolute inset-x-0 bottom-[calc(var(--chat-bottom-gap)+var(--spacing-md))] mx-auto"
            isVisible={!isAtBottom}
            newMessageCount={unseenCount}
            onClick={scrollToBottom}
          />
        </>
      )}
      {/* WARN: Rendered outside the branch above. Two tree positions would remount the textarea on the first send and drop keyboard focus mid-conversation. */}
      {/* WARN: DESIGN.md § 3.5. The wrapper spans the full shell width and the composer's gutters, so without this it takes taps meant for the bubbles scrolling under it. */}
      <div
        ref={composerRef}
        className="pointer-events-none absolute inset-x-0 bottom-(--bottom-inset)"
      >
        <MessageComposer onSend={send} />
      </div>
      <ActionSheet
        isOpen={actionTarget !== null}
        items={buildActionItems()}
        header={{ title: "메시지" }}
        onClose={() => setActionTarget(null)}
      />
    </div>
  );

  function captureScroller(element: Nullable<HTMLElement | Window>) {
    scrollerRef.current = element instanceof HTMLElement ? element : null;
  }

  // INFO: The bottom edge needs no scroll condition — resting at the bottom leaves the trailing spacer there, so the gradient has nothing to act on.
  function buildScrollFadeMask() {
    return buildFadeMask({
      direction: "to bottom",
      fadeStart: !isAtTop,
      fadeEnd: true,
      startLength: TOP_FADE_LENGTH,
      endLength: BOTTOM_FADE_LENGTH,
    });
  }

  function renderRow(row: ChatRow) {
    switch (row.kind) {
      case "date":
        return <DateDivider dayKey={row.dayKey} />;
      case "system":
        return (
          <SystemNotice message={row.message} sender={participantById.get(row.message.senderId)} />
        );
      case "pending":
        return (
          <MessageRow
            text={row.pending.text}
            createdAt={row.pending.createdAt}
            sender={participantById.get(currentUserId)}
            isMine
            isFirstOfGroup={row.isFirstOfGroup}
            isLastOfGroup={row.isLastOfGroup}
            status={row.pending.status}
            onRetry={() => retry(row.pending.clientMsgId)}
          />
        );
      case "message":
        return (
          <MessageRow
            text={row.message.text ?? ""}
            createdAt={row.message.createdAt}
            sender={participantById.get(row.message.senderId)}
            isMine={row.isMine}
            isFirstOfGroup={row.isFirstOfGroup}
            isLastOfGroup={row.isLastOfGroup}
            status="sent"
            onLongPress={() => setActionTarget(row.message)}
          />
        );
    }
  }

  function buildActionItems(): ActionSheetItem[] {
    if (!actionTarget) {
      return [];
    }

    const target = actionTarget;
    const items: ActionSheetItem[] = [
      { label: "복사", Icon: Copy, onSelect: () => void copyText(target.text ?? "") },
    ];

    if (target.senderId === currentUserId) {
      items.push({
        label: "삭제",
        Icon: Trash2,
        variant: "destructive",
        onSelect: () => void deleteMessage(target.id),
      });
    }

    return items;
  }

  async function copyText(text: string) {
    try {
      await navigator.clipboard.writeText(text);
      toast.success("메시지를 복사했어요");
    } catch {
      toast.error("메시지를 복사하지 못했어요");
    }
  }

  async function deleteMessage(id: number) {
    try {
      await requestMessageDeletion(id);
      removeMessage(id);
    } catch {
      toast.error("메시지를 삭제하지 못했어요");
    }
  }

  function handleAtBottomChange(atBottom: boolean) {
    setIsAtBottom(atBottom);
    // WARN: `useComposerClearance` re-pins from inside a `ResizeObserver`, which runs after layout and before React would have flushed the state.
    isAtBottomRef.current = atBottom;

    // INFO: Leaving the bottom fixes the mark everything loaded so far is "seen"; while at the bottom the count is zero regardless.
    if (!atBottom) {
      setSeenId(messages.at(-1)?.id ?? 0);
    }
  }
}

// WARN: Constant height in both states — a header that grows when the fetch starts shifts the very scroll position § 8.3. exists to hold still.
function ListHeader({ context }: { context?: ListContext }) {
  return (
    <div className="flex h-10 items-center justify-center">
      {context?.isLoadingOlder && <Skeleton className="h-4 w-20 rounded-full" />}
    </div>
  );
}

// INFO: DESIGN.md § 3.5. The trailing space the floating bars need. It is the list's own content, so scrolling to the bottom parks the newest message just above the composer instead of behind it.
function ListFooter() {
  return <div className="h-(--chat-bottom-gap)" />;
}
