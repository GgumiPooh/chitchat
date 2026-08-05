"use client";

import type { Emoticon } from "@/entities/emoticon";
import type { MediaDraft } from "@/entities/media";
import type { ChatMessage, ReplyPreview } from "@/entities/message";
import type { Participant } from "@/entities/user";
import { useChatStream, useChatStreamListener } from "@/features/chat-stream";
import {
  EmoticonPicker,
  EmoticonPreview,
  MessageComposer,
  useSendMessage,
} from "@/features/send-message";
import {
  MediaEditor,
  MediaPickerSheet,
  MediaTray,
  useMediaSelection,
} from "@/features/upload-media";
import {
  MESSAGE_FLASH_DURATION,
  REPLY_PREVIEW_MAX_LENGTH,
  isVideoMime,
  type MessageArrival,
} from "@/shared/config";
import {
  buildFadeMask,
  cn,
  useIsVirtualKeyboardOpen,
  useSoundUnlock,
  useUnsentWork,
  type Nullable,
} from "@/shared/lib";
import {
  ActionSheet,
  EmptyState,
  MediaViewer,
  Skeleton,
  toast,
  type ActionSheetItem,
  type MediaCell,
} from "@/shared/ui";
import { Copy, CornerUpLeft, MessageCircle, Trash2 } from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Virtuoso, type VirtuosoHandle } from "react-virtuoso";
import { requestMessageDeletion } from "../api/request-message-deletion";
import { buildChatRows } from "../model/build-chat-rows";
import { playEmoticonSound } from "../model/play-emoticon-sound";
import { toCellsFromDrafts, toCellsFromMedia } from "../model/to-media-cells";
import type { ChatRow } from "../model/types";
import { useComposerClearance } from "../model/use-composer-clearance";
import { useMessageHistory } from "../model/use-message-history";
import { usePrependAnchor } from "../model/use-prepend-anchor";
import { DateDivider } from "./date-divider";
import { MessageRow } from "./message-row";
import { ReplyBar } from "./reply-bar";
import { ScrollToBottomPill } from "./scroll-to-bottom-pill";
import { SystemNotice } from "./system-notice";

export type ChatRoomProps = {
  className?: string;
  currentUserId: string;
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
export function ChatRoom({ className, currentUserId, initialMessages }: ChatRoomProps) {
  const listRef = useRef<VirtuosoHandle>(null);
  const containerRef = useRef<Nullable<HTMLDivElement>>(null);
  const composerRef = useRef<Nullable<HTMLDivElement>>(null);
  const scrollerRef = useRef<Nullable<HTMLElement>>(null);
  const rowsRef = useRef<ChatRow[]>([]);
  const [isAtBottom, setIsAtBottom] = useState(true);
  const isAtBottomRef = useRef(true);
  const [isAtTop, setIsAtTop] = useState(true);
  const [actionTarget, setActionTarget] = useState<Nullable<ChatMessage>>(null);
  const [isPickerOpen, setIsPickerOpen] = useState(false);
  const [isEmoticonPickerOpen, setIsEmoticonPickerOpen] = useState(false);
  // INFO: The panel outlives its first open so the collapse has something to animate; until then it is not rendered at all, and a user who never opens it never fetches the packs.
  const [hasOpenedEmoticonPanel, setHasOpenedEmoticonPanel] = useState(false);
  // INFO: REQUIREMENTS.md § 13.6. Staged rather than sent on selection, so it can be sent with a line of text the way an attachment can.
  const [stagedEmoticon, setStagedEmoticon] = useState<Nullable<Emoticon>>(null);
  // INFO: REQUIREMENTS.md § 8.9. Not mutually exclusive with the two above — a quote is an attribute of the send, not a payload competing for the § 6. row.
  const [replyTarget, setReplyTarget] = useState<Nullable<ReplyPreview>>(null);
  // INFO: DESIGN.md § 6.8. The bubble a jump landed on, until its flash expires.
  const [highlightedId, setHighlightedId] = useState<Nullable<number>>(null);
  const [editing, setEditing] = useState<Nullable<MediaDraft>>(null);
  const [viewer, setViewer] = useState<Nullable<{ cells: MediaCell[]; index: number }>>(null);
  // INFO: The newest id the user had in view when they last left the bottom — everything past it is what the § 6.7. pill counts.
  const [seenId, setSeenId] = useState(initialMessages.at(-1)?.id ?? 0);
  const {
    messages,
    isLoadingOlder,
    hasNewer,
    loadOlder,
    loadNewer,
    loadAround,
    returnToLive,
    appendMessage,
    removeMessage,
    catchUp,
  } = useMessageHistory(initialMessages);
  const { pending, send, sendMedia, sendEmoticon, retry, cancel, resolve } = useSendMessage({
    onSent: appendMessage,
  });
  const selection = useMediaSelection();
  const isKeyboardOpen = useIsVirtualKeyboardOpen();
  // WARN: Belt to the field's own `onFieldFocus` braces, and derived rather than an effect that closes it — Android reopens the keyboard on a field that is already focused, which fires no `focus` event for the picker to hear.
  const isEmoticonPanelOpen = isEmoticonPickerOpen && !isKeyboardOpen;
  const { participants, setIsReading } = useChatStream();
  const participantById = useMemo(
    () => new Map(participants.map((participant) => [participant.id, participant])),
    [participants],
  );
  const rows = useMemo(
    () => buildChatRows({ messages, pending, currentUserId }),
    [messages, pending, currentUserId],
  );
  // INFO: REQUIREMENTS.md § 8.8. The cursor is the other participant's `last_read_at`, which the § 8.4. stream already keeps current — 읽음 lands without a request of its own.
  const lastReadMineId = useMemo(
    () => findLastReadMineId(messages, currentUserId, participants),
    [messages, currentUserId, participants],
  );
  const firstItemIndex = usePrependAnchor(rows);
  // WARN: Captured at the first render that has rows, not the first render. An empty room renders the empty state instead of the list, so a value fixed before then is `0` and parks the mount at the oldest arriving message rather than the newest.
  const [initialIndex, setInitialIndex] = useState<Nullable<number>>(null);

  if (initialIndex === null && rows.length > 0) {
    setInitialIndex(rows.length - 1);
  }

  if (isEmoticonPanelOpen && !hasOpenedEmoticonPanel) {
    setHasOpenedEmoticonPanel(true);
  }

  // WARN: Never a live `rows.length - 1` — Virtuoso re-runs its initial positioning whenever this changes, and on every prepend that empties the list (REQUIREMENTS.md § 8.3.).
  const initialTopMostItemIndex = initialIndex ?? 0;
  // INFO: My own send is not a new message to me — counting it flashes `새 메시지 1` on the pill for my own bubble.
  const unseenCount = isAtBottom
    ? 0
    : messages.filter((message) => message.id > seenId && message.senderId !== currentUserId)
        .length;
  const pendingCount = pending.length;
  const lastPendingCount = useRef(pendingCount);
  const isSending = pending.some((entry) => entry.status === "sending");

  // INFO: REQUIREMENTS.md § 8.5. The stream echoes my own message back too, so the optimistic bubble is retired on `client_msg_id` rather than waiting for the POST response it may well beat.
  const receiveMessage = useCallback(
    (message: ChatMessage, arrival: MessageArrival) => {
      const isNew = appendMessage(message);

      resolve(message.clientMsgId);

      // INFO: REQUIREMENTS.md § 13.6. My own emoticon already sounded at the tap that sent it, so the echo of it is silent.
      if (isNew && arrival === "live" && message.senderId !== currentUserId) {
        playEmoticonSound(message.emoticon);
      }
    },
    [appendMessage, resolve, currentUserId],
  );

  // INFO: REQUIREMENTS.md § 15.1. Staged attachments and sends still in flight both die with the document, so a refresh forced by a new deployment waits them out.
  // WARN: `sending` only. A failed bubble never finishes on its own, so counting it pins the app to a stale bundle until the user happens to retry or cancel.
  useUnsentWork(
    isSending || selection.drafts.length > 0 || stagedEmoticon !== null || replyTarget !== null,
  );

  useComposerClearance({ containerRef, composerRef, scrollerRef, isAtBottomRef });

  // INFO: REQUIREMENTS.md § 13.6. An arriving emoticon plays by itself, and no gesture of its own is coming — the room borrows the first one the user makes anywhere on the page.
  useSoundUnlock();

  // INFO: REQUIREMENTS.md § 13.6. A tap anywhere else dismisses the panel. `pointerdown` rather than `click`, so it closes on the same gesture that starts a scroll of the history.
  useEffect(() => {
    if (!isEmoticonPickerOpen) {
      return;
    }

    // WARN: The composer's own wrapper is the exception, not just the panel — the toggle lives in it and would otherwise be closed here and re-opened by its own handler.
    const handlePointerDown = (event: PointerEvent) => {
      if (!composerRef.current?.contains(event.target as Node)) {
        setIsEmoticonPickerOpen(false);
      }
    };

    document.addEventListener("pointerdown", handlePointerDown);

    return () => document.removeEventListener("pointerdown", handlePointerDown);
  }, [isEmoticonPickerOpen]);

  // INFO: REQUIREMENTS.md § 8.4. The connection belongs to the shell; this screen only asks to hear from it.
  useChatStreamListener({ onMessage: receiveMessage, onResume: catchUp });

  // INFO: REQUIREMENTS.md § 8.8. The conversation is on screen for as long as this is mounted, which is what suppresses the badge and moves the read cursor.
  useEffect(() => {
    setIsReading(true);

    return () => setIsReading(false);
  }, [setIsReading]);

  // WARN: Deliberately the scroller's own maximum rather than `scrollToIndex`. The list's trailing spacer already _is_ the clearance, so the bottom of the scroll range is the newest message sitting on the composer — and Virtuoso resolves an aligned index against its own measurements, which land short by the row's height under `firstItemIndex`.
  const scrollToBottom = useCallback(() => {
    scrollerRef.current?.scrollTo({ top: scrollerRef.current.scrollHeight, behavior: "smooth" });
  }, []);

  /** REQUIREMENTS.md § 8.6.1. The § 6.7. pill is also the way back from a jump, so it restores the window before it scrolls. */
  const goToNewest = useCallback(async () => {
    await returnToLive();
    scrollToBottom();
  }, [returnToLive, scrollToBottom]);

  // WARN: Scrolling inside the send handler resolves against the pre-send data, so a message sent from deep in history lands below the fold. The row only exists from this commit onward.
  useEffect(() => {
    if (pendingCount > lastPendingCount.current) {
      scrollToBottom();
    }

    lastPendingCount.current = pendingCount;
  }, [pendingCount, scrollToBottom]);

  // WARN: REQUIREMENTS.md § 8.6.1. The jump reads the rows back through this rather than through the closure it was called in — `loadAround` replaces the window, and the array the handler captured predates it.
  useEffect(() => {
    rowsRef.current = rows;
  }, [rows]);

  // INFO: DESIGN.md § 6.8. The flash is a moment, not a selection — nothing dismisses it but time.
  useEffect(() => {
    if (highlightedId === null) {
      return;
    }

    const timer = setTimeout(() => setHighlightedId(null), MESSAGE_FLASH_DURATION);

    return () => clearTimeout(timer);
  }, [highlightedId]);

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
              // INFO: REQUIREMENTS.md § 8.6.1. Downward paging exists for the jumped-away window alone; at the live edge `loadNewer` returns immediately.
              endReached={() => void loadNewer()}
              startReached={() => void loadOlder()}
            />
          </div>
          <ScrollToBottomPill
            className="absolute inset-x-0 bottom-[calc(var(--chat-bottom-gap)+var(--spacing-md))] mx-auto"
            // WARN: § 8.6.1. A window parked around a jump target can sit at the bottom of its own scroll range while the newest message is still pages away, so the pill has to answer to the window too.
            isVisible={!isAtBottom || hasNewer}
            newMessageCount={unseenCount}
            onClick={() => void goToNewest()}
          />
        </>
      )}
      {/* WARN: Rendered outside the branch above. Two tree positions would remount the textarea on the first send and drop keyboard focus mid-conversation. */}
      {/* WARN: DESIGN.md § 3.5. The wrapper spans the full shell width and the composer's gutters, so without this it takes taps meant for the bubbles scrolling under it. */}
      <div
        ref={composerRef}
        className="pointer-events-none absolute inset-x-0 bottom-(--bottom-inset)"
      >
        {/* INFO: REQUIREMENTS.md § 8.9. Above the tray and the pill, and in the flow — the quote belongs to the send the whole stack is composing, so it reads as the header of it. */}
        {replyTarget && (
          <ReplyBar
            className="mx-md mb-2xs"
            replyTo={replyTarget}
            name={participantById.get(replyTarget.senderId)?.name}
            onCancel={() => setReplyTarget(null)}
          />
        )}
        <MediaTray
          className="mx-md mb-2xs"
          drafts={selection.drafts}
          isReading={selection.isReading}
          onEdit={setEditing}
          onRemove={selection.remove}
        />
        {/* WARN: REQUIREMENTS.md § 13.6. Absolute so it adds nothing to the wrapper this hook measures — in flow it would grow the clearance and shove the history up under a preview that is glass and meant to float over it. */}
        {/* WARN: § 13.6. wants the preview above the open panel, but the panel is half the shell — `bottom-full` alone puts it behind the floating header on a short viewport and off the top of the screen below ~604px, which is the panel not appearing to stage at all. The `min()` stops it at the header and lets it overlap the panel's top rows instead, which only happens where something has to give. */}
        {stagedEmoticon && (
          <div className="absolute inset-x-0 bottom-[min(100%,calc(var(--viewport-height,100dvh)_-_var(--bottom-inset)_-_var(--app-header-inset)_-_var(--emoticon-preview-height)_-_var(--spacing-xs)))]">
            <EmoticonPreview
              className="mx-md mb-2xs"
              emoticon={stagedEmoticon}
              onRemove={() => setStagedEmoticon(null)}
            />
          </div>
        )}
        {/* INFO: REQUIREMENTS.md § 13.6. Inside the composer's own absolute wrapper, so the panel sits above the bar and the messages still scroll underneath both. */}
        {/* INFO: § 13.6. `justify-end` anchors the panel to the bottom of the strip, so it is revealed rising from behind the composer rather than unrolling downward from a top edge that is itself moving up. */}
        {/* WARN: A real `height` and never a `0fr`→`1fr` grid track. Mid-transition Chrome sizes such a track's container taller than the track it resolved, and the strip below the bottom-anchored panel is a gap that opens and shuts — which is what read as the panel stretching apart from its middle. */}
        <div
          className={cn(
            "flex flex-col justify-end overflow-hidden transition-[height] duration-200 ease-out",
            isEmoticonPanelOpen
              ? // WARN: The underscores are the spaces `calc()` requires around `+`. Written closed up the declaration is invalid, and the strip resolves to `0px` — the panel opens to nothing and no cell can be tapped.
                "h-[calc(var(--emoticon-panel-height)_+_var(--spacing-xs)_+_var(--spacing-2xs))]"
              : "h-0",
          )}
          // WARN: The panel stays mounted through the collapse so it has something to animate, which leaves its tab stops in the document until this takes them back out.
          inert={!isEmoticonPanelOpen}
        >
          {hasOpenedEmoticonPanel && (
            // INFO: § 13.6. `mt-xs` matches the composer's own top padding, so the panel clears the history by what the bar alone clears it by. The height above is this panel plus both margins.
            // WARN: `shrink-0` or the collapsing strip compresses the panel instead of clipping it, and § 13.6.'s own `flex-1` scroller is what gives — the panel then reads as stretching open rather than rising.
            <EmoticonPicker className="mx-md mt-xs mb-2xs shrink-0" onSelect={stageEmoticon} />
          )}
        </div>
        <MessageComposer
          hasAttachments={selection.drafts.length > 0 || stagedEmoticon !== null}
          isEmoticonPickerOpen={isEmoticonPanelOpen}
          onAttach={() => setIsPickerOpen(true)}
          onFieldFocus={() => setIsEmoticonPickerOpen(false)}
          onToggleEmoticons={() => setIsEmoticonPickerOpen((current) => !current)}
          onSend={submit}
        />
      </div>
      <ActionSheet
        isOpen={actionTarget !== null}
        items={buildActionItems()}
        header={{ title: "메시지" }}
        onClose={() => setActionTarget(null)}
      />
      <MediaPickerSheet
        isOpen={isPickerOpen}
        onClose={() => setIsPickerOpen(false)}
        onSelect={(files) => void stageMedia(files)}
      />
      {editing && (
        // WARN: Keyed by draft — `MediaEditor` mints its source object URL once per mount, so editing a second photo must be a second mount.
        <MediaEditor
          key={editing.id}
          draft={editing}
          onCancel={() => setEditing(null)}
          onDone={handleEdited}
        />
      )}
      {viewer && (
        <MediaViewer
          cells={viewer.cells}
          initialIndex={viewer.index}
          onClose={() => setViewer(null)}
        />
      )}
    </div>
  );

  /**
   * INFO: REQUIREMENTS.md § 13.6. An emoticon and attachments are mutually exclusive in the composer — each bubble is one or the other (§ 6.), and staging both would promise a single send the schema has no row for.
   */
  function stageEmoticon(emoticon: Emoticon) {
    selection.clear();
    setStagedEmoticon(emoticon);
    // INFO: REQUIREMENTS.md § 13.6. The preview autoplays the animation, and the sound is the other half of the same playback.
    playEmoticonSound(emoticon);
  }

  async function stageMedia(files: File[]) {
    setStagedEmoticon(null);
    await selection.add(files);
  }

  /**
   * INFO: The emoticon and the attachments go first, then the text, so a caption reads under what it belongs to rather than above it.
   *
   * WARN: The order survives because `useSendMessage` delivers on one promise chain. Firing these in parallel would let the text win the race for `messages.id` and land above them on every other client and every reload.
   */
  function submit(text: string) {
    // INFO: REQUIREMENTS.md § 8.6.1. A send from a jumped-away window has to land somewhere the sender can see it, and the only place that is true is the live edge.
    if (hasNewer) {
      void returnToLive();
    }

    // WARN: REQUIREMENTS.md § 8.9. Consumed by the first bubble only. Emoticon, then attachments, then text is the order they are queued in, and a quote repeated over three of them says the same thing three times.
    let quote = replyTarget;

    const take = () => {
      const taken = quote;

      quote = null;

      return taken;
    };

    if (stagedEmoticon) {
      // WARN: REQUIREMENTS.md § 13.6. Here rather than on the echo, and synchronously inside the tap — the send is the moment KakaoTalk sounds, and iOS grants audio to this call stack alone.
      playEmoticonSound(stagedEmoticon);
      sendEmoticon(stagedEmoticon, take());
      setStagedEmoticon(null);
    }

    if (selection.drafts.length > 0) {
      sendMedia(selection.takeAll(), take());
    }

    if (text.trim()) {
      send(text, take());
    }

    setReplyTarget(null);
  }

  function handleEdited(draft: MediaDraft) {
    selection.replace(draft);
    setEditing(null);
  }

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
      case "pending": {
        const cells = toCellsFromDrafts(row.pending.media);

        return (
          <MessageRow
            text={row.pending.text}
            media={cells}
            emoticon={row.pending.emoticon}
            replyTo={row.pending.replyTo}
            progress={row.pending.progress}
            createdAt={row.pending.createdAt}
            sender={participantById.get(currentUserId)}
            isMine
            isFirstOfGroup={row.isFirstOfGroup}
            isLastOfGroup={row.isLastOfGroup}
            status={row.pending.status}
            replyToName={
              row.pending.replyTo
                ? participantById.get(row.pending.replyTo.senderId)?.name
                : undefined
            }
            onRetry={() => retry(row.pending.clientMsgId)}
            onCancel={() => cancel(row.pending.clientMsgId)}
          />
        );
      }
      case "message": {
        const cells = toCellsFromMedia(row.message.media);
        // INFO: REQUIREMENTS.md § 8.9. A deleted parent is still quoted, but there is nothing left to jump to — the row it named is out of every page.
        const quoted = row.message.replyTo;

        return (
          <MessageRow
            text={row.message.text}
            media={cells}
            emoticon={row.message.emoticon}
            replyTo={quoted}
            replyToName={quoted ? participantById.get(quoted.senderId)?.name : undefined}
            createdAt={row.message.createdAt}
            sender={participantById.get(row.message.senderId)}
            isMine={row.isMine}
            isFirstOfGroup={row.isFirstOfGroup}
            isLastOfGroup={row.isLastOfGroup}
            isRead={row.message.id === lastReadMineId}
            isHighlighted={row.message.id === highlightedId}
            status="sent"
            onOpenReply={
              quoted && !quoted.isDeleted ? () => void jumpToMessage(quoted.id) : undefined
            }
            onLongPress={() => setActionTarget(row.message)}
            onOpenMedia={(index) => setViewer({ cells, index })}
            onReply={() => stageReply(row.message)}
          />
        );
      }
    }
  }

  function buildActionItems(): ActionSheetItem[] {
    if (!actionTarget) {
      return [];
    }

    const target = actionTarget;
    // INFO: REQUIREMENTS.md § 8.9. First, and on the other person's messages as much as on my own — replying is the sheet's most-reached-for action, unlike copy.
    const items: ActionSheetItem[] = [
      { label: "답장", Icon: CornerUpLeft, onSelect: () => stageReply(target) },
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

  /**
   * INFO: REQUIREMENTS.md § 8.9. The quote is built here rather than fetched — the
   * message being replied to is already on screen, so the staged bar and the
   * optimistic bubble both draw from the row the user just pointed at.
   */
  function stageReply(message: ChatMessage) {
    setReplyTarget({
      senderId: message.senderId,
      kind: message.type,
      text: message.text?.slice(0, REPLY_PREVIEW_MAX_LENGTH) ?? null,
      thumbnailMediaId: message.media[0]?.id ?? null,
      isVideoOnly:
        message.media.length > 0 && message.media.every((item) => isVideoMime(item.mime)),
      isDeleted: false,
      id: message.id,
    });
  }

  /**
   * REQUIREMENTS.md § 8.6.1. Already-loaded targets skip the fetch — a quote commonly
   * points a few rows up.
   *
   * WARN: The scroll waits a frame. `loadAround` replaces the window, and Virtuoso
   * resolves an index against rows it has not been handed yet — asking it to scroll
   * inside this call stack lands on whatever the previous window held there.
   */
  async function jumpToMessage(id: number) {
    if (!messages.some((message) => message.id === id) && !(await loadAround(id))) {
      toast.error("원본 메시지를 찾지 못했어요");

      return;
    }

    requestAnimationFrame(() => {
      const index = rowsRef.current.findIndex(
        (row) => row.kind === "message" && row.message.id === id,
      );

      if (index < 0) {
        return;
      }

      // INFO: The plain data index, not `firstItemIndex + index` — that offset only reaches what `itemContent` and `computeItemKey` are handed.
      // WARN: Not `behavior: "smooth"`. A jump crosses an arbitrary distance, so smooth animates through history the user did not ask to see, and the window it is animating over was replaced a frame ago.
      listRef.current?.scrollToIndex({ index, align: "center" });
      setHighlightedId(id);
    });
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

/**
 * REQUIREMENTS.md § 8.8. The newest of my messages the other participant has read.
 *
 * INFO: Only that one carries 읽음 — every read bubble saying so repeats the same
 * fact once per row, and the newest one already implies all of them.
 */
function findLastReadMineId(
  messages: ChatMessage[],
  currentUserId: string,
  participants: Participant[],
): Nullable<number> {
  const other = participants.find((participant) => participant.id !== currentUserId);

  if (!other) {
    return null;
  }

  const readAt = Date.parse(other.lastReadAt);
  const read = messages.filter(
    (message) => message.senderId === currentUserId && Date.parse(message.createdAt) <= readAt,
  );

  return read.at(-1)?.id ?? null;
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
