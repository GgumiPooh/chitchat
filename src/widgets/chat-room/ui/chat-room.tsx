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
  useRecentEmoticons,
  useSendMessage,
} from "@/features/send-message";
import { useSetBackground } from "@/features/set-background";
import { useTypingSignal } from "@/features/typing-indicator";
import {
  MediaEditor,
  MediaPickerSheet,
  MediaTray,
  VideoTrimmer,
  useAttachmentEditing,
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
  composeEventNotice,
  useIsVirtualKeyboardOpen,
  useIsomorphicLayoutEffect,
  useSoundUnlock,
  useUnsentWork,
  warmLineHeights,
  type Nullable,
  type Optional,
} from "@/shared/lib";
import { MediaShareDialog, canShareText, shareText, useMediaShare } from "@/shared/share";
import {
  ActionSheet,
  Button,
  EmptyState,
  MediaViewer,
  Modal,
  toast,
  type ActionSheetItem,
  type MediaCell,
} from "@/shared/ui";
import { useQueryClient } from "@tanstack/react-query";
import { measureElement as measureRenderedElement, useVirtualizer } from "@tanstack/react-virtual";
import { Copy, CornerUpLeft, LoaderCircle, MessageCircle, Share, Trash2 } from "lucide-react";
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
  type RefObject,
  type TransitionEvent,
} from "react";
import { requestMessageDeletion } from "../api/request-message-deletion";
import { buildChatRows } from "../model/build-chat-rows";
import {
  ROW_LINE_CLASSES,
  estimateRowHeight,
  type PreviewReader,
} from "../model/estimate-row-height";
import { toLinkPreviewQuery } from "../model/link-preview-query";
import { playEmoticonSound } from "../model/play-emoticon-sound";
import { toCellsFromDrafts, toCellsFromMedia } from "../model/to-media-cells";
import type { ChatRow } from "../model/types";
import { useComposerClearance } from "../model/use-composer-clearance";
import { useLinkPreviewPrefetch } from "../model/use-link-preview-prefetch";
import { useMessageHistory } from "../model/use-message-history";
import { useSettledCommit } from "../model/use-settled-commit";
import { ChatBackdrop } from "./chat-backdrop";
import { DateDivider } from "./date-divider";
import { MessageRow } from "./message-row";
import { ReplyBar } from "./reply-bar";
import { ScrollToBottomPill } from "./scroll-to-bottom-pill";
import { SystemNotice } from "./system-notice";
import { TypingIndicator } from "./typing-indicator";

export type ChatRoomProps = {
  className?: string;
  currentUserId: string;
  initialMessages: ChatMessage[];
  /** REQUIREMENTS.md § 12.2. This user's own wallpaper; `null` leaves the room on the flat `chat-canvas`. */
  backgroundMediaId: Nullable<string>;
  /**
   * REQUIREMENTS.md § 8.6.1. A message the room is being told to move to, from
   * outside it. The token is what makes a repeat of the same id a fresh
   * instruction rather than no change at all.
   */
  jumpTarget?: Nullable<{ token: number; id: number }>;
  /**
   * REQUIREMENTS.md § 8.6.1. The open search's query, lit inside every bubble
   * that contains it — which is what marks a search jump, in place of the
   * quote jump's flash. A whole row washed in `primary-tint` says "here" and
   * nothing else; the mark says which words were matched, and it stays up
   * while the reader steps through the other hits.
   */
  searchQuery?: string;
  /**
   * Stands in the composer's place while it is set — the § 8.6. search nav.
   *
   * WARN: It goes inside the composer's own wrapper, not beside it.
   * `useComposerClearance` measures `container.bottom − composer.top` off that
   * box, so a bar mounted anywhere else would leave the history clearing a
   * composer that is not on screen.
   *
   * WARN: The composer it stands in for is **hidden, never unmounted**. The
   * draft is `MessageComposer`'s own state and never leaves it, so unmounting
   * throws away a typed-but-unsent message — silently, and along with the
   * `useUnsentWork` hold that stops § 15.1. reloading the tab over it.
   */
  bottomBar?: ReactNode;
};

// INFO: DESIGN.md § 6.7. The pill appears once the newest message is roughly this far away, and the same distance is what `scrollEndThreshold` treats as near enough to the end that a row re-measuring there should hold the end still rather than let it drift.
const AT_BOTTOM_THRESHOLD = 200;

// INFO: The loading header's own height (`h-10`), constant whether or not the skeleton is in it — a header that collapsed would move the list under the finger every time a page lands.
const LIST_HEADER_HEIGHT = 40;

// INFO: Rows here run from a 44px bubble to a 363px photo, so this is counted generously — eight of the tall ones is roughly the 600px of runway a flick covers before the next frame.
const OVERSCAN_ROWS = 8;

// INFO: REQUIREMENTS.md § 8.3. Upward paging fires once the scroller is this close to the top — far enough out that the fetch and the wait for a still scroller both fit before the reader arrives.
const LOAD_OLDER_THRESHOLD = 600;

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
  initialMessages,
  backgroundMediaId,
  jumpTarget,
  searchQuery,
  bottomBar,
}: ChatRoomProps) {
  const containerRef = useRef<Nullable<HTMLDivElement>>(null);
  const composerRef = useRef<Nullable<HTMLDivElement>>(null);
  // INFO: REQUIREMENTS.md § 8.12. Observed rather than derived from `typist`, because what has to be followed is every frame of the height transition, not the state change that started it.
  const typingSlotRef = useRef<Nullable<HTMLDivElement>>(null);
  const scrollerRef = useRef<Nullable<HTMLElement>>(null);
  const rowsRef = useRef<ChatRow[]>([]);
  const hasTakenScrollRef = useRef(false);
  // INFO: The tail the last pin answered to. An arrival moves it and a page of older history does not, which is the whole difference between following and holding still.
  const pinnedRowKeyRef = useRef<Optional<string>>(undefined);
  // INFO: REQUIREMENTS.md § 8.3. Where a chosen row sat in the viewport just before a page was inserted above it, so the same row can be put back there once it has.
  const prependAnchorRef = useRef<Nullable<{ key: string; viewportY: number }>>(null);
  // WARN: State, not just the ref beside it — the scroller mounts a render after this component does (an empty room renders no list at all), and the virtualizer has to re-read it when it appears.
  const [scroller, setScroller] = useState<Nullable<HTMLDivElement>>(null);
  // INFO: REQUIREMENTS.md § 8.3. The width every unmeasured row is wrapped against. It has to be state and not a `clientWidth` read at estimate time — a rotation changes it for thousands of offscreen rows at once, and nothing else in this component would notice.
  const [scrollerWidth, setScrollerWidth] = useState<Optional<number>>(undefined);
  const [isAtBottom, setIsAtBottom] = useState(true);
  const isAtBottomRef = useRef(true);
  const [isAtTop, setIsAtTop] = useState(true);
  const [actionTarget, setActionTarget] = useState<Nullable<ChatMessage>>(null);
  const [isPickerOpen, setIsPickerOpen] = useState(false);
  const [isEmoticonPickerOpen, setIsEmoticonPickerOpen] = useState(false);
  const { remember: rememberEmoticon } = useRecentEmoticons();
  const setBackground = useSetBackground();
  // INFO: The panel outlives its first open so the collapse has something to animate; until then it is not rendered at all, and a user who never opens it never fetches the packs.
  const [hasOpenedEmoticonPanel, setHasOpenedEmoticonPanel] = useState(false);
  // INFO: REQUIREMENTS.md § 13.6. Staged rather than sent on selection, so it can be sent with a line of text the way an attachment can.
  const [stagedEmoticon, setStagedEmoticon] = useState<Nullable<Emoticon>>(null);
  // INFO: REQUIREMENTS.md § 8.10. Not mutually exclusive with the two above — a quote is an attribute of the send, not a payload competing for the § 6. row.
  const [replyTarget, setReplyTarget] = useState<Nullable<ReplyPreview>>(null);
  // INFO: DESIGN.md § 6.8. The bubble a jump landed on, until its flash expires.
  const [highlightedId, setHighlightedId] = useState<Nullable<number>>(null);
  const [confirmingDeleteId, setConfirmingDeleteId] = useState<Nullable<number>>(null);
  // INFO: `deletableMessageId` is null for the other participant's attachments — mine carry the § 7.10. delete control, which is the same confirmed delete the § 8.11. sheet reaches.
  const [viewer, setViewer] =
    useState<Nullable<{ cells: MediaCell[]; index: number; deletableMessageId: Nullable<number> }>>(
      null,
    );
  // INFO: The newest id the user had in view when they last left the bottom — everything past it is what the § 6.7. pill counts.
  const [seenId, setSeenId] = useState(initialMessages.at(-1)?.id ?? 0);
  const {
    messages,
    isLoadingOlder,
    pendingOlder,
    hasNewer,
    loadOlder,
    commitPendingOlder,
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
  const editing = useAttachmentEditing(selection.replace);
  // INFO: REQUIREMENTS.md § 8.11. The same route the gallery's 저장 takes (§ 10.), asked for by 공유 rather than by 저장.
  const sharing = useMediaShare();
  const isKeyboardOpen = useIsVirtualKeyboardOpen();
  // INFO: REQUIREMENTS.md § 8.6. The composer's whole stack is put away for the length of a search, and everything it drives has to go with it.
  const isSearching = bottomBar !== undefined;
  // WARN: Belt to the field's own `onFieldFocus` braces, and derived rather than an effect that closes it — Android reopens the keyboard on a field that is already focused, which fires no `focus` event for the picker to hear.
  // WARN: `!isSearching` is load-bearing beyond the drawing. The panel being open is one of § 8.12.'s two sustained typing sources, so a panel left open behind the search goes on announcing 입력 중 — and it would pop back open on 취소.
  const isEmoticonPanelOpen = isEmoticonPickerOpen && !isKeyboardOpen && !isSearching;
  const { participants, typingUserIds, setIsReading } = useChatStream();
  // WARN: REQUIREMENTS.md § 8.12. Only the two *sustained* sources are passed; typing arrives as edit pulses through the returned callback, because a field holding a draft is not somebody typing. Sending is not a trigger either way — it clears both of these and produces no edit.
  // WARN: REQUIREMENTS.md § 8.12. Silent for the length of a search. A staged emoticon is state that outlives the hidden composer, so left connected it holds the signal up and re-POSTs every `TYPING_PING_INTERVAL` — the other participant reads 입력 중 from a composer that is not even on screen, which is exactly the parked-draft failure § 8.12. exists to have removed.
  const signalEdit = useTypingSignal(
    !isSearching && (isEmoticonPanelOpen || stagedEmoticon !== null),
  );
  const participantById = useMemo(
    () => new Map(participants.map((participant) => [participant.id, participant])),
    [participants],
  );
  // INFO: REQUIREMENTS.md § 1. Exactly two people, so the first id is the only id — a list of names would be answering a question this app cannot ask.
  const typist = typingUserIds.length > 0 ? (participantById.get(typingUserIds[0]) ?? null) : null;
  const rows = useMemo(
    () => buildChatRows({ messages, pending, currentUserId }),
    [messages, pending, currentUserId],
  );
  // INFO: REQUIREMENTS.md § 8.8. The cursor is the other participant's `last_read_at`, which the § 8.4. stream already keeps current — 읽음 lands without a request of its own.
  const lastReadMineId = useMemo(
    () => findLastReadMineId(messages, currentUserId, participants),
    [messages, currentUserId, participants],
  );
  const queryClient = useQueryClient();
  // INFO: REQUIREMENTS.md § 8.3. A cache read, never a subscription — this answers the row estimate below, which runs for rows that are nowhere near the DOM.
  const readPreview: PreviewReader = useCallback(
    (url) =>
      url ? (queryClient.getQueryData(toLinkPreviewQuery(url).queryKey) ?? undefined) : undefined,
    [queryClient],
  );
  // INFO: REQUIREMENTS.md § 8.3. Resolved off the surface the bubbles are drawn on, so the wrap estimate counts glyphs in the font they will actually be laid out in rather than in a ratio per glyph class.
  const estimateContext = useMemo(
    () => ({
      contentWidth: scrollerWidth,
      fontFamily: scroller ? getComputedStyle(scroller).fontFamily : "",
      readPreview,
      // INFO: REQUIREMENTS.md § 11.5. The same composition `SystemNotice` renders, so the estimate wraps the sentence the row will actually show.
      readNotice: (message: ChatMessage) =>
        composeEventNotice(
          message.systemAction,
          message.eventTitle,
          message.eventStartsAt,
          participantById.get(message.senderId)?.name,
        ),
      // INFO: REQUIREMENTS.md § 8.8. The same test `renderRow` uses, so the estimate knows the row has a column beside it.
      isRead: (message: ChatMessage) => message.id === lastReadMineId,
    }),
    [scroller, scrollerWidth, readPreview, participantById, lastReadMineId],
  );
  // WARN: Written during render rather than in an effect, and read through a ref rather than closed over. `getItemKey` has to be one stable function: virtual-core memoizes the whole measurement pass on its identity, and a fresh closure per render re-runs `estimateSize` for every row that is not currently mounted — thousands of canvas text layouts on every SSE tick. It also has to see *this* render's rows, which `rowsRef` is deliberately one commit behind on.
  const keyedRowsRef = useRef(rows);

  keyedRowsRef.current = rows;

  // WARN: Indexed defensively. `indexFromElement` answers `-1` for an element it finds no `data-index` on, and both the library's own `measureElement` and the override below hand that straight back here — `rows[-1].key` would throw out of the render phase and take the whole surface down where the library only meant to warn.
  const getItemKey = useCallback((index: number) => keyedRowsRef.current[index]?.key ?? index, []);
  // INFO: REQUIREMENTS.md § 8.3. Anchored to the end and keyed by row, which is what holds the viewport still across a prepend — the virtualizer re-finds the keyed row after the data changes and offsets the scroll by however far it moved.
  const virtualizer = useVirtualizer({
    count: rows.length,
    getScrollElement: () => scroller,
    // WARN: REQUIREMENTS.md § 8.3. Per row, never one flat guess. A row measured above the fold corrects the scroll by however far the estimate missed, and WebKit drops that correction mid-gesture — so the error of a flat estimate is drift the reader watches accumulate.
    estimateSize: (index) =>
      rows[index] ? estimateRowHeight(rows[index], estimateContext) : LIST_HEADER_HEIGHT,
    getItemKey,
    anchorTo: "end",
    // WARN: Never `followOnAppend`. It follows through `scrollToIndex`, which resolves against the measurements alone, and `ListFooter` is not one of them — so every arrival parked the newest message exactly `--chat-bottom-gap` low, which is to say behind the composer. `pinToBottom` takes the scroller's own maximum instead.
    scrollEndThreshold: AT_BOTTOM_THRESHOLD,
    // WARN: The list does not start at the top of the scroller — the loading header sits above it, and without this the virtualizer resolves every offset that much too high.
    scrollMargin: LIST_HEADER_HEIGHT,
    overscan: OVERSCAN_ROWS,
    /**
     * WARN: REQUIREMENTS.md § 8.3. The whole point is *not* measuring here. `virtualizer.measureElement` is a `ref`, so it runs in React's commit — and the default measures the DOM right there, which on a row whose estimate was wrong applies a scroll correction and asks for a synchronous re-render. React cannot flush mid-commit, so it warns and schedules instead: the correction lands, the rows that move with it land a frame later, and the two are briefly out of step.
     *
     * WARN: Returning what is already believed makes the delta zero, so the ref registers the element with the `ResizeObserver` and does nothing else. The observer's first delivery then measures it for real, outside any React phase, where the library's synchronous flush actually works.
     */
    measureElement: (element, entry, instance) => {
      const index = entry ? -1 : instance.indexFromElement(element);
      // INFO: The library already answers a cached size when it is handed no entry; the one case it reads the DOM for — and so the only case worth overriding — is a row it has never measured.
      const isFirstMount =
        index >= 0 && !instance.itemSizeCache.has(instance.options.getItemKey(index));

      return isFirstMount
        ? instance.options.estimateSize(index)
        : measureRenderedElement(element, entry, instance);
    },
  });

  // WARN: Replaces the default, which refuses to compensate a *re*-measure taken while the scroll direction is `backward`. Reading back through history is exactly that, and a § 8.9. link card resolving above the fold then shoves everything below it down by the card's own height. A row that is entirely above the fold has to be compensated whichever way the finger was moving; one that still spans it grew below the anchor and must not be.
  virtualizer.shouldAdjustScrollPositionOnItemSizeChange = (item, _delta, instance) => {
    // INFO: The offset the virtualizer is scrolling *to*, not the one the scroller is at — a correction already queued this tick is in `scrollAdjustments` and has yet to reach the DOM.
    const fold = (instance.scrollOffset ?? 0) + instance.scrollAdjustments;

    // INFO: An unmeasured row is the estimate→actual correction, and the whole estimated block sat above the fold — that one is compensated from its start, as the library's own first-measure branch does.
    return instance.itemSizeCache.has(item.key) ? item.end <= fold : item.start < fold;
  };

  if (isEmoticonPanelOpen && !hasOpenedEmoticonPanel) {
    setHasOpenedEmoticonPanel(true);
  }

  // INFO: My own send is not a new message to me — counting it flashes `새 메시지 1` on the pill for my own bubble.
  // WARN: REQUIREMENTS.md § 8.6.1. Silent while the window is parked away from the live edge. `messages` is then a slice of history rather than the newest page, and every row in it that happens to outrank `seenId` would be counted as an arrival — stepping from an older search hit to a newer one replaces the window with 30 such rows and the pill announces `새 메시지 30` for messages from last month. Nothing in a jumped window is news, and the pill is already visible there for the other reason: it is the way back.
  const unseenCount =
    isAtBottom || hasNewer
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
    isSending ||
      selection.drafts.length > 0 ||
      stagedEmoticon !== null ||
      replyTarget !== null ||
      // INFO: A trim being read back is unsent work too — the trimmed file exists only in memory until `replace` lands, so a § 15.1. reload during the decode discards it.
      editing.isApplying,
  );

  /**
   * REQUIREMENTS.md § 8.3. The newest message parked directly above the composer,
   * which is what every follow in this room means by "the bottom".
   *
   * WARN: The scroller's own maximum, never `scrollToIndex`. The list's trailing spacer already _is_ the composer's clearance, while an index resolves against the measurements alone — and `ListFooter` is not one of them, so it stops a whole spacer short.
   */
  const pinToBottom = useCallback(() => {
    const element = scrollerRef.current;

    if (element) {
      element.scrollTop = element.scrollHeight;
    }
  }, []);

  useComposerClearance({ containerRef, composerRef, scrollerRef, isAtBottomRef });

  /**
   * REQUIREMENTS.md § 8.12. Holds the reader at the bottom while the 입력 중 slot
   * opens and closes underneath them, frame by frame — the same job
   * `useComposerClearance` does for the composer's own growth.
   */
  useEffect(() => {
    const slot = typingSlotRef.current;

    if (!slot) {
      return;
    }

    const observer = new ResizeObserver(([entry]) => {
      const scroller = scrollerRef.current;

      if (!scroller) {
        return;
      }

      // WARN: The threshold is the slot's *own* height, and that is what makes this self-limiting: being within it of the bottom is exactly the condition of having been at the bottom before this frame grew. A fixed epsilon would lose the follow on the first frame; a loose one would yank a reader who had deliberately scrolled up.
      const distance = scroller.scrollHeight - scroller.scrollTop - scroller.clientHeight;

      if (distance <= entry.contentRect.height + 1) {
        scroller.scrollTop = scroller.scrollHeight;
      }
    });

    observer.observe(slot);

    return () => observer.disconnect();
  }, []);

  // INFO: REQUIREMENTS.md § 8.3., § 8.9. Ahead of the viewport, so a § 6.9. card is in the row's first measurement rather than growing it once the reader is already on it — and ahead of the insert too, since a held page's rows have not been measured at all yet.
  useLinkPreviewPrefetch(messages, pendingOlder);

  /**
   * REQUIREMENTS.md § 8.3. Inserts the held page, having first written down where the
   * reader was, so the effect below can put them back.
   *
   * WARN: The anchor is the first row that is **not** a date divider, never `rows[0]`. A page of older messages from the same day leaves the divider at index 0 with the same key and the same offset, so the virtualizer's own anchor resolves it as "nothing moved" and the whole page lands as drift — which strands the scroller at the top, where it asks for the next page, and the room walks backwards through history a page at a time.
   */
  const insertOlder = useCallback(() => {
    // WARN: `useSettledCommit` listens for every settle, not only the ones a page is waiting on, so without this the anchor is rewritten each time the reader stops scrolling — and the next unrelated `rows` change (an arrival, a send, a delete) restores them to wherever they last paused.
    if (pendingOlder.length === 0) {
      return;
    }

    const element = scrollerRef.current;
    const index = rowsRef.current.findIndex((row) => row.kind !== "date");
    const measurement = index < 0 ? undefined : virtualizer.measurementsCache[index];

    if (element && measurement) {
      prependAnchorRef.current = {
        key: rowsRef.current[index].key,
        viewportY: measurement.start - element.scrollTop,
      };
    }

    commitPendingOlder();
  }, [pendingOlder, commitPendingOlder, virtualizer]);

  // INFO: REQUIREMENTS.md § 8.3. The page `loadOlder` fetched goes in here, once the list has gone still enough for the scroll correction it needs to survive.
  useSettledCommit({ scroller, isPending: pendingOlder.length > 0, onSettled: insertOlder });

  // INFO: REQUIREMENTS.md § 13.6. An arriving emoticon plays by itself, and no gesture of its own is coming — the room borrows the first one the user makes anywhere on the page.
  useSoundUnlock();

  // INFO: REQUIREMENTS.md § 8.4. The connection belongs to the shell; this screen only asks to hear from it.
  useChatStreamListener({ onMessage: receiveMessage, onResume: catchUp });

  // INFO: REQUIREMENTS.md § 8.8. The conversation is on screen for as long as this is mounted, which is what suppresses the badge and moves the read cursor.
  useEffect(() => {
    setIsReading(true);

    return () => setIsReading(false);
  }, [setIsReading]);

  // INFO: DESIGN.md § 6.7. The same target `pinToBottom` takes, animated — the pill is a journey back to the live edge that the user asked for, not a pin.
  const scrollToBottom = useCallback(() => {
    scrollerRef.current?.scrollTo({ top: scrollerRef.current.scrollHeight, behavior: "smooth" });
  }, []);

  /** REQUIREMENTS.md § 8.6.1. The § 6.7. pill is also the way back from a jump, so it restores the window before it scrolls. */
  const goToNewest = useCallback(async () => {
    await returnToLive();
    scrollToBottom();
  }, [returnToLive, scrollToBottom]);

  // WARN: Scrolling inside the send handler resolves against the pre-send data, so a message sent from deep in history lands below the fold. The row only exists from this commit onward.
  // WARN: REQUIREMENTS.md § 13.6. A pin and never `scrollToBottom` — a smooth scroll started here outlives the emoticon panel's collapse and steers the history back to the offset the open panel implied.
  useEffect(() => {
    if (pendingCount > lastPendingCount.current) {
      pinToBottom();
    }

    lastPendingCount.current = pendingCount;
  }, [pendingCount, pinToBottom]);

  // WARN: REQUIREMENTS.md § 8.6.1. The jump reads the rows back through this rather than through the closure it was called in — `loadAround` replaces the window, and the array the handler captured predates it.
  useEffect(() => {
    rowsRef.current = rows;
  }, [rows]);

  // INFO: Flags only — the rows that just landed changed both distances, and nothing scrolled to say so.
  useEffect(() => {
    readScrollEdges();
  });

  // WARN: A landed page moves no finger, so it fires no `scroll` of its own. Keyed on the load finishing rather than on every render, so a user parked at the top pages one at a time instead of once per commit.
  useEffect(() => {
    if (!isLoadingOlder) {
      requestAdjacentPages();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isLoadingOlder]);

  /**
   * WARN: `anchorTo: "end"` keeps the viewport at the end once it is there; it does
   * not put it there. On mount every row is still `ESTIMATED_ROW_HEIGHT`, so a
   * single `scrollToEnd()` lands on an end that the first measurement then moves —
   * the room is re-parked on each size change until the rows have real heights.
   *
   * WARN: Gated on the gesture flag, never on the at-bottom one — `syncScrollEdges` runs first and has already read the pre-park position as "not at bottom", so this would never fire.
   *
   * WARN: A layout effect, never a passive one. Passive runs after paint, so the room's first frame would be the top of the loaded window rather than the newest message — and the two effects above it, which are passive, would read that pre-park position: the § 6.7. pill would flash and `requestAdjacentPages` would see `scrollTop === 0` and fetch a page of history nobody asked for on every open.
   */
  useIsomorphicLayoutEffect(() => {
    const element = scrollerRef.current;

    if (!element || hasTakenScrollRef.current) {
      return;
    }

    // WARN: Unconditional, not gated on the total size changing — that is read during render, a layout before the rows it grew for are on screen, so gating on it stops one measurement short of the newest message.
    element.scrollTop = element.scrollHeight;
  });

  /**
   * REQUIREMENTS.md § 8.3. Puts the reader back on the row `insertOlder` wrote down,
   * now that the page is in front of it.
   *
   * WARN: An absolute target, never a delta. Whether the virtualizer already corrected the scroll depends on which row its own anchor happened to resolve to, and restoring the recorded row to the offset it was recorded at is the same answer either way — so this cannot double-apply.
   */
  useIsomorphicLayoutEffect(() => {
    const anchor = prependAnchorRef.current;
    const element = scrollerRef.current;

    if (!anchor || !element) {
      return;
    }

    prependAnchorRef.current = null;

    const index = rows.findIndex((row) => row.key === anchor.key);
    const measurement = index < 0 ? undefined : virtualizer.measurementsCache[index];

    if (measurement) {
      element.scrollTop = measurement.start - anchor.viewportY;
    }
  }, [rows, virtualizer]);

  /**
   * REQUIREMENTS.md § 8.3. The follow the virtualizer cannot do for itself: the
   * scroller's own maximum, which is the newest message parked on the composer,
   * rather than an index resolved against measurements the trailing spacer is not in.
   *
   * WARN: Keyed on the last row, never on the count — a page of older history changes the count too, and it must move the viewport by nothing at all, which is what `anchorTo: "end"` is holding still.
   */
  useEffect(() => {
    const previousKey = pinnedRowKeyRef.current;
    const lastKey = rows.at(-1)?.key;

    pinnedRowKeyRef.current = lastKey;

    if (previousKey === undefined || previousKey === lastKey) {
      return;
    }

    // INFO: The previous tail is still in the list exactly when this was an append. A § 8.6.1. jump or a return to live replaces the window instead, and both scroll themselves.
    // WARN: `isAtBottomRef` still holds the position from before this commit, which is the question being asked — was the user at the live edge when the message landed.
    if (isAtBottomRef.current && rows.some((row) => row.key === previousKey)) {
      pinToBottom();
    }
  }, [rows, pinToBottom]);

  /**
   * REQUIREMENTS.md § 8.3. Republishes the width the row estimate wraps against.
   *
   * WARN: A rotation resizes the scroller without changing a single thing this component renders from, so nothing else here would ever notice — and every row not currently mounted would keep being wrapped against the old width until it was measured.
   */
  useIsomorphicLayoutEffect(() => {
    if (!scroller) {
      return;
    }

    // INFO: REQUIREMENTS.md § 8.3. Here rather than from the estimate itself, so the probe's reflow never lands in a render pass.
    warmLineHeights(ROW_LINE_CLASSES);
    setScrollerWidth(scroller.clientWidth);

    const observer = new ResizeObserver(() => setScrollerWidth(scroller.clientWidth));

    observer.observe(scroller);

    return () => observer.disconnect();
  }, [scroller]);

  // INFO: A real gesture, not a `scroll` event — the parking above scrolls too, and only the user reaching for the history should end it.
  useEffect(() => {
    if (!scroller) {
      return;
    }

    const takeScroll = () => {
      hasTakenScrollRef.current = true;
    };

    scroller.addEventListener("wheel", takeScroll, { passive: true });
    scroller.addEventListener("touchstart", takeScroll, { passive: true });
    scroller.addEventListener("keydown", takeScroll);

    return () => {
      scroller.removeEventListener("wheel", takeScroll);
      scroller.removeEventListener("touchstart", takeScroll);
      scroller.removeEventListener("keydown", takeScroll);
    };
  }, [scroller]);

  /**
   * REQUIREMENTS.md § 8.6.1. A result the § 8.6. search picked, run through the
   * same jump a quote takes.
   *
   * WARN: Keyed on the token, never on the id. Re-picking the row the room is
   * already parked on has to flash it again — keyed on the id that would be no
   * change at all, and the tap would read as having done nothing.
   */
  useEffect(() => {
    if (jumpTarget) {
      // INFO: A search jump is marked by the § 8.6. mark inside the bubble, so it takes no flash on top of it.
      void jumpToMessage(jumpTarget.id, { flash: false });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [jumpTarget?.token]);

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
      {backgroundMediaId && <ChatBackdrop mediaId={backgroundMediaId} />}
      {rows.length === 0 ? (
        <>
          <div className="absolute inset-0 flex items-center justify-center p-md pb-(--chat-bottom-gap)">
            <EmptyState Icon={MessageCircle} description="아직 주고받은 메시지가 없어요" />
          </div>
          {/* INFO: REQUIREMENTS.md § 8.12. An empty room renders no scroller for the indicator to sit in, and this is exactly when it matters most — the other person composing the conversation's first message. Positioned where that message will land. */}
          {typist && (
            <TypingIndicator
              className="absolute inset-x-0 bottom-(--chat-bottom-gap)"
              typist={typist}
            />
          )}
        </>
      ) : (
        <>
          {/* WARN: The absolute box is what gives the scroller a height. It is `height: 100%`, and a `flex-1` parent is not a definite height for that to resolve against — the list would measure a zero-height viewport and render nothing. */}
          <div className="absolute inset-0">
            <div
              ref={captureScroller}
              // INFO: The fade edges are the scroll affordance here (§ 6.1.); a bar on top of them would sit over the bubbles and cut through the floating composer.
              // WARN: `overflow-x: clip`, not `hidden` — the § 8.10. pull translates a row past the shell edge on a narrow screen, and `hidden` on a scroller that already scrolls vertically would make that a real horizontal scroll offset.
              className="scrollbar-hidden h-full overflow-x-clip overflow-y-auto"
              style={{ maskImage: buildScrollFadeMask() }}
              onScroll={syncScrollEdges}
            >
              <ListHeader isLoadingOlder={isLoadingOlder} />
              {/* INFO: `getTotalSize()` already nets off `scrollMargin`, so this is the rows' own height and the header above it is not counted twice. The row offsets do not — hence the subtraction on each `translateY` below. */}
              {/* WARN: Left off until the scroller exists, which is the one thing here the server cannot agree on. The estimate this resolves to is measured off the page (`measureLineHeight`), so the server computes it from literals and the browser from real layout — rendering that difference into an attribute is a hydration mismatch. No scroller also means no rows, so there is nothing for a height to hold up yet. */}
              <div
                className="relative w-full"
                style={{ height: scroller ? virtualizer.getTotalSize() : undefined }}
              >
                {virtualizer.getVirtualItems().map((item) => (
                  <div
                    key={item.key}
                    ref={virtualizer.measureElement}
                    className="absolute top-0 left-0 w-full"
                    data-index={item.index}
                    style={{
                      transform: `translateY(${item.start - virtualizer.options.scrollMargin}px)`,
                    }}
                  >
                    {renderRow(rows[item.index])}
                  </div>
                ))}
              </div>
              <ListFooter slotRef={typingSlotRef} typist={typist} />
            </div>
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
        {bottomBar}
        {/* WARN: REQUIREMENTS.md § 8.6. The whole stack goes while a search is open, not just the field — a reply bar or an attachment tray left standing would be composing a message the screen offers no way to send. */}
        {/* WARN: `hidden`, never a conditional subtree. `MessageComposer` holds the draft in its own state, so unmounting it here silently discards a typed message and drops its `useUnsentWork` hold with it. `display: none` takes it out of the wrapper's height, which is all `useComposerClearance` reads. */}
        <div className={cn(isSearching && "hidden")} inert={isSearching}>
          <>
            {/* INFO: REQUIREMENTS.md § 8.10. Above the tray and the pill, and in the flow — the quote belongs to the send the whole stack is composing, so it reads as the header of it. */}
            {/* WARN: DESIGN.md § 6.6. `mt-xs` matches the emoticon panel's, which is the gap this stack is measured against — without it the bar butts straight into the bubble above. It is safe to carry unconditionally because this renders nothing when there is no reply, so the clearance only grows while the bar is up. */}
            {replyTarget && (
              <ReplyBar
                className="mx-md mt-xs mb-2xs"
                replyTo={replyTarget}
                name={participantById.get(replyTarget.senderId)?.name}
                onCancel={() => setReplyTarget(null)}
              />
            )}
            {/* INFO: DESIGN.md § 6.6. Same gap as the bar above and the panel below; `MediaTray` renders nothing with an empty selection, so this costs the resting composer no height. */}
            <MediaTray
              className="mx-md mt-xs mb-2xs"
              drafts={selection.drafts}
              isReading={selection.isReading}
              onEdit={editing.open}
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
              onTransitionEnd={settleAfterPanelTransition}
            >
              {hasOpenedEmoticonPanel && (
                // INFO: § 13.6. `mt-xs` matches the composer's own top padding, so the panel clears the history by what the bar alone clears it by. The height above is this panel plus both margins.
                // WARN: `shrink-0` or the collapsing strip compresses the panel instead of clipping it, and § 13.6.'s own `flex-1` scroller is what gives — the panel then reads as stretching open rather than rising.
                // INFO: § 13.6. Promoted to its own layer so the strip's growing clip is a compositor crop — unpromoted, every frame of the 200ms repaints a grid of animated images against a moving clip rect, which is what the open stutters on.
                <EmoticonPicker
                  className="mx-md mt-xs mb-2xs shrink-0 will-change-transform"
                  onSelect={stageEmoticon}
                  onQuickSend={sendStagedEmoticon}
                />
              )}
            </div>
            <MessageComposer
              hasAttachments={selection.drafts.length > 0 || stagedEmoticon !== null}
              isEmoticonPickerOpen={isEmoticonPanelOpen}
              onAttach={() => setIsPickerOpen(true)}
              onEdit={signalEdit}
              onFieldFocus={() => setIsEmoticonPickerOpen(false)}
              // WARN: Toggled against what is on screen, not the flag behind it. The flag can be true while the keyboard suppresses the panel (§ 13.6.), and inverting it there closes a panel the user is asking to open.
              onToggleEmoticons={() => setIsEmoticonPickerOpen(!isEmoticonPanelOpen)}
              onSend={submit}
            />
          </>
        </div>
      </div>
      <ActionSheet
        isOpen={actionTarget !== null}
        items={buildActionItems()}
        header={{ title: "메시지" }}
        onClose={() => setActionTarget(null)}
      />
      <MediaShareDialog
        progress={sharing.progress}
        blockedCount={sharing.blockedCount}
        blockedIntent={sharing.blockedIntent}
        onRetry={() => void sharing.retryBlocked()}
        onDismiss={sharing.dismissBlocked}
      />
      <Modal
        isOpen={confirmingDeleteId !== null}
        header={{
          title: "이 메시지를 삭제할까요?",
          // INFO: The one thing the viewer cannot show — REQUIREMENTS.md § 6. makes a bubble one row, so the other attachments in it go with the one on screen.
          description: "말풍선에 담긴 사진과 동영상이 모두 사라져요",
        }}
        onClose={() => setConfirmingDeleteId(null)}
      >
        {/* WARN: `flex-1` on both — `Button` is `w-full shrink-0`, so a bare pair in a row would push the second one off the modal. */}
        <div className="flex gap-xs">
          <Button
            className="flex-1"
            variant="secondary"
            onClick={() => setConfirmingDeleteId(null)}
          >
            취소
          </Button>
          <Button className="flex-1" variant="destructive" onClick={confirmMediaDelete}>
            삭제
          </Button>
        </div>
      </Modal>
      <MediaPickerSheet
        isOpen={isPickerOpen}
        onClose={() => setIsPickerOpen(false)}
        onSelect={(files) => void stageMedia(files)}
      />
      {editing.cropping && (
        // WARN: Keyed by draft — `MediaEditor` mints its source object URL once per mount, so editing a second photo must be a second mount.
        <MediaEditor
          key={editing.cropping.id}
          draft={editing.cropping}
          onCancel={editing.close}
          onDone={editing.applyCrop}
        />
      )}
      {editing.trimming && renderTrimmer(editing.trimming)}
      {viewer && (
        <MediaViewer
          cells={viewer.cells}
          initialIndex={viewer.index}
          onClose={() => setViewer(null)}
          onDelete={buildViewerDelete(viewer.deletableMessageId)}
          onShare={(mediaId) => void sharing.share([mediaId])}
          onSave={(mediaId) => void sharing.save([mediaId])}
          onSetBackground={setBackground.open}
        />
      )}
      {/* INFO: REQUIREMENTS.md § 12.1. Mounted outside the viewer conditional above, so dismissing the viewer cannot unmount the sheet mid-write — `useSetBackground` returns the two halves separately for exactly this. */}
      {setBackground.sheet}
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

  /**
   * INFO: REQUIREMENTS.md § 13.6. A double tap in the picker skips the preview. The first tap already staged it, so this only takes it back off the composer and sends.
   */
  function sendStagedEmoticon(emoticon: Emoticon) {
    // INFO: REQUIREMENTS.md § 8.6.1. A send from a jumped-away window has to land somewhere the sender can see it, and the only place that is true is the live edge.
    if (hasNewer) {
      void returnToLive();
    }

    setStagedEmoticon(null);
    // WARN: REQUIREMENTS.md § 13.6. Synchronously inside the tap, like `submit` — iOS grants audio to this call stack alone.
    playEmoticonSound(emoticon);
    rememberEmoticon(emoticon.id);
    sendEmoticon(emoticon, replyTarget);
    setReplyTarget(null);
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

    // WARN: REQUIREMENTS.md § 8.10. Consumed by the first bubble only. Emoticon, then attachments, then text is the order they are queued in, and a quote repeated over three of them says the same thing three times.
    let quote = replyTarget;

    const take = () => {
      const taken = quote;

      quote = null;

      return taken;
    };

    if (stagedEmoticon) {
      // WARN: REQUIREMENTS.md § 13.6. Here rather than on the echo, and synchronously inside the tap — the send is the moment KakaoTalk sounds, and iOS grants audio to this call stack alone.
      playEmoticonSound(stagedEmoticon);
      // INFO: REQUIREMENTS.md § 13.6. 최근 사용 is recorded here rather than at the pick, so an emoticon staged and then abandoned never enters the list.
      rememberEmoticon(stagedEmoticon.id);
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

  // INFO: The draft is bound here rather than read back inside the callback — `applyTrim` clears `editing.trimming`, so a callback reading it again would be handed `null`.
  function renderTrimmer(source: MediaDraft) {
    return (
      // INFO: No `maxDurationMs` — an attachment has no length cap (§ 9.), so both handles move and trimming is an edit rather than a requirement.
      <VideoTrimmer
        key={source.id}
        draft={source}
        onCancel={editing.close}
        onDone={(file) => void editing.applyTrim(source, file)}
      />
    );
  }

  /**
   * REQUIREMENTS.md § 13.6. The last word on where the history sits, after the
   * strip has stopped moving.
   *
   * WARN: The per-frame pin `useComposerClearance` makes is not enough on its own — the collapse starts under the finger still on the toggle, and WebKit hands the scroll offset to the compositor for the length of that gesture. The transition ending is the one moment the strip's height is final and nothing else is moving.
   */
  function settleAfterPanelTransition(event: TransitionEvent<HTMLDivElement>) {
    // WARN: `transitionend` bubbles, so the panel's own transitions reach this too.
    if (event.target !== event.currentTarget || event.propertyName !== "height") {
      return;
    }

    if (isAtBottomRef.current) {
      pinToBottom();
    }
  }

  function captureScroller(element: Nullable<HTMLDivElement>) {
    scrollerRef.current = element;
    setScroller(element);
  }

  /**
   * The virtualizer is headless and reports no edges of its own, so upward paging
   * (§ 8.3.), downward paging (§ 8.6.1.) and the § 6.7. pill's at-bottom flag are
   * all read straight off the scroller here.
   *
   * WARN: Also called when the content changes, not only on scroll — a page that lands while the finger is still produces no scroll event of its own, and the room would sit at the top with nothing asking for the next one.
   */
  function syncScrollEdges() {
    readScrollEdges();
    requestAdjacentPages();
  }

  /** The § 6.7. pill's at-bottom flag and the § 7.12. top fade, both read straight off the scroller. */
  function readScrollEdges() {
    const element = scrollerRef.current;

    if (!element) {
      return;
    }

    const distanceToEnd = element.scrollHeight - element.scrollTop - element.clientHeight;
    const atBottom = distanceToEnd <= AT_BOTTOM_THRESHOLD;

    if (atBottom !== isAtBottomRef.current) {
      handleAtBottomChange(atBottom);
    }

    setIsAtTop(element.scrollTop <= 0);
  }

  /**
   * WARN: Never call this from a render-scoped effect. Both loads commit messages, which renders, which would ask again — one page per render rather than one per landed page, and the room pages itself to the start of history with the main thread pinned the whole way.
   */
  function requestAdjacentPages() {
    const element = scrollerRef.current;

    if (!element) {
      return;
    }

    if (element.scrollTop <= LOAD_OLDER_THRESHOLD) {
      void loadOlder();
    }

    // INFO: REQUIREMENTS.md § 8.6.1. Downward paging exists for the jumped-away window alone; at the live edge `loadNewer` returns immediately.
    if (element.scrollHeight - element.scrollTop - element.clientHeight <= AT_BOTTOM_THRESHOLD) {
      void loadNewer();
    }
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
        // INFO: REQUIREMENTS.md § 8.10. A deleted parent is still quoted, but there is nothing left to jump to — the row it named is out of every page.
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
            searchQuery={searchQuery}
            status="sent"
            onOpenReply={
              quoted && !quoted.isDeleted
                ? () => void jumpToMessage(quoted.id, { flash: true })
                : undefined
            }
            onOpenMedia={(index) =>
              setViewer({
                cells,
                index,
                deletableMessageId: row.isMine ? row.message.id : null,
              })
            }
            onShare={
              canShareMessage(row.message) ? () => void shareMessage(row.message) : undefined
            }
            onLongPress={() => setActionTarget(row.message)}
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
    // INFO: REQUIREMENTS.md § 8.10. First, and on the other person's messages as much as on my own — replying is the sheet's most-reached-for action, unlike copy.
    const items: ActionSheetItem[] = [
      { label: "답장", Icon: CornerUpLeft, onSelect: () => stageReply(target) },
    ];

    if (target.text) {
      items.push({ label: "복사", Icon: Copy, onSelect: () => void copyText(target.text ?? "") });
    }

    if (canShareMessage(target)) {
      items.push({ label: "공유", Icon: Share, onSelect: () => void shareMessage(target) });
    }

    if (target.senderId === currentUserId) {
      items.push({
        label: "삭제",
        Icon: Trash2,
        variant: "destructive",
        // INFO: DESIGN.md § 7.10. An attachment bubble is confirmed, wherever the delete was reached from — one row is every photo in it (§ 6.), which is the one thing neither the sheet nor the viewer shows.
        onSelect: () =>
          target.media.length > 0
            ? setConfirmingDeleteId(target.id)
            : void deleteMessage(target.id),
      });
    }

    return items;
  }

  /**
   * INFO: REQUIREMENTS.md § 8.10. The quote is built here rather than fetched — the
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
   * WARN: The scroll waits a frame. `loadAround` replaces the window, and the
   * virtualizer only takes the new rows on the render that follows — asking it to
   * scroll inside this call stack resolves the index against measurements the
   * previous window left behind, and lands on whatever was at that offset.
   */
  async function jumpToMessage(id: number, { flash }: { flash: boolean }) {
    if (!messages.some((message) => message.id === id)) {
      const outcome = await loadAround(id);

      // WARN: Only `missing` is a failure to report. `superseded` means a later jump has already taken the window — the ordinary result of pressing § 8.6.1.'s arrows twice — and the user is watching that jump land while this one apologises for it.
      if (outcome === "missing") {
        toast.error("원본 메시지를 찾지 못했어요");
      }

      if (outcome !== "ok") {
        return;
      }
    }

    // WARN: The open parks the room on the newest message after *every* render until a real gesture takes the scroll (§ 8.3.), and a jump is not one — so without this the park runs on the very next commit and drags the reader straight back to the live edge. A search reaches this on a screen nobody has scrolled at all: open, type, jump.
    hasTakenScrollRef.current = true;

    requestAnimationFrame(() => {
      const index = rowsRef.current.findIndex(
        (row) => row.kind === "message" && row.message.id === id,
      );

      if (index < 0) {
        return;
      }

      // WARN: Not `behavior: "smooth"`. A jump crosses an arbitrary distance, so smooth animates through history the user did not ask to see, and the window it is animating over was replaced a frame ago.
      virtualizer.scrollToIndex(index, { align: "center" });

      // WARN: DESIGN.md § 6.8. A property of the jump, never of whether a search happens to be open. The flash is for a jump with nothing else to point at — a quote, whose parent need not contain the query, so keying this on the search being open leaves such a jump marked by nothing at all.
      if (flash) {
        setHighlightedId(id);
      }
    });
  }

  /**
   * REQUIREMENTS.md § 8.11. Attachments go to the OS as files — which is what puts a
   * received photo in the iOS photo library — and a text message as its text. An
   * emoticon is neither: it is a pack item rather than something the sender sent.
   */
  function canShareMessage(message: ChatMessage): boolean {
    return message.media.length > 0 || (message.text !== null && message.text.length > 0);
  }

  /**
   * WARN: Nothing is awaited before `navigator.share` on the text path. iOS spends the
   * tap's transient activation on the first `await`, and text needs no buffering — so
   * the one case that could reach the sheet directly does.
   */
  async function shareMessage(message: ChatMessage) {
    if (message.media.length > 0) {
      await sharing.share(message.media.map((item) => item.id));

      return;
    }

    const text = message.text ?? "";

    // WARN: A refusal falls back the same way a missing `navigator.share` does. The files path answers a spent activation with the § 8.11. retry dialog, but there is nothing buffered here to hold for a second tap — the clipboard is what is left, and it is the same recovery the sheet's own 복사 would have been.
    if (!canShareText() || (await shareText(text)) === "blocked") {
      await copyText(text);
    }
  }

  async function copyText(text: string) {
    try {
      await navigator.clipboard.writeText(text);
      toast.success("메시지를 복사했어요");
    } catch {
      toast.error("메시지를 복사하지 못했어요");
    }
  }

  function buildViewerDelete(messageId: Nullable<number>) {
    // INFO: DESIGN.md § 7.10. The control sits beside a per-slide 원본 저장, so the reach of one tap is not obvious from where it is.
    return messageId === null ? undefined : () => setConfirmingDeleteId(messageId);
  }

  // WARN: Closes the viewer unconditionally. The same confirmation answers for the § 8.11. sheet, where there is no viewer open to close.
  function confirmMediaDelete() {
    if (confirmingDeleteId !== null) {
      void deleteMessage(confirmingDeleteId);
    }

    setConfirmingDeleteId(null);
    setViewer(null);
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
    // WARN: § 8.6.1. Never from a jumped-away window. Its newest row is somewhere in the past, so writing it here walks the mark backwards, and everything the reader had already seen between there and the live edge counts as unseen the moment they return.
    if (!atBottom && !hasNewer) {
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
// WARN: A constant `h-10`, matching `LIST_HEADER_HEIGHT`. The skeleton comes and goes inside it rather than sizing it, so a page landing never moves the rows below it.
function ListHeader({ isLoadingOlder }: { isLoadingOlder: boolean }) {
  return (
    <div className="flex h-10 items-center justify-center">
      {/* INFO: DESIGN.md § 7.8. A spinner and not a skeleton: a skeleton stands in for the shape of what is coming, and nothing here is message-shaped. It also outlasts its fetch — the page is held until the scroller settles (REQUIREMENTS.md § 8.3.) — and § 7.8. is explicit that a skeleton left pulsing reads as a hung screen. */}
      {isLoadingOlder && <LoaderCircle className="size-4 animate-spin text-meta-soft" />}
    </div>
  );
}

type ListFooterProps = {
  slotRef: RefObject<Nullable<HTMLDivElement>>;
  typist: Nullable<Participant>;
};

// INFO: DESIGN.md § 3.5. The trailing space the floating bars need, plus the § 8.12. 입력 중 slot standing on top of it. Both are the list's own content, so scrolling to the bottom parks the newest message just above the composer instead of behind it.
function ListFooter({ slotRef, typist }: ListFooterProps) {
  return (
    <>
      {/* WARN: REQUIREMENTS.md § 8.12. It sits *above* the spacer below, never inside it. That spacer is the strip the composer covers (`useComposerClearance` measures exactly `container.bottom − composer.top`), so anything placed in it is behind the bar by construction. */}
      {/* WARN: § 13.6. A real `height` and never a `0fr`→`1fr` grid track, for the reason the emoticon strip carries: mid-transition Chrome sizes such a track's container taller than the track it resolved. */}
      {/* INFO: The transition is also what makes the growth safe. Mounted outright, the row appeared and vanished in one frame and the end of the list lurched under anyone following it; opened over 200ms with the scroller re-pinned each frame, the conversation is simply pushed up. */}
      <div
        ref={slotRef}
        className={cn(
          "relative overflow-hidden transition-[height] duration-200 ease-out",
          typist ? "h-(--typing-indicator-height)" : "h-0",
        )}
      >
        {/* INFO: Anchored to the bottom so it is revealed rising from behind the composer rather than unrolling downward, exactly as § 13.6.'s panel is. */}
        {typist && <TypingIndicator className="absolute inset-x-0 bottom-0" typist={typist} />}
      </div>
      <div className="h-(--chat-bottom-gap)" />
    </>
  );
}
