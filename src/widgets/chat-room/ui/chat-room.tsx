"use client";

import type { Emoticon } from "@/entities/emoticon";
import type { MediaDraft } from "@/entities/media";
import type { ChatMessage, MessageReaction, ReplyPreview } from "@/entities/message";
import type { Participant } from "@/entities/user";
import { useApplyPhoto } from "@/features/apply-photo";
import {
  isSelectableMessage,
  useActiveGenerations,
  useAiSelection,
  useLlmAgentChoice,
  type GenerationEntry,
} from "@/features/ask-ai/@x/chat-room";
import {
  rememberInlineEmoticons,
  useChatStream,
  useChatStreamListener,
  useInlineEmoticons,
} from "@/features/chat-stream";
import { useWriteChatSnapshot } from "@/features/offline-snapshot";
import {
  MiniEmoticonSheet,
  ReactionBar,
  sendMessageReaction,
  type ReactionPayload,
} from "@/features/react-message";
import {
  DOUBLE_TAP_WINDOW,
  EmoticonPicker,
  EmoticonPreview,
  MessageComposer,
  useEmoticonPreload,
  useRecentEmoticons,
  useSendMessage,
  type ComposerEmoticon,
  type EmoticonFocusRequest,
  type EmoticonMenu,
} from "@/features/send-message";
import { useTypingSignal } from "@/features/typing-indicator";
import {
  FileDropOverlay,
  MediaEditor,
  MediaPickerSheet,
  MediaTray,
  VideoTrimmer,
  VoiceRecorderBar,
  toVoiceDraft,
  useAttachmentEditing,
  useFileDrop,
  useFilePaste,
  useMediaSelection,
  type VoiceRecording,
} from "@/features/upload-media";
import { useProfileViewer } from "@/features/view-profile";
import { request } from "@/shared/api";
import {
  ARCHIVE_GALLERY_ROUTE,
  ARCHIVE_TARGET_PARAM,
  CHAT_AI_PATH,
  CHAT_MESSAGE_PARAM,
  CHAT_MODE_PARAM,
  MESSAGE_FLASH_DURATION,
  REPLY_PREVIEW_MAX_LENGTH,
  toLlmProviderBranding,
  toLlmProviderName,
  toMediaCountUnit,
  toMediaLabel,
  toMediaNoun,
  toMessageSummary,
  toQuoteHeading,
  toQuoteThumbnail,
  toSoloInlineEmoticonId,
  type InlineEmoticonMap,
  type LlmThinkingLevel,
  type MediaNoun,
  type MessageArrival,
  type NotifyMode,
} from "@/shared/config";
import {
  A_SECOND,
  GESTURE_SLOP,
  KEYBOARD_OVERLAID_ATTRIBUTE,
  VIEWPORT_QUIET_WINDOW,
  buildFadeMask,
  cn,
  compareId,
  composeEventNotice,
  countVisibleWakes,
  findFirstUrl,
  focusWithoutPan,
  holdAwake,
  isSidePanelAnimating,
  onSidePanelSettled,
  randomId,
  runWhenIdle,
  startMediaMorph,
  stopVoice,
  subscribeDormancy,
  useIsFinePointer,
  useIsViewportSettling,
  useIsVirtualKeyboardOpen,
  useIsomorphicLayoutEffect,
  useMessageSound,
  useSettledCommit,
  useSoundUnlock,
  useUnsentWork,
  warmLineHeights,
  type EmoticonItemId,
  type LongPressPoint,
  type Maybe,
  type MediaId,
  type MessageId,
  type Nullable,
  type Optional,
  type UserId,
} from "@/shared/lib";
import { OFFLINE_MESSAGES, useOfflineGate } from "@/shared/offline-ux";
import {
  MediaShareDialog,
  canShareText,
  downloadMedia,
  shareText,
  useMediaShare,
} from "@/shared/share";
import {
  ActionSheet,
  Button,
  EmptyState,
  IconButton,
  MarkdownBody,
  MediaViewer,
  Modal,
  toast,
  type ActionSheetItem,
  type MediaCell,
} from "@/shared/ui";
import { useQueryClient } from "@tanstack/react-query";
import { measureElement as measureRenderedElement, useVirtualizer } from "@tanstack/react-virtual";
import { josa } from "es-hangul";
import {
  Archive,
  ChevronsDownUp,
  ChevronsUpDown,
  Copy,
  CornerUpLeft,
  CornerUpRight,
  LoaderCircle,
  MessageCircle,
  Pencil,
  Share,
  Smile,
  Sparkles,
  Square,
  Trash2,
} from "lucide-react";
import { useRouter } from "next/navigation";
import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
  type ReactNode,
  type RefObject,
  type TransitionEvent,
} from "react";
import { flushSync } from "react-dom";
import { requestMessageCollapse } from "../api/request-message-collapse";
import { requestMessageDeletion } from "../api/request-message-deletion";
import { requestMessageEdit } from "../api/request-message-edit";
import { buildChatRows } from "../model/build-chat-rows";
import { toChromeTint } from "../model/chrome-tint";
import {
  ROW_LINE_CLASSES,
  estimateRowHeight,
  type PreviewReader,
} from "../model/estimate-row-height";
import { toLinkPreviewQuery } from "../model/link-preview-query";
import { playEmoticonSound, type EmoticonSound } from "../model/play-emoticon-sound";
import { toBubbleTapHandler } from "../model/to-bubble-tap-handler";
import { toCellsFromDrafts, toCellsFromMedia, type TrackOwner } from "../model/to-media-cells";
import type { ChatRow } from "../model/types";
import { useArrivalEmoticonSound } from "../model/use-arrival-emoticon-sound";
import { useChatShortcuts } from "../model/use-chat-shortcuts";
import {
  SHEET_FLIP_ATTRIBUTE,
  SHEET_FLIP_LIST_ONLY,
  useComposerClearance,
} from "../model/use-composer-clearance";
import { useEmoticonSheet } from "../model/use-emoticon-sheet";
import { useLinkPreviewPrefetch } from "../model/use-link-preview-prefetch";
import { useMessageHistory } from "../model/use-message-history";
import { useShareTarget } from "../model/use-share-target";
import { useViewerTrack } from "../model/use-viewer-track";
import { AiSelectionBar } from "./ai-selection-bar";
import { AssistantMessageRow } from "./assistant-message-row";
import { ChatBackdrop } from "./chat-backdrop";
import { DateDivider } from "./date-divider";
import { EditBar } from "./edit-bar";
import { ExpandedBodySheet, type ExpandedBody } from "./expanded-body-sheet";
import { findChatMediaCell } from "./media-grid";
import { MessageRow } from "./message-row";
import { ReplyBar } from "./reply-bar";
import { ReplyQuote } from "./reply-quote";
import { ScrollToBottomPill } from "./scroll-to-bottom-pill";
import { SELECTION_TRANSITION_SETTLE, SelectableRow } from "./selectable-row";
import { ShortcutHelp } from "./shortcut-help";
import { SystemNotice } from "./system-notice";
import { TypingDots, TypingIndicator } from "./typing-indicator";

/**
 * REQUIREMENTS.md § 8.6.1. A message the § 8.6. search is telling the room to move
 * to.
 *
 * WARN: The token is what makes a repeat of the same id a fresh instruction rather
 * than no change at all. § 10.'s link does **not** come through here: it names its
 * message once, at mount, and a target that could fall back to it would re-jump
 * every time a search closed.
 */
export type ChatJumpTarget = {
  token: number;
  id: MessageId;
};

/**
 * REQUIREMENTS.md § 8.5. What `ChatScreen`'s `AppHeader` needs to draw the
 * selection takeover — the room reports this rather than the mode itself
 * being lifted, since `messages` (and so `useAiSelection`) has to stay where
 * the room's own pagination lives.
 */
export type AiSelectionHeaderState = {
  count: number;
  onClearAll: () => void;
  onAutoSelect: () => void;
  onExit: () => void;
};

export type ChatRoomProps = {
  className?: string;
  currentUserId: UserId;
  initialMessages: ChatMessage[];
  /** @see ChatJumpTarget */
  jumpTarget?: Nullable<ChatJumpTarget>;
  /**
   * REQUIREMENTS.md § 10. The message the screen was opened on by 보관함's
   * 대화에서 보기, taken **once, at mount** — it is the URL the room was reached
   * through and not a target that can be named again.
   */
  initialJumpMessageId?: Maybe<MessageId>;
  /** REQUIREMENTS.md § 16.1. The mode `initialJumpMessageId` lives in, so the jump does not borrow the room's filter — which `useCookieState` reports a render late after 보관함 sets it. */
  initialJumpOnlyMe?: boolean;
  /**
   * REQUIREMENTS.md § 8.6.1. The open search's query, lit inside every bubble
   * that contains it — which is what marks a search jump, in place of the
   * quote jump's flash. A whole row washed in `message-flash` says "here" and
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
  /** REQUIREMENTS.md § 16.1. 조용히 보내기 / 나에게만 보내기 — the screen owns the cookie (`useSilentSend`), the room only draws its composer notice. */
  notifyMode?: NotifyMode;
  /** REQUIREMENTS.md § 16.1., § 8.14. `⌃S`'s target — the screen owns `useSilentSend`'s setter, same split as `notifyMode`. */
  onToggleSilentSend: () => void;
  /** REQUIREMENTS.md § 11.4. Opens 새 일정 from the attach sheet's 일정 row; the screen owns the form, as it owns `EventDetailDialog`. */
  onAddEvent?: () => void;
  /** REQUIREMENTS.md § 11.5. A calendar notice was tapped; the screen opens `EventDetailDialog`, which it already owns. */
  onOpenEvent?: (message: ChatMessage) => void;
  /** @see AiSelectionHeaderState */
  onAiSelectionChange?: (state: Nullable<AiSelectionHeaderState>) => void;
};

// INFO: § 13.6. The ceiling the emoticon panel's mount is given, matching the warm's own — the two are the same idle frame and a panel that mounted first would build its cells against an empty cache.
// WARN: Hoisted, because a fresh `[]` or `{}` per render is a new identity on every one of `MessageRow`'s memo comparisons.
const NO_INLINE_EMOTICONS: EmoticonItemId[] = [];

const NO_INLINE_EMOTICON_MAP: InlineEmoticonMap = {};

const PANEL_MOUNT_IDLE_DELAY = 2 * A_SECOND;

// INFO: DESIGN.md § 6.7. The pill appears once the newest message is roughly this far away, and the same distance is what `scrollEndThreshold` treats as near enough to the end that a row re-measuring there should hold the end still rather than let it drift.
const AT_BOTTOM_THRESHOLD = 200;

// INFO: REQUIREMENTS.md § 6. One row is every attachment in it, which is the one thing neither the sheet nor the viewer shows. REQUIREMENTS.md § 9.1.'s file bubble names files instead.
const MEDIA_DELETE_WARNING = "말풍선에 담긴 사진과 동영상이 모두 사라져요";

// INFO: The loading header's own height (`h-10`), constant whether or not the skeleton is in it — a header that collapsed would move the list under the finger every time a page lands.
const LIST_HEADER_HEIGHT = 40;

// INFO: Rows here run from a 44px bubble to a 363px photo, so this is counted generously — eight of the tall ones is roughly the 600px of runway a flick covers before the next frame.
const OVERSCAN_ROWS = 8;
// INFO: § 13.6. Longer than the ~250ms the keys take to rise plus the quiet window that reports them arrived, so the viewport and not the timer is what ends a closing swap on a phone.
const SHEET_SWAP_TIMEOUT = A_SECOND / 2 + VIEWPORT_QUIET_WINDOW;

// INFO: REQUIREMENTS.md § 8.6.1. How many frames a jump may re-assert its offset over while the rows around it are measured. Six spans WebKit's post-paint `ResizeObserver` deliveries — the first lands a frame late and the correction it causes brings a second — and the loop stops early the moment two asserts resolve to the same offset.
const JUMP_SETTLE_FRAMES = 6;
// WARN: `TOP_FADE_LENGTH` in px — the floating header buttons and the fade sit over this band of the scroller, so a jump that centres against the scroller's full height parks a tall bubble under them.
const JUMP_TOP_CLEARANCE = 64;
// INFO: How long after a jump a scroller that grows — the keyboard going away — re-centres the target: the row was centred in the keyboard's viewport, which is the top fifth of the full one.
const JUMP_RECENTER_WINDOW = 3 * A_SECOND;

// INFO: REQUIREMENTS.md § 8.3. Upward paging fires once the scroller is this close to the top — far enough out that the fetch and the wait for a still scroller both fit before the reader arrives.
const LOAD_OLDER_THRESHOLD = 600;

// INFO: REQUIREMENTS.md § 8.14. How far `⌥↑`/`⌥↓` moves, as a share of what is on screen rather than a pixel count — a step that reads the same on a phone and on a desktop, and that leaves most of the last screenful in view to read against.
const HISTORY_SCROLL_STEP = 0.4;

// INFO: DESIGN.md § 7.12. Deep enough that a bubble dissolves well before the floating header's own text, rather than being clipped by it or dissolving right at its edge.
const TOP_FADE_LENGTH = "4rem";

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
  jumpTarget,
  initialJumpMessageId,
  initialJumpOnlyMe,
  searchQuery,
  bottomBar,
  notifyMode = "notify",
  onToggleSilentSend,
  onAddEvent,
  onOpenEvent,
  onAiSelectionChange,
}: ChatRoomProps) {
  const containerRef = useRef<Nullable<HTMLDivElement>>(null);
  // INFO: § 13.6. Measured out of the clearance rather than into it — its height is the one part of the stack a stylesheet already knows.
  const composerSpacerRef = useRef<Nullable<HTMLDivElement>>(null);
  const composerRef = useRef<Nullable<HTMLDivElement>>(null);
  // INFO: DESIGN.md § 3.4. The composer's own translated child — a keyboard step's FLIP writes `transform` here directly, imperatively, so the emoticon-sheet drag below and it never share a render.
  const composerMotionRef = useRef<Nullable<HTMLDivElement>>(null);
  const emoticonSheetRef = useRef<Nullable<HTMLDivElement>>(null);
  // INFO: REQUIREMENTS.md § 8.12. Observed rather than derived from `typist`, because what has to be followed is every frame of the height transition, not the state change that started it.
  const typingSlotRef = useRef<Nullable<HTMLDivElement>>(null);
  // INFO: The AI answer row below the typing slot — observed the same way `contentRef` is (growth vs. a fixed reveal), since its height changes on every streamed delta rather than opening once.
  const aiRowRef = useRef<Nullable<HTMLDivElement>>(null);
  // INFO: REQUIREMENTS.md § 8.3. The rows' own box, observed for the same reason the slot above is — a row that grows after it was estimated moves the end of the list, and nothing scrolls to say so.
  const contentRef = useRef<Nullable<HTMLDivElement>>(null);
  const scrollerRef = useRef<Nullable<HTMLElement>>(null);
  const rowsRef = useRef<ChatRow[]>([]);
  const hasTakenScrollRef = useRef(false);
  // INFO: The tail the last pin answered to. An arrival moves it and a page of older history does not, which is the whole difference between following and holding still.
  const pinnedRowKeyRef = useRef<Optional<string>>(undefined);
  // INFO: REQUIREMENTS.md § 8.3. Where a chosen row sat in the viewport just before a page was inserted above it, so the same row can be put back there once it has.
  const prependAnchorRef = useRef<Nullable<{ key: string; viewportY: number }>>(null);
  // INFO: REQUIREMENTS.md § 8.3., § 8.5. True for the length of `SelectableRow`'s gutter/bubble-width transition — every mounted row's `ResizeObserver` delivers on each animated frame, and `shouldAdjustScrollPositionOnItemSizeChange` below refuses to compensate any of them while this holds, rather than jittering the scroll position once per frame.
  const isSelectionTransitioningRef = useRef(false);
  // INFO: § 8.5. The mode the settle effect (beside `pinToBottom`) last armed the ref above for, so a render that changes for any other reason does not re-arm it.
  const wasSelectingRef = useRef(false);
  // WARN: State, not just the ref beside it — the scroller mounts a render after this component does (an empty room renders no list at all), and the virtualizer has to re-read it when it appears.
  const [scroller, setScroller] = useState<Nullable<HTMLDivElement>>(null);
  // INFO: REQUIREMENTS.md § 8.3. The width every unmeasured row is wrapped against. It has to be state and not a `clientWidth` read at estimate time — a rotation changes it for thousands of offscreen rows at once, and nothing else in this component would notice.
  const [scrollerWidth, setScrollerWidth] = useState<Optional<number>>(undefined);
  // INFO: REQUIREMENTS.md § 8.3. Whether the rows may be painted. False until the park below has answered the first real measurements, so the estimate→actual correction is not a jump the reader watches.
  // WARN: Open from the start for a room that loaded empty. There is no window to park and nothing to correct, and the scroller only mounts when the first message lands — gating on it would hold that one arrival back for two frames, on the § 8.12. screen where an arrival is the whole event.
  const [hasSettledFirstPark, setHasSettledFirstPark] = useState(initialMessages.length === 0);
  const [isAtBottom, setIsAtBottom] = useState(true);
  const isAtBottomRef = useRef(true);
  const [isAtTop, setIsAtTop] = useState(true);
  const isAtTopRef = useRef(true);
  const [actionTarget, setActionTarget] = useState<Nullable<ChatMessage>>(null);
  const [miniEmoticonTargetId, setMiniEmoticonTargetId] = useState<Nullable<MessageId>>(null);
  // INFO: REQUIREMENTS.md § 8.16. The whole of whichever bubble the reader tapped through its 전체보기, held as its own content rather than as a message id — a § 8.5. outbox row carries emoticons the room's map has not learned yet.
  const [expandedBody, setExpandedBody] = useState<Nullable<ExpandedBody>>(null);
  // INFO: AGENTS.md § 4.1. The bubble a hold or right-click opened the menu on, for the desktop `Popover`'s anchor.
  const menuAnchorRef = useRef<Nullable<HTMLElement>>(null);
  // INFO: DESIGN.md § 7.5. Where the hold or right-click fired, so the menu is pinned to the pointer rather than to the whole bubble — a bubble taller than the visible area cannot carry a below-anchored menu off screen.
  const menuAnchorPointRef = useRef<Nullable<LongPressPoint>>(null);
  const [isPickerOpen, setIsPickerOpen] = useState(false);
  // INFO: REQUIREMENTS.md § 9.3. The recorder bar stands in the composer stack while it is true. Mounting is what starts the microphone, so this is only ever set from the tap that asked for it.
  const [isRecording, setIsRecording] = useState(false);
  const [isEmoticonPickerOpen, setIsEmoticonPickerOpen] = useState(false);
  // INFO: REQUIREMENTS.md § 8.14. Bumped to put the caret back in the composer; `0` is the resting value the composer skips, so mounting the room focuses nothing.
  const [composerFocusRequest, setComposerFocusRequest] = useState(0);
  // INFO: REQUIREMENTS.md § 8.14. The composer's field, for the two things `composerFocusRequest` is a render too late for — a character typed with nothing focused, and the clipboard behind ⌘V.
  const composerFieldRef = useRef<Nullable<HTMLDivElement | HTMLTextAreaElement>>(null);
  // INFO: REQUIREMENTS.md § 8.14. The same token for the panel, bumped by **every** open — an opened panel nothing has focused is one the arrow keys cannot reach, and the toggle is a button, so a mouse open leaves focus on it rather than inside what it opened.
  // INFO: REQUIREMENTS.md § 8.6.1. The frame `settleJumpScroll` has queued, so a newer jump — or an unmount — can take it back.
  const jumpFrameRef = useRef<Nullable<number>>(null);
  const recentJumpRef = useRef<Nullable<{ index: number; at: number }>>(null);
  const [pickerFocusRequest, setPickerFocusRequest] = useState<EmoticonFocusRequest>({
    token: 0,
    viaKeyboard: false,
  });
  // WARN: REQUIREMENTS.md § 8.14. A count of the overlays the reader has dismissed, never the flag — `countVisibleWakes` records why the flag cannot answer this once the effect below is running.
  const visibleWakes = useSyncExternalStore(subscribeDormancy, countVisibleWakes, () => 0);
  const restoredWakeRef = useRef(visibleWakes);
  const [isShortcutHelpOpen, setIsShortcutHelpOpen] = useState(false);
  const { remember: rememberEmoticon } = useRecentEmoticons();
  const applyPhoto = useApplyPhoto();
  // INFO: REQUIREMENTS.md § 12.3. The streaming and finished assistant rows both tap their avatar into this — `MessageRow` reads the same hook for a participant's own avatar.
  const { openLlmProfile } = useProfileViewer();
  // INFO: REQUIREMENTS.md § 13.6. The panel's list and images are warmed from here, since the tap this exists to make cheap can come before the panel has drawn anything.
  useEmoticonPreload();
  /**
   * Whether the panel is in the document at all. One-way, and true well before the
   * first open (REQUIREMENTS.md § 13.6.).
   *
   * WARN: Mounted on an idle frame rather than on the tap, so the tap costs no mount of forty cells — and rather than at render, or § 8.3.'s first screenful of bubbles is measured against a grid mounting beside it.
   */
  const [hasMountedEmoticonPanel, setHasMountedEmoticonPanel] = useState(false);
  // INFO: REQUIREMENTS.md § 13.6. Staged rather than sent on selection, so it can be sent with a line of text the way an attachment can.
  const [stagedEmoticon, setStagedEmoticon] = useState<Nullable<Emoticon>>(null);
  // INFO: REQUIREMENTS.md § 13.8. A word tapped in the composer, handed to the picker's search tab.
  const [emoticonSearch, setEmoticonSearch] =
    useState<Nullable<{ query: string; token: number }>>(null);
  const [suggestedEmoticonSearchQuery, setSuggestedEmoticonSearchQuery] = useState("");
  /**
   * INFO: REQUIREMENTS.md § 13.8. The word a send takes out of the draft, held apart
   * from the request above because a send spends **this** and leaves that standing —
   * the panel stays on the search the emoticon came from, ready for the next one.
   *
   * WARN: A one-shot, and that is the whole reason it is not read off
   * `emoticonSearch` any more. Left armed across a send, a draft that merely reads
   * `고민` again — typed as an actual message this time — is swallowed by the next
   * emoticon staged from the same still-open results.
   */
  const searchedWordRef = useRef<Nullable<string>>(null);
  // INFO: REQUIREMENTS.md § 13.9. An emoticon tapped in the conversation. Where the panel opens is the picker's decision, since the pack list is what settles it.
  const [emoticonReveal, setEmoticonReveal] =
    useState<Nullable<{ emoticon: Emoticon; token: number }>>(null);
  // INFO: REQUIREMENTS.md § 8.14. The menu the digits asked for, carrying a token for `emoticonReveal`'s reason: pressing the same key twice is two requests, and keyed on the menu alone the second would be no change to see.
  const [menuRequest, setMenuRequest] =
    useState<Nullable<{ menu: EmoticonMenu; token: number }>>(null);
  // WARN: § 13. A mini the picker put into the draft. The token is the composer's key for it as well as the instruction, so it counts up rather than carrying `Date.now()` — two minis inside one millisecond would be one key, and the draft could no longer say which of them a Backspace took.
  const [insertedEmoticon, setInsertedEmoticon] =
    useState<Optional<{ emoticon: ComposerEmoticon; token: number }>>(undefined);
  // INFO: § 13. 미니's own 지우기, asking the composer's draft for the same Backspace its own field would take.
  const [deleteRequest, setDeleteRequest] = useState<Optional<{ token: number }>>(undefined);
  // INFO: § 13.8. The one tab exempt from § 13.6.'s keyboard gate, reported by the picker because the tab is its own state.
  const [isEmoticonSearchTab, setIsEmoticonSearchTab] = useState(false);
  // INFO: § 13.8. The same exemption, held open for as long as the keyboard that tab raised takes to leave.
  const [isEmoticonSearchExempt, setIsEmoticonSearchExempt] = useState(false);
  // INFO: § 13.6. A swap between the keyboard and the sheet in progress — `opening` from the toggle with the keys up, `closing` from the composer's field with the sheet up.
  const [sheetSwap, setSheetSwap] = useState<Nullable<"opening" | "closing">>(null);
  const isSwappingRef = useRef(false);
  isSwappingRef.current = sheetSwap !== null;

  // WARN: § 13.8. Memoized because the picker's own effect depends on it — a fresh identity every render re-runs that effect on every render of this room.
  const reportEmoticonSearchTab = useCallback((isOnSearchTab: boolean, query: string) => {
    if (isSwappingRef.current) {
      return;
    }

    setIsEmoticonSearchTab(isOnSearchTab);

    // WARN: § 13.8. Leaving 검색 ends the search, exactly as closing the panel does — unless the field still holds something the reader typed, which a walk to another tab and back should find undisturbed regardless of which tap opened it.
    if (!isOnSearchTab && query.trim() === "") {
      setEmoticonSearch(null);
      searchedWordRef.current = null;
    }
  }, []);
  // INFO: § 13.8. Bumped when a send should take the searched word out of the field; the composer owns the draft and decides whether it still holds only that word.
  const [keywordConsumeToken, setKeywordConsumeToken] = useState(0);
  // INFO: REQUIREMENTS.md § 8.10. Not mutually exclusive with the two above — a quote is an attribute of the send, not a payload competing for the § 6. row.
  const [replyTarget, setReplyTarget] = useState<Nullable<ReplyPreview>>(null);
  // INFO: DESIGN.md § 6.8. The bubble a jump landed on, until its flash expires.
  const [highlightedId, setHighlightedId] = useState<Nullable<MessageId>>(null);
  const [confirmingDeleteId, setConfirmingDeleteId] = useState<Nullable<MessageId>>(null);
  // INFO: REQUIREMENTS.md § 8.1. The slide 원본 저장 was tapped on, and every attachment of its bubble — held together so the two buttons cannot disagree about which is which.
  // WARN: REQUIREMENTS.md § 10. The nouns are carried on the pending bundle rather than decided in the heading, because the description, both buttons and the toast all take them — hardcoded, they read 사진 over a bubble of videos.
  // WARN: REQUIREMENTS.md § 8.1. **Two** kinds, and they answer different questions: `kind` is the bundle's, for every sentence about 모두, and `slideNoun` is the tapped slide's, for the one control that saves it alone. One noun served both until a mixed bubble (§ 6.) showed it offering to save 동영상 and saving the photos with it.
  // WARN: REQUIREMENTS.md § 10. Openness is the boolean below and never this, which outlives a dismissal on purpose — `DialogContent` stays mounted through its 200ms exit (`DESIGN.md § 7.4.`), so cleared here every answer fades out with no title, no description and a blank 이 사진만.
  const [pendingBundle, setPendingBundle] =
    useState<
      Nullable<{ mediaId: MediaId; ids: string[]; slideNoun: string; kind: Nullable<MediaNoun> }>
    >(null);
  const [isChoosingBundle, setIsChoosingBundle] = useState(false);
  // INFO: REQUIREMENTS.md § 8.13. The message the composer is correcting rather than replying to. Null is the ordinary composing mode.
  const [editingId, setEditingId] = useState<Nullable<MessageId>>(null);
  // WARN: § 8.13. The composer owns its draft, so text only reaches it through this. A token rather than the string alone — cancelling an edit seeds `""`, and so does cancelling the next one, which as a bare value is no instruction at all.
  const [seededDraft, setSeededDraft] =
    useState<Optional<{ text: string; emoticons: ComposerEmoticon[]; token: number }>>(undefined);
  // INFO: REQUIREMENTS.md § 13. What the placeholders in a message draw, for the one thing this component does with them — handing a correction back to the composer whole.
  const inlineEmoticons = useInlineEmoticons();
  const seedTokenRef = useRef(0);
  // INFO: The newest id the user had in view when they last left the bottom — everything past it is what the § 6.7. pill counts.
  const [seenId, setSeenId] = useState(initialMessages.at(-1)?.id ?? 0);
  const {
    messages,
    activeFilterMode,
    isLoadingOlder,
    isSwitchingMode,
    pendingOlder,
    hasNewer,
    loadOlder,
    clearOlderCooldown,
    commitPendingOlder,
    loadNewer,
    loadAround,
    returnToLive,
    reloadLiveWindow,
    appendMessage,
    replaceMessage,
    catchUp,
    reconcile,
  } = useMessageHistory(initialMessages, notifyMode === "onlyMe");
  // INFO: REQUIREMENTS.md § 16., § 16.2. The room is the only place the loaded window exists, so the offline transcript is stored from here rather than from the screen above it.
  useWriteChatSnapshot(messages, hasNewer, activeFilterMode);
  // INFO: REQUIREMENTS.md § 8.5. The composer's AI 질문 모드 — which settled messages ride along as an AI question's context.
  const aiSelection = useAiSelection(messages);
  // INFO: § 8.5. The bar's model/thinking pickers — fetched fresh on every entry into the mode.
  const llmAgentChoice = useLlmAgentChoice(aiSelection.isSelecting);
  // INFO: REQUIREMENTS.md § 8.5., § 7. `messages` — and so `useAiSelection` — lives here, but the header it drives is the screen's (`ChatScreen`'s own comment gives the reason, same as § 8.6.'s search). Reported up rather than lifted whole, since lifting `useAiSelection` would mean lifting the paginated `messages` list with it.
  useEffect(() => {
    onAiSelectionChange?.(
      aiSelection.isSelecting
        ? {
            count: aiSelection.selected.size,
            onClearAll: aiSelection.clearAll,
            onAutoSelect: aiSelection.autoSelect,
            onExit: aiSelection.exit,
          }
        : null,
    );

    // WARN: A room that unmounts mid-selection (navigating away) must not leave the screen showing a header that no longer has a room under it.
    return () => onAiSelectionChange?.(null);
  }, [
    aiSelection.isSelecting,
    aiSelection.selected.size,
    aiSelection.clearAll,
    aiSelection.autoSelect,
    aiSelection.exit,
    onAiSelectionChange,
  ]);
  const { play: playMessageSound } = useMessageSound();
  // INFO: § 13.6. One `Set` per submit whose 전송음 is still waiting on an upload — see `soundSubmit`.
  const pendingSendSoundsRef = useRef<Set<string>[]>([]);
  // INFO: § 8.5. An AI question's own `clientMsgId`, kept apart from `appendMessage` so `handleMessageSent` can tell "the send this room just made" from every other echo the send queue reports.
  const pendingAiQuestionsRef = useRef<
    Map<
      string,
      {
        text: string;
        messageIds: MessageId[];
        model: Nullable<string>;
        thinking: Nullable<LlmThinkingLevel>;
        onlyMe: boolean;
        // INFO: § 8.15. The media/emoticon bubbles this question's own send staged, so the AI request can wait for their ids too — see `aiAttachmentQuestionRef` below.
        attachmentClientMsgIds: string[];
        resolvedAttachmentIds: MessageId[];
      }
    >
  >(new Map());
  // INFO: § 8.15. Reverse index of `pendingAiQuestionsRef`'s `attachmentClientMsgIds`, keyed by the attachment's own `clientMsgId` — an attachment lands through the same `handleMessageSent` echo as any other send, and this is what tells the two apart.
  const aiAttachmentQuestionRef = useRef<Map<string, string>>(new Map());
  const handleMessageSent = useCallback(
    (message: ChatMessage) => {
      const attachmentQuestionKey = aiAttachmentQuestionRef.current.get(message.clientMsgId);

      if (attachmentQuestionKey) {
        aiAttachmentQuestionRef.current.delete(message.clientMsgId);
        pendingAiQuestionsRef.current
          .get(attachmentQuestionKey)
          ?.resolvedAttachmentIds.push(message.id);
      }

      const question = pendingAiQuestionsRef.current.get(message.clientMsgId);

      if (question) {
        pendingAiQuestionsRef.current.delete(message.clientMsgId);
        // WARN: § 8.15. `useSendMessage` delivers on one promise chain (§ 8.10.'s own comment on `submit`), so every attachment this question's send enqueued ahead of the question has already settled — landed or failed — by the time the question's own echo reaches here. An attachment id still missing from `resolvedAttachmentIds` failed, and is dropped rather than awaited, or a stalled upload would hold the AI request forever.
        question.attachmentClientMsgIds.forEach((clientMsgId) =>
          aiAttachmentQuestionRef.current.delete(clientMsgId),
        );
        void requestAiAnswer(message.clientMsgId, {
          text: question.text,
          messageIds: [...question.messageIds, ...question.resolvedAttachmentIds].sort(compareId),
          model: question.model,
          thinking: question.thinking,
          onlyMe: question.onlyMe,
        });
      }

      const soundIndex = pendingSendSoundsRef.current.findIndex((group) =>
        group.has(message.clientMsgId),
      );

      // INFO: § 13.6. The one 전송음 `soundSubmit` deferred, spent by whichever of that submit's attachments lands first.
      if (soundIndex !== -1) {
        pendingSendSoundsRef.current.splice(soundIndex, 1);
        playMessageSound("sent");
      }

      appendMessage(message);
    },
    [appendMessage, playMessageSound],
  );
  const { pending, send, sendMedia, sendEmoticon, retry, cancel, resolve } = useSendMessage({
    onSent: handleMessageSent,
  });
  // INFO: DESIGN.md § 7.10. The viewer's jump into 보관함 is a route change, and the only one this widget makes.
  const router = useRouter();
  // INFO: § 8.1. Derived rather than stored, so one subject writes all three sentences — the empty branch is reached only before the first tap, since the subject outlives the dismissal (see `pendingBundle`).
  const bundleCopy = pendingBundle
    ? {
        // WARN: AGENTS.md § 0.4. `josa`, not a literal `을` — 사진 and 동영상 both reach this sentence, which is the case that rule names verbatim.
        title: `이 말풍선의 ${josa(toMediaLabel(pendingBundle.kind), "을/를")} 모두 저장할까요?`,
        description: `이 말풍선에 ${josa(toBundleCount(pendingBundle.ids.length, pendingBundle.kind), "이/가")} 담겨 있어요`,
        // INFO: The slide's own noun, since this button saves that one slide — the only sentence here that is not about the bundle.
        only: `이 ${pendingBundle.slideNoun}만`,
      }
    : { title: "", description: "", only: "" };
  // INFO: REQUIREMENTS.md § 9.1. The one surface that takes a file attachment — the library stages the same way but shows tiles, so it keeps the default.
  const selection = useMediaSelection({ acceptsFiles: true });
  const editing = useAttachmentEditing(selection.replace);
  // INFO: REQUIREMENTS.md § 8.11. The same route the library's 저장 takes (§ 10.), asked for by 공유 rather than by 저장.
  const sharing = useMediaShare();
  // INFO: § 8.13. Both reach the server; 답장 and 복사 beside them in the same sheet do not, and are deliberately left live.
  const editGate = useOfflineGate(OFFLINE_MESSAGES.save);
  const deleteGate = useOfflineGate(OFFLINE_MESSAGES.remove);
  // WARN: The media branch only. § 8.11. hands text straight to `navigator.share` with nothing fetched, so a text message shares perfectly well with no network — gating the label outright would refuse the one case that works.
  const shareGate = useOfflineGate(OFFLINE_MESSAGES.share);
  const isKeyboardOpen = useIsVirtualKeyboardOpen();
  // INFO: § 13.6. Whether the keys are still moving, which is what ends a swap — see the tests below. Subscribed only for the length of a swap, or every keyboard step would re-render this room for a value nothing else reads.
  const isViewportSettling = useIsViewportSettling(sheetSwap !== null);
  // INFO: REQUIREMENTS.md § 8.14. Whether there is a keyboard to type at, which is what holds § 8.14.'s type-ahead and its paste to the desktop.
  const isFinePointer = useIsFinePointer();
  // INFO: REQUIREMENTS.md § 8.6. The composer's whole stack is put away for the length of a search, and everything it drives has to go with it.
  const isSearching = bottomBar !== undefined;
  // WARN: REQUIREMENTS.md § 13.8. The exemption outlives the tab by the length of the keyboard's retraction, which is what this latch holds. Leaving 검색 unmounts the field the panel had focused and the keyboard is only reported down some 250ms later — released with the tab, those frames are an unexempted panel that collapses to nothing and reopens by itself once the keys finish sliding.
  // WARN: § 13.8. `isEmoticonPickerOpen` is what the latch may be *set* by, and it is not decoration. The tab is reported off a picker that never unmounts, so a `forcedTab` that outlived a close — `EmoticonPicker` records that happening twice — or a stored `jandh:emoticon-tab` of `search` reports 검색 with nothing on screen. The release below is the keyboard alone, so a latch set that way is held by every keyboard the reader opens afterwards, and the screen's own height hangs on it. Only the release is allowed to outlive the picker.
  const isEmoticonSearchHeld = isEmoticonSearchTab && isEmoticonPickerOpen;

  if (
    isEmoticonSearchExempt !== isEmoticonSearchHeld &&
    (isEmoticonSearchHeld || !isKeyboardOpen)
  ) {
    setIsEmoticonSearchExempt(isEmoticonSearchHeld);
  }

  // WARN: § 13.6. A stage from an expanded sheet collapses it only after `DOUBLE_TAP_WINDOW`, or the cell moves out from under the second tap of a quick send.
  // WARN: Declared above the render-phase close below, which reaches it through `closeEmoticonPanel` — left further down it is a `const` in its TDZ and the swap throws.
  const collapseTimerRef = useRef<Optional<ReturnType<typeof setTimeout>>>(undefined);

  // INFO: § 13.6. An opening swap ends when the keys are down, a closing one when they are up — and the sheet closes only then, so the keys rise over it and the two 300ms eases cancel.
  // WARN: § 13.6. The settle is half of each test and not decoration. `isKeyboardOpen` flips at `MIN_KEYBOARD_HEIGHT`, several frames before the keys have arrived, so the screen came off the resting height with that much of the slide still to play and re-eased the remainder under the composer.
  if (sheetSwap === "opening" && !isKeyboardOpen && !isViewportSettling) {
    setSheetSwap(null);
  } else if (sheetSwap === "closing" && isKeyboardOpen && !isViewportSettling) {
    setSheetSwap(null);
    closeEmoticonPanel();
  }

  // WARN: § 13.6. A coarse pointer with no virtual keyboard — an iPad on a keyboard case — never flips the flag, so a closing swap the keys do not answer is closed on a timer instead.
  useEffect(() => {
    if (sheetSwap !== "closing") {
      return;
    }

    const timer = setTimeout(() => {
      setSheetSwap(null);
      closeEmoticonPanel();
    }, SHEET_SWAP_TIMEOUT);

    return () => clearTimeout(timer);
  }, [sheetSwap]);

  const isKeyboardOverlaid = isEmoticonSearchExempt || sheetSwap !== null;

  // INFO: DESIGN.md § 3.4. For as long as this holds, the screen keeps its resting height and the keyboard covers the sheet rather than shrinking it — 검색's field at the top of an expanded sheet, or a sheet the keys are sliding on or off.
  // WARN: A layout effect, so the attribute lands in the frame the strip's class does — a swap is the screen's 300ms ease and the strip's cancelling, and a frame between them is a frame the composer moves.
  useLayoutEffect(() => {
    if (!isKeyboardOverlaid) {
      return;
    }

    const root = document.documentElement;

    root.setAttribute(KEYBOARD_OVERLAID_ATTRIBUTE, "");

    return () => {
      root.removeAttribute(KEYBOARD_OVERLAID_ATTRIBUTE);
    };
  }, [isKeyboardOverlaid]);

  // WARN: Belt to the field's own `onFieldFocus` braces, and derived rather than an effect that closes it — Android reopens the keyboard on a field that is already focused, which fires no `focus` event for the picker to hear.
  // WARN: `!isSearching` is load-bearing beyond the drawing. The panel being open is one of § 8.12.'s two sustained typing sources, so a panel left open behind the search goes on announcing 입력 중 — and it would pop back open on 취소.
  // WARN: REQUIREMENTS.md § 13.8. The search tab is the one exemption from the keyboard gate, because its field is the keyboard's reason for being up — it is drawn one row tall precisely so it fits in what the keyboard leaves. Keyed on the tab and never on that field's focus: a blur and the keyboard's retraction are separate frames, and between them the unexempted panel closes underneath the user.
  const isEmoticonPanelOpen =
    isEmoticonPickerOpen &&
    (!isKeyboardOpen || isEmoticonSearchExempt || sheetSwap !== null) &&
    !isSearching;
  const emoticonSheet = useEmoticonSheet({
    sheetRef: emoticonSheetRef,
    isOpen: isEmoticonPanelOpen,
    onClose: closeEmoticonPanel,
  });
  // WARN: Mirrored into a ref, read from `useComposerClearance`'s effect — a keyboard step's FLIP must not fight this drag for `composerMotionRef`'s transform, and an effect closure cannot see a state variable's later value.
  const isDraggingRef = useRef(false);
  isDraggingRef.current = emoticonSheet.isDragging;
  // INFO: DESIGN.md § 3.4. Writes a keyboard step's own motion straight to `composerMotionRef`/`contentRef`, imperatively — it returns nothing, so it costs this component no re-render.
  useComposerClearance({
    containerRef,
    composerRef,
    composerMotionRef,
    composerSpacerRef,
    scrollerRef,
    contentRef,
    isAtBottomRef,
    isDraggingRef,
  });
  // INFO: § 13.6. Seeded with the mount value, so the mount render itself never arms a FLIP.
  const hasHandledSheetFlipRef = useRef(isEmoticonPanelOpen);
  // INFO: § 13.6. `useComposerClearance`'s own container-height heuristic cannot tell this toggle apart from typing growth — neither moves the container — so the room marks it explicitly, just ahead of the paint that snaps `--chat-composer-spacer` below.
  // WARN: § 13.6. Withheld only for an actual swap or the keys standing up — never for `isKeyboardOverlaid` as a whole: the 검색 exemption holds that flag for as long as the panel sits on that menu, and gating on it left every open from 검색 teleporting instead of animating.
  // WARN: Keyed on the panel actually changing, not on the deps changing — the flags below flip on their own and must not re-arm a FLIP for a toggle that already happened.
  useLayoutEffect(() => {
    if (hasHandledSheetFlipRef.current === isEmoticonPanelOpen) {
      return;
    }

    hasHandledSheetFlipRef.current = isEmoticonPanelOpen;

    if (sheetSwap !== null || isKeyboardOpen) {
      return;
    }

    const container = containerRef.current;

    if (!container) {
      return;
    }

    // WARN: A drag-close already carried the composer down under the finger, so its FLIP would flash it back to the pre-drag top — only the list is left to ease.
    container.setAttribute(
      SHEET_FLIP_ATTRIBUTE,
      emoticonSheet.isClosedByDrag ? SHEET_FLIP_LIST_ONLY : "",
    );

    // WARN: Expired one rendering update after the consuming one, and never sooner — rAF callbacks run *before* ResizeObserver delivery inside a frame, so a single rAF removes the attribute one phase ahead of the measure that was to consume it. Without any expiry, a frame that never renders (an occluded tab) leaves the attribute standing and `readScrollEdges` silenced for good.
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        container.removeAttribute(SHEET_FLIP_ATTRIBUTE);
      });
    });
  }, [isEmoticonPanelOpen, sheetSwap, isKeyboardOpen, emoticonSheet.isClosedByDrag]);
  // WARN: `isResettingAfterClose` is use-sheet-drag's reset-frame contract — without it the drag-close commit eases `dragTranslateY → 0` on top of the snapped layout, a downward glide the composer FLIP used to mask and no longer runs to.
  const composerTransition =
    emoticonSheet.isDragging || emoticonSheet.isResettingAfterClose
      ? "transition-none"
      : "transition-transform duration-300 ease-route";
  const emoticonSheetTransition = emoticonSheet.isDragging
    ? "transition-none"
    : isEmoticonPanelOpen && emoticonSheet.size === "expanded"
      ? "transition-[height,transform] duration-(--duration-sheet-expand) ease-sheet"
      : "transition-[height,transform] duration-300 ease-route";

  const effectiveSheetTranslateY =
    emoticonSheet.dragTranslateY > 0 ? emoticonSheet.dragTranslateY : 0;
  // WARN: DESIGN.md § 3.4. Sheet-drag alone — a keyboard step's own motion is `useComposerClearance` writing `composerMotionRef`'s `transform` directly, never through this state.
  const effectiveComposerTranslateY =
    emoticonSheet.dragTranslateY > 0 ? emoticonSheet.dragTranslateY : 0;
  // WARN: § 13.6. Capped at the composer's own travel to its closed spot — the sheet's full pull reaches the screen's edge, but the composer rests `--bottom-inset` above it, so riding uncapped overshoots by the inset and comes back up at the close commit.
  const composerDragTransform =
    effectiveComposerTranslateY > 0
      ? `translateY(min(${effectiveComposerTranslateY}px, calc(var(--chat-composer-spacer) - var(--bottom-inset))))`
      : undefined;

  useEffect(() => () => clearTimeout(collapseTimerRef.current), []);
  // INFO: § 13.6. What the sheet clears the history by at rest — the spacer's height, and never more: an expanded sheet covers the composer rather than lifting it.
  // INFO: § 13.6. The keyboard's own height, so the composer stands where the keys would have put it; `--emoticon-panel-height` over the inset until a keyboard has been measured.
  // WARN: § 13.6. The inset is *inside* this height and never added beside it. The wrapper sits on the screen's edge and this spacer carries the inset while closed, so the keyboard flag stepping `--bar-lift` changes nothing an open sheet is sized by — added beside it, that step raced the spacer's 300ms ease and the composer flinched by the inset on every swap.
  const emoticonSheetRestHeight =
    "var(--keyboard-height, calc(var(--emoticon-panel-height) + var(--emoticon-sheet-handle-height) + var(--bottom-inset)))";
  // INFO: § 13.6. The sheet's drawn height, to the screen's edge. The card keeps it through the collapse so it is clipped rather than squashed.
  const emoticonSheetHeight =
    emoticonSheet.pinnedHeight !== null
      ? `${emoticonSheet.pinnedHeight}px`
      : emoticonSheet.size === "expanded"
        ? `${emoticonSheet.expandedHeight}px`
        : emoticonSheetRestHeight;

  const [isEmoticonSheetSettledClosed, setIsEmoticonSheetSettledClosed] =
    useState(!isEmoticonPanelOpen);

  useEffect(() => {
    if (isEmoticonPanelOpen) {
      setIsEmoticonSheetSettledClosed(false);
      return;
    }

    // WARN: Keep the sheet visible during the 300ms slide-down close transition.
    // Once completely closed, hide it with opacity-0 so it doesn't bleed through iOS virtual keyboard / Safari accessory bars behind the composer.
    const timer = setTimeout(() => {
      setIsEmoticonSheetSettledClosed(true);
    }, 300);

    return () => clearTimeout(timer);
  }, [isEmoticonPanelOpen]);

  const isEmoticonSheetVisible =
    (isEmoticonPanelOpen || !isEmoticonSheetSettledClosed) &&
    (!isKeyboardOpen || isEmoticonSearchExempt);
  // WARN: REQUIREMENTS.md § 9.3. The shared element outlives every bubble that addresses it, so leaving the room has to stop it. Unlike § 13.6.'s two-second ping a recording runs for minutes, and no screen outside this one draws a transport that could pause it.
  useEffect(() => stopVoice, []);
  // WARN: REQUIREMENTS.md § 9.3. The recorder is closed by the search rather than hidden with the rest of the stack. `hidden` + `inert` leaves the microphone open with both 취소 and 완료 unreachable, and `MAX_VOICE_DURATION` then sends a recording the user walked away from two minutes earlier.
  useEffect(() => {
    if (isSearching) {
      setIsRecording(false);
    }
  }, [isSearching]);
  // INFO: REQUIREMENTS.md § 12.2. The wallpaper comes from here rather than from a prop, because either participant can change it and the other one must see it without leaving the room.
  const {
    participants,
    chatBackgroundMediaId,
    chatBackgroundBlurhash,
    attachRequest,
    clearAttachRequest,
    typingUserIds,
    setIsReading,
    setIsViewingMedia,
    markRead,
  } = useChatStream();
  // INFO: AGENTS.md § 4.1. The rail's 첨부 lives outside the room, so it leaves a request the room answers — on mount too, for a press made on another tab.
  useEffect(() => {
    if (attachRequest === 0) {
      return;
    }

    setIsPickerOpen(true);
    clearAttachRequest();
  }, [attachRequest, clearAttachRequest]);
  // INFO: REQUIREMENTS.md § 8.1. The viewer's own floor, matching the room it opened over rather than the app's default `bg-canvas`.
  const viewerBackgroundColor = toChromeTint(chatBackgroundBlurhash) ?? "var(--color-chat-canvas)";
  // WARN: REQUIREMENTS.md § 8.12. Only the two *sustained* sources are passed; typing arrives as edit pulses through the returned callback, because a field holding a draft is not somebody typing. Sending is not a trigger either way — it clears both of these and produces no edit.
  // WARN: REQUIREMENTS.md § 8.12. Silent for the length of a search. A staged emoticon is state that outlives the hidden composer, so left connected it holds the signal up and re-POSTs every `TYPING_PING_INTERVAL` — the other participant reads 입력 중 from a composer that is not even on screen, which is exactly the parked-draft failure § 8.12. exists to have removed.
  const signalEdit = useTypingSignal(
    !isSearching && (isEmoticonPanelOpen || stagedEmoticon !== null),
  );
  const participantById = useMemo(
    () => new Map(participants.map((participant) => [participant.id, participant])),
    [participants],
  );
  // INFO: DESIGN.md § 7.10. The name the viewer's caption shows, from the same participant set every bubble's nickname is resolved through (§ 8.7.).
  // WARN: Memoized, because `useViewerTrack` carries this identity into every callback it hands the viewer — and one of them is what `useSettledCommit` measures its wait from (§ 8.3.).
  const toSenderName = useCallback(
    (senderId: UserId) => participantById.get(senderId)?.name,
    [participantById],
  );
  // INFO: REQUIREMENTS.md § 8.1. The § 7.10. viewer's track, which reaches the whole conversation rather than the bubble that opened it, and pages at both of its edges.
  const mediaTrack = useViewerTrack(toSenderName, notifyMode === "onlyMe");
  // INFO: Plucked for the § 16.1. mode-change effect below — `mediaTrack` itself is re-minted per render, and only this member is what the effect uses.
  const closeMediaViewer = mediaTrack.close;
  // INFO: REQUIREMENTS.md § 9.2. Refused for the length of a search — the composer and its tray are put away there, so a drop or a paste would stage attachments the screen offers no way to send.
  // WARN: REQUIREMENTS.md § 9.2. Refused under an editor or the viewer too. React bubbles a drop through the *component* tree, so those overlays deliver one here however they are portalled — and one landing behind the crop editor stages into a tray the overlay is covering.
  const canStageAttachments = !isSearching && !editing.isEditing && !mediaTrack.viewer;
  const fileDrop = useFileDrop({
    isEnabled: canStageAttachments,
    onDrop: (files) => void stageMedia(files),
  });
  // INFO: REQUIREMENTS.md § 9.2. The clipboard reaches the same tray a drop does, which is why it takes the same guard rather than one of its own.
  // WARN: § 9.2. The room's own box is the fourth cover, and only this route needs one — a `window` listener has no tree position, so § 8.4.1.'s overlay (a sibling of this widget, which takes focus on mount) would otherwise have its paste staged behind it.
  useFilePaste({
    containerRef,
    isEnabled: canStageAttachments,
    onPaste: (files) => void stageMedia(files),
  });
  // INFO: REQUIREMENTS.md § 1. Exactly two people, so the first id is the only id — a list of names would be answering a question this app cannot ask.
  // WARN: REQUIREMENTS.md § 16.1. 나에게만 보내기 — withholds the other participant's typing indicator while in onlyMe mode.
  const typist =
    notifyMode !== "onlyMe" && typingUserIds.length > 0
      ? (participantById.get(typingUserIds[0]) ?? null)
      : null;
  // INFO: A generation asked from anywhere, not only this device — `useActiveGenerations` is fed by the whole conversation's `llm` channel.
  const { generations, cancelGeneration } = useActiveGenerations(messages);
  // INFO: The advisory locks (`LLM_GENERATION_LOCK_KEY` / user-scoped `toLlmOnlyMeLockKey`) serialize runs server-side per queue, so at most one entry per mode/user is ever `running`; a `queued` one with nothing running yet is drawn as this room's own front of the line.
  const generationEntries = useMemo(() => {
    const isOnlyMeMode = notifyMode === "onlyMe";
    return Array.from(generations).filter(([streamId, entry]) => {
      if (isOnlyMeMode ? !entry.onlyMe : entry.onlyMe) {
        return false;
      }

      const isAlreadyAnswered = messages.some(
        (m) =>
          m.clientMsgId === streamId ||
          (m.systemAction === "assistant_reply" &&
            m.replyTo !== null &&
            messages.some(
              (qm) => qm.clientMsgId === entry.questionClientMsgId && qm.id === m.replyTo?.id,
            )),
      );

      return !isAlreadyAnswered;
    });
  }, [generations, notifyMode, messages]);
  const primaryGeneration =
    generationEntries.find(([, entry]) => entry.status === "running") ?? generationEntries[0];
  const queuedGenerationCount = primaryGeneration
    ? generationEntries.length - 1
    : generationEntries.length;
  const rows = useMemo(
    () =>
      buildChatRows({
        messages,
        pending,
        currentUserId,
        hideOthers: activeFilterMode,
      }),
    [messages, pending, currentUserId, activeFilterMode],
  );
  /**
   * REQUIREMENTS.md § 8.3. What `getItemKey`'s identity turns over on — the row keys
   * themselves, joined.
   *
   * WARN: `virtual-core` memoizes the whole measurement pass on `(count, …, getItemKey,
   * itemSizeCacheVersion)`, and a § 8.13. revision changes a row's key with its **index
   * standing still**. Neither term moves, so nothing recomputes: the measurements keep
   * the size of the state the row has left. It is invisible the first time — the new key
   * has no cached size, so measuring it bumps the version and that recomputes — and wrong
   * every time after, since the key has been measured before and the same size sets
   * nothing. § 8.17.'s second fold was a one-line bubble with the whole answer's height
   * still reserved under it, and the row below painted on top of it.
   *
   * WARN: The keys and never `rows` itself. `pending` takes a new identity on every
   * upload-progress tick, and turning the memo over on that re-estimates every unmeasured
   * row in the history — the cost the stable identity exists to avoid.
   */
  const rowKeySignature = useMemo(() => rows.map((row) => row.key).join("\u0000"), [rows]);
  // INFO: REQUIREMENTS.md § 8.8. Every participant's cursor but my own, which the § 8.4. stream already keeps current — the count lands without a request of its own.
  // INFO: Resolved once rather than per row: the count is a fold over this array, and it is the same array for every bubble in the room.
  const readerCursors = useMemo(
    () =>
      participants
        .filter((participant) => participant.id !== currentUserId)
        .map((participant) => participant.lastReadMessageId),
    [participants, currentUserId],
  );
  const countUnreadReaders = useCallback(
    (message: ChatMessage) => toUnreadReaderCount(message, currentUserId, readerCursors),
    [currentUserId, readerCursors],
  );
  const queryClient = useQueryClient();
  // INFO: REQUIREMENTS.md § 8.3. A cache read, never a subscription — this answers the row estimate below, which runs for rows that are nowhere near the DOM.
  const readPreview: PreviewReader = useCallback(
    (url) =>
      url ? (queryClient.getQueryData(toLinkPreviewQuery(url).queryKey) ?? undefined) : undefined,
    [queryClient],
  );
  // INFO: REQUIREMENTS.md § 8.15. Which bubble the streaming answer belongs to — `questionClientMsgId` names a row the asker sent moments ago, so it is on screen unless the reader has scrolled the page holding it out of the window.
  const questionMessage = primaryGeneration
    ? messages.find(({ clientMsgId }) => clientMsgId === primaryGeneration[1].questionClientMsgId)
    : undefined;
  // WARN: Below `readPreview` and not beside `primaryGeneration`, because `toReplyPreviewFor` reads it during render — hoisted or not, the `const` above is still in its temporal dead zone up there.
  const streamedQuestion = questionMessage ? toReplyPreviewFor(questionMessage) : undefined;
  /**
   * REQUIREMENTS.md § 8.3. What the sends in flight are carrying, in the shape the page's
   * own map has — the estimate's second place to look for a box.
   *
   * WARN: Belt to `submit`'s braces, and it covers the one case that publish cannot: a
   * queued send revived from § 16.'s snapshot was published by a page that has since been
   * closed, so the map starts empty and its row would draw a box the estimate priced at
   * nothing. Derived from the queue itself, this cannot be forgotten by a send path.
   *
   * WARN: Written during render and read through a ref, for `keyedRowsRef`'s reason:
   * `pending` takes a new identity on every upload progress tick, and a dependency here
   * would re-estimate every row in the room on each of them.
   */
  const pendingInlineEmoticonsRef = useRef<InlineEmoticonMap>(NO_INLINE_EMOTICON_MAP);

  // INFO: The empty map is the constant rather than a fresh one, since a room with nothing in flight passes here on every scroll frame.
  pendingInlineEmoticonsRef.current =
    pending.length === 0
      ? NO_INLINE_EMOTICON_MAP
      : toInlineEmoticonMap(pending.flatMap((entry) => entry.inlineEmoticons));

  // INFO: REQUIREMENTS.md § 8.3. Resolved off the surface the bubbles are drawn on, so the wrap estimate counts glyphs in the font they will actually be laid out in rather than in a ratio per glyph class.
  const estimateContext = useMemo(
    () => ({
      // INFO: REQUIREMENTS.md § 8.3., § 8.5. The raw scroller width — `estimate-row-height.ts`'s own `toTranslatedWidthContext` takes the selection gutter back off this per row, since only a translated (non-`mine`) row actually shifts under `SelectableRow`'s gutter and needs the width to shrink for it.
      contentWidth: scrollerWidth,
      isSelecting: aiSelection.isSelecting,
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
      countUnreadReaders,
      // WARN: REQUIREMENTS.md § 8.3. The same map `renderRow` hands the bubble, and it MUST stay the same one — fed from two sources the estimate and the row disagree about the box by construction, which is the miss this whole estimate exists to avoid.
      // WARN: The page's map first and the sends in flight second, never one of the two — the echoed row is the authority on a version bump or a deletion (§ 13.4.), and the optimistic row is the only place its own emoticons exist at all.
      readInlineEmoticon: (itemId: EmoticonItemId) =>
        inlineEmoticons[itemId] ?? pendingInlineEmoticonsRef.current[itemId],
    }),
    [
      scroller,
      scrollerWidth,
      aiSelection.isSelecting,
      readPreview,
      participantById,
      countUnreadReaders,
      inlineEmoticons,
    ],
  );
  // WARN: Written during render rather than in an effect, and read through a ref rather than closed over. `getItemKey` has to be one stable function: virtual-core memoizes the whole measurement pass on its identity, and a fresh closure per render re-runs `estimateSize` for every row that is not currently mounted — thousands of canvas text layouts on every SSE tick. It also has to see *this* render's rows, which `rowsRef` is deliberately one commit behind on.
  const keyedRowsRef = useRef(rows);

  keyedRowsRef.current = rows;

  // WARN: REQUIREMENTS.md § 8.3. `estimateSize` needs the same stable identity `getItemKey` does, and for the identical reason — a fresh closure over `estimateContext` fires on every toggle of AI 질문 모드 (`isSelecting` moves `toTranslatedWidthContext`'s output for every translated row), which reran `countTextLines` for every mounted row on the very tap that was supposed to feel instant. `estimateContextRef` is `keyedRowsRef`'s idiom applied to the other half of `estimateRowHeight`'s input.
  const estimateContextRef = useRef(estimateContext);

  estimateContextRef.current = estimateContext;

  // WARN: Indexed defensively. `indexFromElement` answers `-1` for an element it finds no `data-index` on, and both the library's own `measureElement` and the override below hand that straight back here — `rows[-1].key` would throw out of the render phase and take the whole surface down where the library only meant to warn.
  // WARN: § 8.3. `rowKeySignature` is the whole dependency and is deliberately unread in the body — see its own comment. Identity here is the library's only signal that a row's key moved under a standing index.

  const getItemKey = useCallback(
    (index: number) => keyedRowsRef.current[index]?.key ?? index,
    [rowKeySignature],
  );
  const estimateSize = useCallback((index: number) => {
    const row = keyedRowsRef.current[index];

    return row ? estimateRowHeight(row, estimateContextRef.current) : LIST_HEADER_HEIGHT;
  }, []);
  // INFO: REQUIREMENTS.md § 8.3. Anchored to the end and keyed by row, which is what holds the viewport still across a prepend — the virtualizer re-finds the keyed row after the data changes and offsets the scroll by however far it moved.
  const virtualizer = useVirtualizer({
    count: rows.length,
    getScrollElement: () => scroller,
    // WARN: REQUIREMENTS.md § 8.3. Per row, never one flat guess. A row measured above the fold corrects the scroll by however far the estimate missed, and WebKit drops that correction mid-gesture — so the error of a flat estimate is drift the reader watches accumulate.
    estimateSize,
    getItemKey,
    anchorTo: "end",
    // WARN: Never `followOnAppend`. It follows through `scrollToIndex`, which resolves against the measurements alone, and `ListFooter` is not one of them — so every arrival parked the newest message exactly `--chat-bottom-gap` low, which is to say behind the composer. `pinToBottom` takes the scroller's own maximum instead.
    scrollEndThreshold: AT_BOTTOM_THRESHOLD,
    // WARN: The list does not start at the top of the scroller — the loading header sits above it, and without this the virtualizer resolves every offset that much too high.
    scrollMargin: LIST_HEADER_HEIGHT,
    overscan: OVERSCAN_ROWS,
    // WARN: A `ResizeObserver` callback can still land inside React's own render call stack — nothing in the DOM spec rules that out, only that it comes after layout. When it does, the library's synchronous `notify` reaches for `flushSync` while React is already rendering, which is the exact warning this option exists to route around: it defers the callback's own work into a `requestAnimationFrame`, the same escape hatch `jumpToMessage` already uses to leave React's call stack (§ 8.6.1.).
    useAnimationFrameWithResizeObserver: true,
    /**
     * WARN: REQUIREMENTS.md § 8.3. The whole point is *not* measuring here. `virtualizer.measureElement` is a `ref`, so it runs in React's commit — and the default measures the DOM right there, which on a row whose estimate was wrong applies a scroll correction and asks for a synchronous re-render. React cannot flush mid-commit, so it warns and schedules instead: the correction lands, the rows that move with it land a frame later, and the two are briefly out of step.
     *
     * WARN: Returning what is already believed makes the delta zero, so the ref registers the element with the `ResizeObserver` and does nothing else. The observer's first delivery then measures it for real, outside any React phase, where the library's synchronous flush actually works.
     *
     * WARN: `entry` is what tells the two callers apart, not whether the row has been measured before. A row already in `itemSizeCache` still mounts a fresh DOM node whenever it re-enters the window — a remount, not a resize — and `entry` is `undefined` for that ref call the same as for a genuinely new row. Reading the DOM there, even to confirm a cached size, still calls back into React from inside its own commit.
     * WARN: The believed size comes from `measurementsCache`, never a fresh call to `estimateSize`. `measurementsCache` is rebuilt by a memo keyed on `count` and a few other options — not on row content — so a row whose estimate legitimately changed (its neighbor's grouping changed, its text resolved from a draft) can leave the memo untouched while `estimateSize(index)` for the same index now answers differently. Recomputing here reintroduces exactly the delta this override exists to zero out; reading what the library already committed to cannot diverge from it.
     */
    measureElement: (element, entry, instance) => {
      if (!entry) {
        const index = instance.indexFromElement(element);
        const key = index >= 0 ? instance.options.getItemKey(index) : undefined;
        const believed = key !== undefined ? instance.itemSizeCache.get(key) : undefined;
        // WARN: REQUIREMENTS.md § 8.3. `measurementsCache` is indexed, and only its **own** key's size may be handed back. § 8.13.'s revision changes a row's key while its index stands still, so this fallback otherwise answers with the size of the state the row has just left — the withdrawal's, the correction's, § 8.17.'s whole markdown answer — and that wrong size is then committed under the new key, where nothing re-estimates it. It showed as a folded bubble holding a screenful of empty room, and as the next row drawn on top of an unfolded one.
        const measured = instance.measurementsCache[index];

        return (
          believed ?? (measured?.key === key ? measured.size : instance.options.estimateSize(index))
        );
      }

      const size = measureRenderedElement(element, entry, instance);
      const index = instance.indexFromElement(element);
      const key = index >= 0 ? instance.options.getItemKey(index) : undefined;
      const measured = instance.measurementsCache[index];

      // WARN: REQUIREMENTS.md § 8.3. `resizeItem` discards a measurement equal to the current ledger value, so a row whose estimate happened to match stays "unmeasured" — and when its estimate later moves (a § 8.9. preview resolving into the query cache), the next measurement pass re-prices the row under the reader with no resize left to correct it. Pinning the first real measurement into the cache is what makes it permanent.
      // WARN: Only when the ledger already agrees. Pinned unconditionally, `resizeItem` reads the pin back, prices every estimate→actual delta at zero, and skips the correction wholesale — which held the whole room on its estimates until the next data change, visibly overlapped, on every cold entry.
      if (
        key !== undefined &&
        !instance.itemSizeCache.has(key) &&
        measured?.key === key &&
        measured.size === size
      ) {
        instance.itemSizeCache.set(key, size);
      }

      return size;
    },
  });

  // WARN: Replaces the default, which refuses to compensate a *re*-measure taken while the scroll direction is `backward`. Reading back through history is exactly that, and a § 8.9. link card resolving above the fold then shoves everything below it down by the card's own height. A row that is entirely above the fold has to be compensated whichever way the finger was moving; one that still spans it grew below the anchor and must not be.
  virtualizer.shouldAdjustScrollPositionOnItemSizeChange = (item, _delta, instance) => {
    // WARN: REQUIREMENTS.md § 8.3., § 8.5. `SelectableRow`'s gutter/bubble-width CSS transition resizes every mounted row on each animated frame, and compensating per frame is what jitters the scroll rather than settling it once — the effect beside `pinToBottom` below force-remeasures and re-parks once the transition itself has actually finished instead.
    if (isSelectionTransitioningRef.current) {
      return false;
    }

    // INFO: The offset the virtualizer is scrolling *to*, not the one the scroller is at — a correction already queued this tick is in `scrollAdjustments` and has yet to reach the DOM.
    const fold = (instance.scrollOffset ?? 0) + instance.scrollAdjustments;

    // INFO: An unmeasured row is the estimate→actual correction, and the whole estimated block sat above the fold — that one is compensated from its start, as the library's own first-measure branch does.
    return instance.itemSizeCache.has(item.key) ? item.end <= fold : item.start < fold;
  };

  // INFO: The idle mount below is the ordinary path; this is the tap that beats it there.
  if (isEmoticonPanelOpen && !hasMountedEmoticonPanel) {
    setHasMountedEmoticonPanel(true);
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

  const {
    pendingId: arrivalSoundId,
    announce: announceArrivalSound,
    settle: settleArrivalSound,
  } = useArrivalEmoticonSound();

  // INFO: REQUIREMENTS.md § 8.5. The stream echoes my own message back too, so the optimistic bubble is retired on `client_msg_id` rather than waiting for the POST response it may well beat.
  const receiveMessage = useCallback(
    (message: ChatMessage, arrival: MessageArrival) => {
      const isNew = appendMessage(message);

      resolve(message.clientMsgId);

      // INFO: REQUIREMENTS.md § 13.6. My own emoticon already sounded at the tap that sent it, so the echo of it is silent.
      if (isNew && arrival === "live" && message.senderId !== currentUserId) {
        const soloId = message.emoticon
          ? null
          : toSoloInlineEmoticonId({
              text: message.text ?? "",
              inlineEmoticonItemIds: message.inlineEmoticonItemIds,
            });
        const solo = soloId ? inlineEmoticons[soloId] : undefined;
        const emoticon =
          message.emoticon ??
          (soloId && solo ? { id: soloId, version: solo.version, hasAudio: solo.hasAudio } : null);

        // INFO: § 13.6. An emoticon's own sound is the arrival's sound; the 전송음 covers the message that has none.
        if (emoticon?.hasAudio) {
          // WARN: § 8.6.1. The hold needs the arriving row to actually mount and report back, and only the live edge guarantees that — a reader scrolled up has it outside the virtualizer's range even with no newer page to fetch, and the sound would then wait out the whole cap instead of announcing the arrival.
          if (isAtBottom && !hasNewer) {
            announceArrivalSound(message.id, emoticon);
          } else {
            playEmoticonSound(emoticon);
          }
        } else {
          playMessageSound("received");
        }
      }
    },
    [
      appendMessage,
      resolve,
      currentUserId,
      inlineEmoticons,
      playMessageSound,
      announceArrivalSound,
      hasNewer,
      isAtBottom,
    ],
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
   * REQUIREMENTS.md § 8.3. Takes the scroller, and with it the two DOM reads the row
   * estimate needs before it wraps a single row.
   *
   * WARN: The width and the line heights are published from here rather than from a layout effect, and it is the difference between a first estimate against the real column and one against `DEFAULT_CONTENT_WIDTH`. A ref runs in the same commit as the `setScroller` beside it, so the render that first draws rows already has both — an effect is a commit later, which is a whole re-estimate of every unmeasured row and a re-park behind it.
   * WARN: `useCallback` with no dependencies, and that is what makes the read affordable. React detaches and re-attaches a ref whose identity changed, so a function declared per render would take `clientWidth` — a forced synchronous layout — in the commit of *every* render, and the virtualizer renders this room on each scroll frame.
   */
  const captureScroller = useCallback((element: Nullable<HTMLDivElement>) => {
    scrollerRef.current = element;
    setScroller(element);

    if (element) {
      warmLineHeights(ROW_LINE_CLASSES);
      setScrollerWidth(element.clientWidth);
    }
  }, []);

  /**
   * REQUIREMENTS.md § 8.3. The newest message parked directly above the composer,
   * which is what every follow in this room means by "the bottom".
   *
   * WARN: The scroller's own maximum, never `scrollToIndex`. The list's trailing spacer already _is_ the composer's clearance, while an index resolves against the measurements alone — and `ListFooter` is not one of them, so it stops a whole spacer short.
   */
  const pinToBottom = useCallback(() => {
    const element = scrollerRef.current;

    if (element) {
      isAtBottomRef.current = true;
      // WARN: Safari compositor bug (see useComposerClearance).
      const max = element.scrollHeight - element.clientHeight;
      if (element.scrollTop >= max) {
        element.scrollTop = max - 1;
      }
      element.scrollTop = element.scrollHeight;
    }
  }, []);

  /**
   * REQUIREMENTS.md § 8.3., § 8.5. Arms `isSelectionTransitioningRef` for
   * `SELECTION_TRANSITION_SETTLE` on every AI 질문 모드 toggle — the same window
   * `SelectableRow`'s own gutter and every bubble's `max-width` transition run
   * on — then force-remeasures whatever rows are still mounted and re-parks the
   * reader at the live edge if that is where they were. The frames the ref
   * suppressed above are folded into this one settled correction instead of
   * several jittering ones.
   */
  useEffect(() => {
    if (wasSelectingRef.current === aiSelection.isSelecting) {
      return;
    }

    wasSelectingRef.current = aiSelection.isSelecting;
    isSelectionTransitioningRef.current = true;

    const timeout = setTimeout(() => {
      isSelectionTransitioningRef.current = false;

      contentRef.current
        ?.querySelectorAll<HTMLElement>("[data-index]")
        .forEach((node) => virtualizer.measureElement(node));

      if (isAtBottomRef.current) {
        pinToBottom();
      }
    }, SELECTION_TRANSITION_SETTLE);

    return () => clearTimeout(timeout);
  }, [aiSelection.isSelecting, virtualizer, pinToBottom]);

  // INFO: § 13.6. The same idle frame `useEmoticonPreload` warms on, so the panel is built out of a cache that is filling rather than ahead of it.
  useEffect(() => runWhenIdle(() => setHasMountedEmoticonPanel(true), PANEL_MOUNT_IDLE_DELAY), []);

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

  /**
   * Holds the reader at the bottom while the AI answer row grows under a
   * streamed answer — a *delta*-based follow rather than the typing slot's
   * fixed-reveal one above, since this row's height changes on every coalesced
   * chunk of an answer rather than opening once to a known size.
   */
  useEffect(() => {
    const row = aiRowRef.current;

    if (!row) {
      return;
    }

    // WARN: Zero and not the row's own height, so the observer's first delivery counts the row's *arrival* as growth. Seeded with the measured height the mount itself — which lengthens the list by a whole row — is the one change nothing compensates, and the answer opens below the fold.
    let lastHeight = 0;

    const observer = new ResizeObserver(([entry]) => {
      const scroller = scrollerRef.current;
      const growth = entry.contentRect.height - lastHeight;

      lastHeight = entry.contentRect.height;

      // WARN: REQUIREMENTS.md § 8.3., § 8.5. `SelectableRow`'s gutter/bubble-width transition rewraps every mounted row's text over its own 200ms, and a rewrap changes this row's height too if it is one of the ones translating — reading that as "growth" and re-parking the scroller feeds straight back into a `scroll` event this effect's own commit produced, looping for as long as the transition keeps delivering frames. The settle effect beside `pinToBottom` re-parks once it has actually finished instead.
      if (isSelectionTransitioningRef.current) {
        return;
      }

      if (!scroller || growth <= 0 || !isAtBottomRef.current) {
        return;
      }

      if (scroller.scrollHeight - scroller.scrollTop - scroller.clientHeight <= growth + 1) {
        scroller.scrollTop = scroller.scrollHeight;
      }
    });

    observer.observe(row);

    return () => observer.disconnect();
    // INFO: `Boolean(primaryGeneration)` is what says the row has mounted or unmounted — the ref itself does not trigger a re-render.
  }, [Boolean(primaryGeneration)]);

  /**
   * REQUIREMENTS.md § 8.3. Holds the reader at the bottom while a row already on
   * screen grows under them — the § 8.9. card resolving on the link they just sent,
   * a photo's real height replacing its estimate, a bubble that measured taller than
   * it was wrapped for. Every one of those lands *after* the send has pinned, so
   * without this the message the user just sent finishes below the fold.
   *
   * WARN: Two conditions, and the growth alone is not enough for either. `distance ≤ growth` reconstructs where the reader was *only* while `scrollTop` held still across the change — and § 8.3.'s prepend deliberately moves it, by a whole page, so a reader who had just paged backwards satisfies it and is thrown to the live edge. `isAtBottomRef` is what excludes them: it is this commit's own answer, written by `readScrollEdges` before the measurement lands.
   * WARN: And the at-bottom flag alone is not enough either — it is `AT_BOTTOM_THRESHOLD` wide, so a reader parked 150px up would be yanked down by any row that grew more than that. The growth test is what keeps the follow to those who were actually at the end.
   */
  useEffect(() => {
    const content = contentRef.current;

    if (!content) {
      return;
    }

    let lastHeight = content.getBoundingClientRect().height;

    const observer = new ResizeObserver(([entry]) => {
      const scroller = scrollerRef.current;
      const growth = entry.contentRect.height - lastHeight;

      lastHeight = entry.contentRect.height;

      // WARN: REQUIREMENTS.md § 8.3., § 8.5. `SelectableRow`'s bubble-width transition rewraps every row's text over its own 200ms, moving `virtualizer.getTotalSize()` — and so this box's own explicit `style.height` — on each animated frame. Compensating that as "growth" re-parks the scroller, which fires the `scroll` event this same effect is listening for, looping for as long as the transition keeps delivering frames. The settle effect beside `pinToBottom` re-parks once it has actually finished instead.
      if (isSelectionTransitioningRef.current) {
        return;
      }

      if (!scroller || growth <= 0 || !isAtBottomRef.current) {
        return;
      }

      if (scroller.scrollHeight - scroller.scrollTop - scroller.clientHeight <= growth + 1) {
        scroller.scrollTop = scroller.scrollHeight;
      }
    });

    observer.observe(content);

    return () => observer.disconnect();
    // INFO: The rows' box mounts with the scroller and is unmounted with it when the room empties, so this is what says the element has changed.
  }, [scroller]);

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
  // WARN: REQUIREMENTS.md § 8.13.1. A resume runs both. `catchUp` pages forward from the newest id this client knows and so can never see a mutation landing on a row it already holds; `reconcile` asks about exactly those and nothing else.
  useChatStreamListener({
    onMessage: receiveMessage,
    onResume: () => {
      void catchUp();
      void reconcile();
    },
    onChange: handleRemoteChange,
  });

  // INFO: REQUIREMENTS.md § 8.8. The conversation is on screen for as long as this is mounted, which is what suppresses the badge and moves the read cursor.
  useEffect(() => {
    setIsReading(true);

    return () => setIsReading(false);
  }, [setIsReading]);

  // WARN: REQUIREMENTS.md § 8.8. Declared after the effect above and never before it — React runs cleanups in that order, so a room left with the viewer open has already stopped reading when this one fires and the cursor stays where it was.
  const isViewingMedia = Boolean(mediaTrack.viewer);

  useEffect(() => {
    setIsViewingMedia(isViewingMedia);

    return () => setIsViewingMedia(false);
  }, [isViewingMedia, setIsViewingMedia]);

  // INFO: DESIGN.md § 6.7. The same target `pinToBottom` takes, animated — the pill is a journey back to the live edge that the user asked for, not a pin.
  const scrollToBottom = useCallback(() => {
    scrollerRef.current?.scrollTo({ top: scrollerRef.current.scrollHeight, behavior: "smooth" });
  }, []);

  /**
   * REQUIREMENTS.md § 16.1. Switching between 나에게만 보내기 and the shared timeline
   * swaps the message list for a much shorter or longer subset, leaving the scroll offset
   * parked in the middle of history. Pulling the scroller to the bottom lands the reader
   * at the newest message.
   */
  const wasOnlyMe = useRef(notifyMode === "onlyMe");
  const isInitialJumpPending = useRef(Boolean(initialJumpMessageId));

  useEffect(() => {
    const isOnlyMe = notifyMode === "onlyMe";
    if (wasOnlyMe.current !== isOnlyMe) {
      if (isInitialJumpPending.current) {
        isInitialJumpPending.current = false;
      } else {
        void reloadLiveWindow(isOnlyMe).then(() => {
          requestAnimationFrame(scrollToBottom);
        });
      }

      // INFO: REQUIREMENTS.md § 16.1. An open viewer holds the other mode's track — ⌃S can fire behind the overlay, and every slide it would page in belongs to a timeline no longer on screen.
      closeMediaViewer();
    }

    wasOnlyMe.current = isOnlyMe;
  }, [notifyMode, reloadLiveWindow, scrollToBottom, closeMediaViewer]);

  /**
   * REQUIREMENTS.md § 8.6.1. The § 6.7. pill is also the way back from a jump, so it
   * restores the window before it scrolls.
   *
   * WARN: Only on a restore that landed. A refused fetch leaves the jumped window on screen and toasts, and travelling to *its* bottom on top of that moves the reader somewhere they never asked to be — for a tap that has already reported it failed.
   */
  const goToNewest = useCallback(async () => {
    if (await returnToLive()) {
      scrollToBottom();
      // INFO: REQUIREMENTS.md § 8.1. The tap is the reader saying they have caught up, so the cursor moves on it rather than waiting for the next throttled write.
      markRead();
    }
  }, [returnToLive, scrollToBottom, markRead]);

  // WARN: REQUIREMENTS.md § 8.14. Every full-screen thing this room raises is a plain `ShellOverlay` with no dialog marker on it, so the hook's own `OPEN_OVERLAY_SELECTOR` check sees none of them — the crop editor, the trimmer, and § 8.6.'s results list all have to be named here or `Escape` pulls the caret into a composer nobody can see and ⌘↓ moves the conversation underneath the reader.
  useChatShortcuts({
    isCovered: isSearching || editing.isEditing,
    onEscape: peelComposerStack,
    onFocusComposer: focusComposer,
    onGoToNewest: () => void goToNewest(),
    onShowShortcuts: () => setIsShortcutHelpOpen(true),
    onToggleEmoticonPanel: toggleEmoticonPanel,
    onSelectEmoticonMenu: selectEmoticonMenu,
    onScrollHistory: scrollHistory,
    onToggleAiMode: toggleAiMode,
    onToggleSilentSend,
    onTypeAhead: typeIntoComposer,
    onPasteText: pasteIntoComposer,
  });

  // INFO: REQUIREMENTS.md § 7. Through `submit`, so a share takes the same live-edge return, 전송음 and § 8.5. retry every other send does.
  useShareTarget((text) => submit(text, []));

  /**
   * REQUIREMENTS.md § 8.14. Focus into the panel after a menu digit chose its tab.
   *
   * WARN: An effect rather than a line in `selectEmoticonMenu`, because the menu has to
   * change first. The picker applies a menu request in an effect of its own — a child's,
   * which runs ahead of this one in the same flush — where a request made in the same
   * commit is answered a layout effect *earlier*, on the outgoing menu's first cell,
   * which then unmounts and leaves focus on `<body>`.
   */
  useEffect(() => {
    if (menuRequest) {
      requestPickerFocus(true);
    }
  }, [menuRequest?.token]);

  // WARN: Scrolling inside the send handler resolves against the pre-send data, so a message sent from deep in history lands below the fold. The row only exists from this commit onward.
  // WARN: REQUIREMENTS.md § 13.6. A pin and never `scrollToBottom` — a smooth scroll started here outlives the emoticon panel's collapse and steers the history back to the offset the open panel implied.
  useEffect(() => {
    if (pendingCount > lastPendingCount.current) {
      pinToBottom();
      requestAnimationFrame(pinToBottom);
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
  }, [isLoadingOlder]);

  // WARN: A returning network moves no finger either, and a reader parked at the top through a failed page is exactly who is waiting on it. Both halves are needed: the cooldown drops the wait `loadOlder` is still serving, and the edge check is what asks again — nothing else would until the reader scrolls.
  useEffect(() => {
    function retryPagesOnReconnect() {
      clearOlderCooldown();
      syncScrollEdges();
    }

    window.addEventListener("online", retryPagesOnReconnect);

    return () => window.removeEventListener("online", retryPagesOnReconnect);
  }, [clearOlderCooldown]);

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
   * REQUIREMENTS.md § 8.3. Releases the rows once the park above has run against real
   * heights rather than estimates.
   *
   * WARN: Two frames, not one. The rows are deliberately not measured in React's commit (see `measureElement`), and WebKit delivers the `ResizeObserver` that does measure them *after* this frame's paint — so the correction, and the re-park that follows it, land during the second.
   * WARN: A timer and never a measurement signal. Every candidate — `itemSizeCache`, a stable total size — is either already true before the first delivery or needs a commit that may never come, and a gate that waits for one it does not get leaves the room blank. Nothing here can fail to fire.
   */
  useEffect(() => {
    if (!scroller) {
      return;
    }

    let frame = requestAnimationFrame(() => {
      frame = requestAnimationFrame(() => setHasSettledFirstPark(true));
    });

    return () => cancelAnimationFrame(frame);
  }, [scroller]);

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
    if (
      isAtBottomRef.current &&
      (rows.some((row) => row.key === previousKey) || previousKey.startsWith("p"))
    ) {
      pinToBottom();
      requestAnimationFrame(pinToBottom);
    }
  }, [rows, pinToBottom]);

  /**
   * REQUIREMENTS.md § 8.3. Republishes the width the row estimate wraps against.
   *
   * WARN: A rotation resizes the scroller without changing a single thing this component renders from, so nothing else here would ever notice — and every row not currently mounted would keep being wrapped against the old width until it was measured.
   * INFO: AGENTS.md § 4.1. The measured box is `contentRef`, not the scroller — at `md` the column caps at `--content-max-width` and centres inside a wider scroller, and an estimate wrapped against the scroller's own width would run wider than the bubbles it is estimating. `contentRef` mounts in the same branch as `scroller` (see the JSX below), so it is always present once there is something to observe.
   */
  useIsomorphicLayoutEffect(() => {
    if (!scroller) {
      return;
    }

    const target = contentRef.current ?? scroller;
    let unsubscribeSettled: Nullable<() => void> = null;

    const measure = () => {
      // WARN: AGENTS.md § 4.4. Deferred while the `lg` side panel animates — the width changes every frame of that transition, and measuring against each one is the jitter this guard exists to stop.
      if (isSidePanelAnimating()) {
        unsubscribeSettled ??= onSidePanelSettled(() => {
          unsubscribeSettled = null;
          measure();
        });

        return;
      }

      setScrollerWidth(target.clientWidth);
    };
    const observer = new ResizeObserver(measure);

    observer.observe(target);

    return () => {
      observer.disconnect();
      unsubscribeSettled?.();
    };
  }, [scroller]);

  // INFO: A real gesture, not a `scroll` event — the parking above scrolls too, and only the user reaching for the history should end it.
  useEffect(() => {
    if (!scroller) {
      return;
    }

    const takeScroll = () => {
      hasTakenScrollRef.current = true;
      recentJumpRef.current = null;
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

  // INFO: REQUIREMENTS.md § 8.6.1. A jump taken with the keyboard up is re-centred once the keyboard leaves, unless a gesture has taken the scroll since.
  useEffect(() => {
    if (!scroller) {
      return;
    }

    let previousHeight = scroller.clientHeight;
    const observer = new ResizeObserver(() => {
      const height = scroller.clientHeight;
      const recent = recentJumpRef.current;
      const hasGrown = height > previousHeight;

      previousHeight = height;

      if (recent && hasGrown && performance.now() - recent.at <= JUMP_RECENTER_WINDOW) {
        settleJumpScroll(recent.index);
      }
    });

    observer.observe(scroller);

    return () => observer.disconnect();
  }, [scroller]);

  /**
   * REQUIREMENTS.md § 13.6. Reaching for the history puts the panel away, the same
   * way reaching for the field does.
   *
   * WARN: A tap, and specifically not a scroll. Dismissing on `pointerdown` runs the whole collapse — strip, clearance and re-pin — underneath a finger that was only reaching for the history, which is why § 13.6. rejected this rule the first time. The press is therefore only *armed* here and settled on `pointerup`: a gesture that moved past `GESTURE_SLOP`, or that moved the scroller at all, was a scroll and closes nothing.
   *
   * WARN: There is no `wheel` listener for the same reason — a wheel **is** the scroll. It is also why the `scroll` event cannot be the signal either: opening the panel scrolls the history itself, re-pinning it every frame of the strip's growth, so the panel would close on the frame it opened.
   *
   * WARN: On the room, never on the scroller. An empty room renders no scroller at all (§ 8.12.), and that is the room where the panel covers the most nothing — bound to the scroller the rule simply does not hold there, and the toggle is the only way out.
   *
   * WARN: Which is why the composer has to be excluded by hand: the panel is inside its wrapper, so every tap on a cell reaches this too and would close the panel on the emoticon being chosen.
   */
  useEffect(() => {
    const container = containerRef.current;

    if (!container || !isEmoticonPanelOpen) {
      return;
    }

    let press: Nullable<{ x: number; y: number; scrollTop: number }> = null;

    // WARN: § 13.9. An emoticon bubble is excluded alongside the composer, and for the same reason turned inside out: that tap re-aims this panel rather than reaching past it, and `pointerup` runs a frame before the `click` — left armed, the panel collapses and reopens on every 따라하기.
    const arm = ({ target, clientX, clientY }: PointerEvent) => {
      const isExcluded =
        target instanceof Node &&
        (composerRef.current?.contains(target) ||
          (target instanceof Element && target.closest("[data-emoticon-bubble]") !== null));

      press = isExcluded
        ? null
        : { x: clientX, y: clientY, scrollTop: scrollerRef.current?.scrollTop ?? 0 };
    };

    const settle = ({ clientX, clientY }: PointerEvent) => {
      const origin = press;

      press = null;

      if (!origin) {
        return;
      }

      // INFO: A finger laid on a scroller that is still coasting arrests it, which moves the offset by a few pixels and is a scroll by any reading — so the offset is compared exactly rather than within a tolerance.
      const hasScrolled = (scrollerRef.current?.scrollTop ?? 0) !== origin.scrollTop;
      const hasMoved =
        Math.abs(clientX - origin.x) > GESTURE_SLOP || Math.abs(clientY - origin.y) > GESTURE_SLOP;

      if (!hasScrolled && !hasMoved) {
        closeEmoticonPanel();
      }
    };

    // WARN: `pointercancel` is what a touch that becomes a scroll usually ends on, and it must disarm rather than settle — engines differ on whether a `pointerup` follows it at all, and the scroll test is what covers the ones that send one.
    const disarm = () => {
      press = null;
    };

    container.addEventListener("pointerdown", arm, { passive: true });
    container.addEventListener("pointerup", settle, { passive: true });
    container.addEventListener("pointercancel", disarm, { passive: true });

    return () => {
      container.removeEventListener("pointerdown", arm);
      container.removeEventListener("pointerup", settle);
      container.removeEventListener("pointercancel", disarm);
    };
  }, [isEmoticonPanelOpen]);

  /**
   * REQUIREMENTS.md § 8.6.1. A target named from outside the room — a § 8.6.
   * search result or § 10.'s 대화에서 보기 — run through the same jump a quote takes.
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
  }, [jumpTarget?.token]);

  /**
   * REQUIREMENTS.md § 10. The message 보관함's 대화에서 보기 opened this screen on,
   * taken on mount and never again — the URL is not an instruction that can repeat.
   *
   * WARN: It flashes where the search jump above does not (DESIGN.md § 6.8.). There
   * is no query lit inside the bubble here to say which row the tap arrived on, and
   * that is exactly the case the flash exists for.
   */
  useEffect(() => {
    if (!initialJumpMessageId) {
      return;
    }

    void jumpToMessage(initialJumpMessageId, { flash: true, onlyMe: initialJumpOnlyMe });

    // WARN: § 10. Stripped once it has been taken, or a reload re-reads the URL as a fresh instruction and hauls the reader off the row they had scrolled to back onto the tile's message.
    // WARN: A task later, and through the patched `replaceState`, for the reasons `useShareTarget` strips its own parameters that way.
    const timer = setTimeout(() => {
      const url = new URL(window.location.href);

      url.searchParams.delete(CHAT_MESSAGE_PARAM);
      url.searchParams.delete(CHAT_MODE_PARAM);
      window.history.replaceState(null, "", `${url.pathname}${url.search}`);
    });

    return () => {
      clearTimeout(timer);
      // WARN: § 8.6.1. The jump's settle loop outlives this component otherwise, and it calls into a virtualizer whose scroller has gone.
      cancelJumpScroll();
    };
  }, []);

  /**
   * REQUIREMENTS.md § 8.14. Puts focus back where 절전 모드 took it from.
   *
   * WARN: § 8.4.1. The overlay takes focus on mount precisely so keystrokes cannot
   * reach the composer behind it, and it restores nothing on the way out — so waking
   * left focus on `<body>`, where every shortcut this room owns is refused and the
   * panel's arrows reach nothing. The panel wins when it is open, because that is the
   * thing the reader was in the middle of.
   *
   * INFO: Keyed on the wake rather than on every change, so a room that was never
   * asleep never moves focus. `useSyncExternalStore` because the count is module
   * state `shared/api`'s request gate reads beside without a hook (§ 8.4.1.).
   *
   * WARN: The ref is seeded from the count at first render, not from `0` — the
   * provider outlives this widget, so a room re-entered after a wake would otherwise
   * open by seizing the caret.
   */
  useEffect(() => {
    if (visibleWakes === restoredWakeRef.current) {
      return;
    }

    restoredWakeRef.current = visibleWakes;

    if (isEmoticonPanelOpen) {
      // INFO: § 8.14. The mode is carried across rather than assumed — a panel a mouse opened is one a mouse should get back, without the rings a keyboard entry paints.
      setPickerFocusRequest((request) => ({ ...request, token: request.token + 1 }));
    } else {
      focusComposer();
    }
    // WARN: Keyed on the wake alone. `focusComposer` and the panel flag change on their own account all the time, and re-running on either would seize focus from whatever the reader had reached for since.
  }, [visibleWakes]);

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
    // INFO: REQUIREMENTS.md § 9.2. The drop target is the whole room, so a file dragged anywhere over the conversation stages rather than having to find the composer.
    // WARN: REQUIREMENTS.md § 12.2. No floor of its own, and it MUST NOT get one back. `ChatScreen` is `bg-chat-canvas` already, so an opaque copy here changes nothing a reader sees — but iOS 26 samples the **pixels** at the top edge rather than the `fixed` box's declared colour, and a flat `chat-canvas` covering the wallpaper's tint is what the status bar then wears for the whole session.
    <div
      ref={containerRef}
      className={cn("relative min-h-0 flex-1 chat-clearance", className)}
      // INFO: REQUIREMENTS.md § 13.6. The spacer half of `--chat-bottom-gap` (theme.css) — the composer's own spacer, the list's trailing one and the pills over it all read this one value.
      // WARN: § 13.6. Always `0s`. Easing this on the browser's own clock is what forced `useComposerClearance`'s `ResizeObserver` to re-measure and re-pin on every frame of the toggle with no keyboard up — the value now snaps in one layout pass, and `SHEET_FLIP_ATTRIBUTE` (above) hands the visible motion to that hook's FLIP instead, on `transform` alone.
      style={{
        ["--chat-composer-spacer" as string]: isEmoticonPanelOpen
          ? emoticonSheetRestHeight
          : "var(--bottom-inset)",
        transitionDuration: "0s",
      }}
      {...fileDrop.handlers}
    >
      {chatBackgroundMediaId && (
        <ChatBackdrop mediaId={chatBackgroundMediaId} blurhash={chatBackgroundBlurhash} />
      )}
      {rows.length === 0 && !isSwitchingMode && activeFilterMode === (notifyMode === "onlyMe") ? (
        <>
          <div className="absolute inset-0 flex items-center justify-center p-md pb-(--chat-bottom-gap)">
            <EmptyState
              Icon={MessageCircle}
              description={
                activeFilterMode ? "나에게 메시지를 보내보세요" : "보관된 메시지가 없어요"
              }
            />
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
              // WARN: DESIGN.md § 3.4. `overscroll-contain`, and it is load-bearing rather than polish. This box no longer sits in a document that cannot scroll, so a pull it cannot consume — the top of the loaded history, or a conversation shorter than the screen — chains straight to the root scroller, which is parked at `0` on this route and answers it with pull-to-refresh. The gesture reads as the list refusing to move and the app reloading instead.
              className="scrollbar-hidden h-full overflow-x-clip overflow-y-auto overscroll-contain"
              style={{ maskImage: buildScrollFadeMask() }}
              onScroll={syncScrollEdges}
            >
              <ListHeader isLoadingOlder={isLoadingOlder} />
              {/* INFO: `getTotalSize()` already nets off `scrollMargin`, so this is the rows' own height and the header above it is not counted twice. The row offsets do not — hence the subtraction on each `translateY` below. */}
              {/* WARN: Left off until the scroller exists, which is the one thing here the server cannot agree on. The estimate this resolves to is measured off the page (`measureLineHeight`), so the server computes it from literals and the browser from real layout — rendering that difference into an attribute is a hydration mismatch. No scroller also means no rows, so there is nothing for a height to hold up yet. */}
              {/* WARN: REQUIREMENTS.md § 8.3. `invisible` and never `hidden`. The heights this is waiting for are delivered by a `ResizeObserver`, which reports nothing for a box that was taken out of layout — `display: none` is a gate holding itself shut. */}
              <div
                ref={contentRef}
                className={cn(
                  "relative mx-auto w-full max-w-(--content-max-width)",
                  !hasSettledFirstPark && "invisible",
                )}
                style={{ height: scroller ? virtualizer.getTotalSize() : undefined }}
              >
                {virtualizer.getVirtualItems().map((item) => {
                  const row = rows[item.index];
                  const selectableId = toSelectableMessageId(row);

                  return (
                    <div
                      key={item.key}
                      ref={virtualizer.measureElement}
                      className="absolute top-0 left-0 w-full"
                      data-index={item.index}
                      style={{
                        transform: `translateY(${item.start - virtualizer.options.scrollMargin}px)`,
                      }}
                    >
                      <SelectableRow
                        isSelecting={aiSelection.isSelecting}
                        isTranslated={isTranslatedRow(row)}
                        isSelectable={selectableId !== null}
                        isSelected={selectableId !== null && aiSelection.selected.has(selectableId)}
                        onToggle={
                          selectableId !== null ? () => aiSelection.toggle(selectableId) : undefined
                        }
                      >
                        {renderRow(row)}
                      </SelectableRow>
                    </div>
                  );
                })}
              </div>
              <ListFooter
                slotRef={typingSlotRef}
                typist={typist}
                aiRowRef={aiRowRef}
                primaryGeneration={primaryGeneration}
                queuedGenerationCount={queuedGenerationCount}
                replyTo={streamedQuestion}
                replyToHeading={streamedQuestion ? toQuoteHeadingFor(streamedQuestion) : undefined}
                onOpenReply={
                  streamedQuestion
                    ? () => void jumpToMessage(streamedQuestion.id, { flash: true })
                    : undefined
                }
                onCancelGeneration={cancelGeneration}
                onOpenLlmProfile={openLlmProfile}
              />
            </div>
          </div>
          <ScrollToBottomPill
            className={cn(
              "absolute inset-x-0 bottom-[calc(var(--chat-bottom-gap)+var(--spacing-md))] mx-auto will-change-transform",
              composerTransition,
            )}
            // WARN: § 8.6.1. A window parked around a jump target can sit at the bottom of its own scroll range while the newest message is still pages away, so the pill has to answer to the window too.
            isVisible={!isAtBottom || hasNewer}
            newMessageCount={unseenCount}
            // WARN: DESIGN.md § 3.4. Rides the emoticon-sheet drag alone — a keyboard step never FLIPs this pill. It is hidden (`opacity-0`, `pointer-events-none`) for the whole of a list FLIP, since that only runs while pinned to the bottom; the one case it is visible mid-step (scrolled away, composer-only FLIP) reads `--chat-bottom-gap` unanimated and just lands at its new spot.
            style={{ transform: composerDragTransform }}
            onClick={() => void goToNewest()}
          />
        </>
      )}
      {(isSwitchingMode || activeFilterMode !== (notifyMode === "onlyMe")) && (
        <div className="pointer-events-none absolute inset-0 flex items-center justify-center p-md pb-(--chat-bottom-gap)">
          <LoaderCircle className="size-6 animate-spin text-meta-soft" />
        </div>
      )}
      {/* WARN: Rendered outside the branch above. Two tree positions would remount the textarea on the first send and drop keyboard focus mid-conversation. */}
      {/* WARN: DESIGN.md § 3.5. The wrapper spans the full shell width and the composer's gutters, so without this it takes taps meant for the bubbles scrolling under it. */}
      <div ref={composerRef} className="pointer-events-none absolute inset-x-0 bottom-0">
        {/* WARN: A child of the measured wrapper and never the wrapper itself. `useComposerClearance` reads `composer.getBoundingClientRect().top`, which a translate on that box moves — its first measurement lands mid-flight and reports a clearance of `0` that nothing afterwards resizes it back out of. */}
        <div className="relative mx-auto w-full max-w-(--content-max-width)">
          {bottomBar}
          {/* WARN: REQUIREMENTS.md § 8.6. The whole stack goes while a search is open, not just the field — a reply bar or an attachment tray left standing would be composing a message the screen offers no way to send. */}
          {/* WARN: `hidden`, never a conditional subtree. `MessageComposer` holds the draft in its own state, so unmounting it here silently discards a typed message and drops its `useUnsentWork` hold with it. `display: none` takes it out of the wrapper's height, which is all `useComposerClearance` reads. */}
          <div className={cn(isSearching && "hidden")} inert={isSearching}>
            {/* INFO: § 13.6. Translates with the sheet when pulled down from rest mode, while staying anchored when pulled up to expand. */}
            {/* WARN: DESIGN.md § 3.4. `useComposerClearance` also writes this box's `transform`/`transition`/`will-change` directly for a keyboard step's own FLIP, never through `effectiveComposerTranslateY` — React never re-renders for that motion, so nothing here may assume its inline style is the whole story. */}
            <div
              ref={composerMotionRef}
              className={composerTransition}
              style={{ transform: composerDragTransform }}
            >
              {/* INFO: REQUIREMENTS.md § 9.3. Tops the composer stack while it is up, clearing the history by the same `xs` every other row in this position does (DESIGN.md § 6.6.). It replaces nothing — a recording is sent outright, so there is no tray for it to compete with. */}
              {isRecording && (
                <VoiceRecorderBar
                  className="mx-md mt-xs mb-2xs"
                  onDone={sendVoice}
                  onClose={() => setIsRecording(false)}
                />
              )}
              {/* INFO: DESIGN.md § 6.6. Same gap as the bar above; `MediaTray` renders nothing with an empty selection, so this costs the resting composer no height. */}
              {/* WARN: REQUIREMENTS.md § 8.13. Hidden while a message is being corrected, never emptied — the drafts live in `useMediaSelection` and are still there when the edit is cancelled. An edit is text-only, and `canSend` refuses to arm on a tray the mode cannot send. */}
              {editingId === null && (
                <MediaTray
                  className="mx-md mt-xs mb-2xs"
                  drafts={selection.drafts}
                  pendingCount={selection.pendingCount}
                  onEdit={editing.open}
                  onRemove={selection.remove}
                />
              )}
              {/* WARN: REQUIREMENTS.md § 13.6. Absolute so it adds nothing to the wrapper this hook measures — in flow it would grow the clearance and shove the history up under a preview that is glass and meant to float over it. */}
              {/* WARN: § 13.6. `bottom-full` is above the composer, which the sheet never moves, clamped at the header for a short viewport (the wrapper is still composer + spacer at rest). */}
              {/* WARN: No `z-` of its own, so the sheet's `z-10` covers it once that is dragged over the composer — a card floating in the middle of a full-height grid reads as part of the grid. */}
              {/* WARN: REQUIREMENTS.md § 8.13. Withheld while correcting, for the reason the tray above is — it is still staged and it returns on cancel. */}
              {stagedEmoticon && editingId === null && (
                <div className="absolute inset-x-0 bottom-[min(100%,calc(var(--chat-screen-height)_-_var(--app-header-inset)_-_var(--emoticon-preview-height)_-_var(--spacing-xs)))]">
                  <EmoticonPreview
                    key={stagedEmoticon.id}
                    className="mx-md mb-2xs"
                    emoticon={stagedEmoticon}
                    onRemove={() => setStagedEmoticon(null)}
                  />
                </div>
              )}
              <MessageComposer
                hasAttachments={selection.drafts.length > 0 || stagedEmoticon !== null}
                isStaging={selection.pendingCount > 0}
                isEmoticonPickerOpen={isEmoticonPanelOpen}
                isAiMode={aiSelection.isSelecting}
                keywordConsumeToken={keywordConsumeToken}
                seededDraft={seededDraft}
                insertedEmoticon={insertedEmoticon}
                deleteRequest={deleteRequest}
                isEditing={editingId !== null}
                notifyMode={notifyMode}
                header={composerHeader()}
                focusRequest={composerFocusRequest}
                fieldRef={composerFieldRef}
                onToggleAiMode={toggleAiMode}
                // WARN: Toggled against what is on screen, not the flag behind it. The flag can be true while the keyboard suppresses the panel (§ 13.6.), and inverting it there closes a panel the user is asking to open.
                onToggleEmoticons={openEmoticonPanel}
                onAttach={() => setIsPickerOpen(true)}
                onEdit={signalEdit}
                onKeywordTap={openEmoticonSearch}
                onPreviewTap={openEmoticonSearch}
                onSuggestedSearchQueryChange={setSuggestedEmoticonSearchQuery}
                onFieldFocus={yieldToComposer}
                onSend={({ text, emoticons }) => submit(text, emoticons)}
              />
            </div>
            {/* INFO: REQUIREMENTS.md § 13.6. The sheet stands in the keyboard's slot under the composer, inside the same wrapper so the history is cleared by both and scrolls under both. */}
            {/* INFO: § 13.6. The clip: bottom-anchored at the screen's edge, which is the wrapper's own, `z-10` over the composer, its height 0 ↔ the sheet's so the card inside rises behind it on open and is clipped on close. Above rest it just draws taller. */}
            {/* INFO: § 13.6. The spring is the upward expand's alone — `ease-sheet` peaks 3% over, so the card pokes a few px under the header's glass and settles, where a `max-height` would stop it flat. Every other move keeps the 200ms ease-out, and a drag follows the finger. */}
            {/* WARN: The sheet stays mounted through the collapse so it has something to animate, which leaves its tab stops in the document until `inert` takes them back out. */}
            <div
              ref={emoticonSheetRef}
              className={cn(
                "absolute inset-x-0 bottom-0 z-10 flex flex-col justify-end overflow-hidden",
                "h-(--emoticon-sheet-height)",
                emoticonSheetTransition,
                !isEmoticonSheetVisible && "pointer-events-none opacity-0",
              )}
              inert={!isEmoticonPanelOpen}
              style={{
                ["--emoticon-sheet-height" as string]: emoticonSheetHeight,
                transform: isEmoticonPanelOpen
                  ? effectiveSheetTranslateY > 0
                    ? `translateY(${effectiveSheetTranslateY}px)`
                    : "translateY(0)"
                  : "translateY(100%)",
              }}
              onTransitionEnd={handleEmoticonSheetTransitionEnd}
            >
              {hasMountedEmoticonPanel && (
                <div
                  className={cn(
                    "pointer-events-auto flex h-(--emoticon-sheet-height) shrink-0 flex-col rounded-t-xl border-t border-hairline bg-canvas pb-(--bottom-inset) will-change-transform",
                    emoticonSheetTransition,
                  )}
                  {...emoticonSheet.dragProps}
                >
                  {/* INFO: § 13.6. The drag is the card's, from any row that does not scroll vertically, and from the grid once it has no scroll left in the pull's direction — the hook leaves every other press inside it to the grid. `touch-none` here and on the menu bar, or the finger's pull is spent on the room behind it. */}
                  <button
                    className={cn(
                      "relative flex h-(--emoticon-sheet-handle-height) w-full shrink-0 cursor-grab touch-none items-center justify-center focus-visible:outline-none active:cursor-grabbing hover:[&>span]:bg-primary focus-visible:[&>span]:bg-primary",
                      // INFO: DESIGN.md § 7.5. The hit box past the row: 8px up into the composer's own bottom padding, which takes no pointer, and 4px down into the menu bar's top margin.
                      "before:absolute before:inset-x-0 before:-top-2 before:-bottom-1 before:content-['']",
                    )}
                    type="button"
                    aria-expanded={emoticonSheet.size === "expanded"}
                    aria-label={
                      emoticonSheet.size === "expanded"
                        ? "이모티콘 창 줄이기"
                        : "이모티콘 창 늘리기"
                    }
                    {...emoticonSheet.handleProps}
                  >
                    <span className="block h-1.5 w-12 rounded-full bg-hairline-strong" />
                  </button>
                  <EmoticonPicker
                    isOpen={isEmoticonPanelOpen}
                    focusRequest={pickerFocusRequest}
                    searchRequest={emoticonSearch}
                    revealRequest={emoticonReveal}
                    menuRequest={menuRequest}
                    suggestedSearchQuery={suggestedEmoticonSearchQuery}
                    onSearchTabChange={reportEmoticonSearchTab}
                    onSearchFieldFocus={emoticonSheet.expand}
                    onSelect={stageEmoticon}
                    onQuickSend={sendStagedEmoticon}
                    onInsert={insertEmoticon}
                    onDeleteLast={deleteLastComposerUnit}
                  />
                </div>
              )}
            </div>
          </div>
          {/* WARN: REQUIREMENTS.md § 8.6. Outside the hidden stack, or the inset goes with the composer and the search bar sits `--bar-lift` lower than the strip it swaps for (DESIGN.md § 6.8.). */}
          {/* WARN: A real `height` and never a `0fr`→`1fr` grid track. Mid-transition Chrome sizes such a track's container taller than the track it resolved, and the strip below the bottom-anchored sheet is a gap that opens and shuts. */}
          {/* INFO: § 13.6. An empty spacer that only ever moves inset ↔ rest — the drawn sheet below is absolute, so expanding it moves nothing here. */}
          {/* WARN: § 13.6. It has no transition of its own: the room eases `--chat-composer-spacer` itself, so this box, the list's trailing spacer and the chat screen's height are three readings of one animation rather than three animations to keep in step. */}
          <div ref={composerSpacerRef} className="h-(--chat-composer-spacer)" />
        </div>
      </div>
      <ActionSheet
        isOpen={actionTarget !== null}
        items={buildActionItems()}
        header={{ title: "메시지" }}
        anchorRef={menuAnchorRef}
        anchorPoint={menuAnchorPointRef.current ?? undefined}
        presentation="menu"
        reactionSlot={
          actionTarget && !actionTarget.isDeleted ? (
            <ReactionBar
              activeEmojis={
                actionTarget.reactions
                  ?.filter((r) => r.userId === currentUserId && r.reactionType === "emoji")
                  .map((r) => r.emoji!) ?? []
              }
              onSelectEmoji={(emoji) => {
                const targetId = actionTarget.id;
                setActionTarget(null);
                void handleReaction(targetId, { reactionType: "emoji", emoji });
              }}
              onOpenMiniSheet={() => {
                const targetId = actionTarget.id;
                setActionTarget(null);
                setMiniEmoticonTargetId(targetId);
              }}
            />
          ) : undefined
        }
        onClose={() => setActionTarget(null)}
      />
      <MiniEmoticonSheet
        isOpen={miniEmoticonTargetId !== null}
        messageId={miniEmoticonTargetId}
        activeEmojis={
          miniEmoticonTargetId
            ? (messages
                .find((m) => m.id === miniEmoticonTargetId)
                ?.reactions?.filter((r) => r.userId === currentUserId && r.reactionType === "emoji")
                .map((r) => r.emoji!) ?? [])
            : []
        }
        activeEmoticonItemIds={
          miniEmoticonTargetId
            ? (messages
                .find((m) => m.id === miniEmoticonTargetId)
                ?.reactions?.filter(
                  (r) => r.userId === currentUserId && r.reactionType === "emoticon",
                )
                .map((r) => r.emoticonItemId!) ?? [])
            : []
        }
        onSelectReaction={(reaction) => {
          if (miniEmoticonTargetId) {
            void handleReaction(miniEmoticonTargetId, reaction);
          }
        }}
        onClose={() => setMiniEmoticonTargetId(null)}
      />
      <ExpandedBodySheet
        body={expandedBody}
        searchQuery={searchQuery}
        onClose={() => setExpandedBody(null)}
      />
      <ShortcutHelp isOpen={isShortcutHelpOpen} onClose={() => setIsShortcutHelpOpen(false)} />
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
          description: toDeleteWarning(confirmingDeleteId),
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
      {/* INFO: REQUIREMENTS.md § 8.1. Neither answer is destructive, so both buttons are ordinary — the § 7.4. modal is used here for the choice it frames, not for a warning. */}
      <Modal
        isOpen={isChoosingBundle}
        header={{ title: bundleCopy.title, description: bundleCopy.description }}
        onClose={() => setIsChoosingBundle(false)}
      >
        <div className="flex gap-xs">
          <Button className="flex-1" variant="secondary" onClick={() => saveBundle(false)}>
            {bundleCopy.only}
          </Button>
          <Button className="flex-1" haptic onClick={() => saveBundle(true)}>
            모두 저장
          </Button>
        </div>
      </Modal>
      <MediaPickerSheet
        isOpen={isPickerOpen}
        hasFileRow
        onClose={() => setIsPickerOpen(false)}
        onRecordVoice={() => setIsRecording(true)}
        onAddEvent={onAddEvent}
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
      {mediaTrack.viewer && (
        <MediaViewer
          cells={mediaTrack.viewer.cells}
          initialIndex={mediaTrack.viewer.index}
          deletion={buildViewerDelete(mediaTrack.viewer.owners)}
          // INFO: DESIGN.md § 7.10. 보관함's own glyph, the one its tab carries — the mirror of 대화에서 보기's `MessageCircle`, and neither is a grid.
          jump={{ label: "보관함에서 보기", Icon: Archive, onSelect: openInArchive }}
          // INFO: REQUIREMENTS.md § 8.1. 채팅's track is a window and this is what extends it; 보관함 leaves the prop unset (§ 10.).
          paging={mediaTrack.paging}
          // INFO: DESIGN.md § 4.7.3. The return journey — the slide collapses back into its bubble cell wherever the room still has one on screen, and fades where it stands otherwise.
          findMorphOrigin={findChatMediaCell}
          backgroundColor={viewerBackgroundColor}
          onOpenMessage={openBubble}
          onDownload={askToSaveBundle}
          onClose={mediaTrack.close}
          onShare={(mediaId) => void sharing.share([mediaId])}
          onSave={(mediaId) => void sharing.save([mediaId])}
          onApplyPhoto={applyPhoto.open}
        />
      )}
      {/* INFO: REQUIREMENTS.md § 12.1. Mounted outside the viewer conditional above, so dismissing the viewer cannot unmount the sheet mid-write — `useApplyPhoto` returns the two halves separately for exactly this. */}
      {applyPhoto.sheet}
      {/* INFO: REQUIREMENTS.md § 9.2. Last in the tree, so it covers the composer and the pill as well as the history — a drag reads as being over the conversation, not over whichever strip it happens to be crossing. */}
      <FileDropOverlay isActive={fileDrop.isDropping} label="여기에 놓으면 첨부돼요" />
    </div>
  );

  /**
   * REQUIREMENTS.md § 8.6.1. A send from a jumped-away window has to land somewhere
   * the sender can see it, and the only place that is true is the live edge.
   *
   * WARN: The pin is the other half of it and nothing else in the room would make
   * it. `returnToLive` replaces the window whole rather than appending, so the
   * follow keyed on the tail row sees no append to follow — and § 8.3.'s open park
   * was claimed by a real gesture long before a jump was ever made. Without this the
   * newest page lands at whatever offset the jumped window happened to leave behind.
   *
   * WARN: A frame later, as § 8.6.1.'s jump is: the virtualizer only takes the replaced window on the render that follows the commit, so a pin made in this call stack resolves against the measurements of a window that is gone.
   *
   * WARN: And only on a restore that landed. `returnToLive` swallows a refused fetch and declines a superseded generation, both of which leave the jumped window up — pinning anyway drags the reader off the history they were on, and a jump made while this was in flight is positioned and then overwritten a frame later.
   */
  async function goLiveForSend() {
    if (!hasNewer) {
      return;
    }

    if (await returnToLive()) {
      requestAnimationFrame(pinToBottom);
    }
  }

  /**
   * INFO: REQUIREMENTS.md § 13.6. An emoticon and attachments are mutually exclusive in the composer — each bubble is one or the other (§ 6.), and staging both would promise a single send the schema has no row for.
   */
  function stageEmoticon(emoticon: Emoticon) {
    selection.clear();
    setStagedEmoticon(emoticon);
    clearTimeout(collapseTimerRef.current);

    if (emoticonSheet.size === "expanded") {
      collapseTimerRef.current = setTimeout(emoticonSheet.collapse, DOUBLE_TAP_WINDOW);
    }
  }

  /**
   * INFO: REQUIREMENTS.md § 13.6. A double tap in the picker skips the preview. The first tap already staged it, so this only takes it back off the composer and sends.
   */
  function sendStagedEmoticon(emoticon: Emoticon) {
    // INFO: § 13.6. Sending never resizes the sheet; the stage a frame ago had armed this.
    clearTimeout(collapseTimerRef.current);
    void goLiveForSend();
    setStagedEmoticon(null);
    // INFO: § 13.6. Never a mini — `handleSelect` inserts one into the draft rather than staging it, so no quick send can reach here with one.
    rememberEmoticon(emoticon.id, "emoticon");
    if (!soundSend(sendEmoticon(emoticon, replyTarget, notifyMode), emoticon)) {
      playMessageSound("sent");
    }
    // INFO: § 13.8. This path never goes through `submit`, so the field is still holding the word that found this emoticon — the composer clears it if that is all it holds.
    setKeywordConsumeToken((token) => token + 1);
    // WARN: § 13.8. The word is spent, the search is not. `emoticonSearch` deliberately stands, so the panel is still on the results this emoticon came from — sending one of a row of related pictures is the reason to have searched at all, and dropping back to the remembered pack means finding the word again for every one after the first.
    searchedWordRef.current = null;
    setReplyTarget(null);
    // WARN: DESIGN.md § 6.7. Through the state and not the ref alone — `readScrollEdges` only reports a change from the ref, so a ref set here by itself leaves the pill standing after the send has already landed at the bottom.
    handleAtBottomChange(true);
    pinToBottom();
    requestAnimationFrame(pinToBottom);
  }

  async function stageMedia(files: File[]) {
    setStagedEmoticon(null);
    await selection.add(files);
  }

  /**
   * INFO: REQUIREMENTS.md § 9.3. A recording is sent outright rather than staged
   * into the tray. `useMediaSelection` holds one list that `toBubbles` splits by
   * kind, so a staged recording would sit beside photos competing for a § 6. row it
   * cannot share — and 완료 already reads as the commitment a tray exists to defer.
   *
   * WARN: It goes through `sendMedia` rather than a path of its own. That is where
   * the § 9. upload, the per-bubble progress, the § 8.5. retry and the one delivery
   * queue live, and a second implementation of any of them would drift.
   */
  function sendVoice(recording: VoiceRecording) {
    // INFO: REQUIREMENTS.md § 8.6.1. A send from a jumped-away window has to land somewhere the sender can see it, and the only place that is true is the live edge.
    if (hasNewer) {
      void returnToLive();
    }

    soundSubmit(sendMedia([toVoiceDraft(recording)], replyTarget, false, notifyMode));
    setReplyTarget(null);
  }

  /**
   * INFO: The attachments go first, then the text, so a caption reads under what it belongs to — and the emoticon last, so the quote and the words stay together on one bubble (REQUIREMENTS.md § 8.10.).
   *
   * WARN: The order survives because `useSendMessage` delivers on one promise chain. Firing these in parallel would let the text win the race for `messages.id` and land above them on every other client and every reload.
   */
  function submit(text: string, emoticons: ComposerEmoticon[]) {
    // WARN: REQUIREMENTS.md § 8.5. Ahead of everything below, and it returns. An AI question sends only its text — no staged emoticon, no tray, no reply quote — through the ordinary text path.
    if (aiSelection.isSelecting) {
      submitAiQuestion(text);

      return;
    }

    // WARN: REQUIREMENTS.md § 8.13. Ahead of everything below, and it returns. A correction sends nothing — the staged quote, the tray and the emoticon all belong to a message that is not being composed, and falling through would post them beside the edit.
    if (editingId !== null) {
      void applyEdit(editingId, text, emoticons);

      return;
    }

    void goLiveForSend();

    // WARN: REQUIREMENTS.md § 8.10. Consumed by the first bubble only. Attachments, then text, then emoticon is the order they are queued in, and a quote repeated over three of them says the same thing three times.
    let quote = replyTarget;
    let hasSounded = false;
    let hasSent = false;

    const take = () => {
      const taken = quote;

      quote = null;

      return taken;
    };

    let mediaClientMsgIds: string[] = [];

    if (selection.drafts.length > 0) {
      mediaClientMsgIds = sendMedia(selection.takeAll(), take(), false, notifyMode);
      hasSent = true;
    }

    // WARN: REQUIREMENTS.md § 13.8. A draft that is nothing but the word the emoticon was found by was a search term, not a message — sending it would put 고민 in the conversation beside the picture it was only ever used to reach. Anything else keeps § 13.6.'s second bubble.
    if (text.trim() && !isConsumedByEmoticonSearch(text)) {
      const soloId = toSoloInlineEmoticonId({
        text,
        inlineEmoticonItemIds: emoticons.map(({ id }) => id),
      });
      const solo = soloId ? emoticons.find(({ id }) => id === soloId) : undefined;

      // WARN: § 13.6. The minis in the draft are recorded at the send too, and `"mini"` is read off the payload rather than off the menu they were picked from: § 2.2. carries a mini as a fragment of this `text` and never as `messages.emoticon_item_id`, so nothing else can be in here.
      emoticons.forEach((emoticon) => rememberEmoticon(emoticon.id, "mini"));
      // WARN: § 8.3. Published before the send, or the optimistic bubble's own emoticons are absent from the map the estimate reads and it prices the row without them — a correction on every send, which is the drift this estimate exists to avoid. The echo publishes the same entries again and they merge.
      rememberInlineEmoticons(toInlineEmoticonMap(emoticons));
      hasSounded = soundSend(send(text, emoticons, take(), notifyMode), solo) || hasSounded;
      hasSent = true;
    }

    if (stagedEmoticon) {
      // INFO: REQUIREMENTS.md § 13.6. 최근 사용 is recorded here rather than at the pick, so an emoticon staged and then abandoned never enters the list.
      rememberEmoticon(stagedEmoticon.id, "emoticon");
      hasSounded =
        soundSend(sendEmoticon(stagedEmoticon, take(), notifyMode), stagedEmoticon) || hasSounded;
      setStagedEmoticon(null);
      hasSent = true;
    }

    // INFO: § 13.6. One 전송음 for the whole submit, and only where no emoticon in it sounded — the shared player would cut that off.
    if (hasSent && !hasSounded) {
      soundSubmit(mediaClientMsgIds);
    }

    // WARN: § 13.8. The word is spent here, and the search is left standing — see `sendStagedEmoticon`.
    searchedWordRef.current = null;
    setReplyTarget(null);
    handleAtBottomChange(true);
    pinToBottom();
    requestAnimationFrame(pinToBottom);
  }

  /** REQUIREMENTS.md § 8.5. The composer's own AI toggle — the § 8.14. `⌥1`/`⌃E`-style panel toggles all read the state that is on screen, and this is that pattern's one entry and exit. */
  function toggleAiMode() {
    if (aiSelection.isSelecting) {
      aiSelection.exit();
    } else {
      aiSelection.enter();
      focusComposer();
    }
  }

  /**
   * REQUIREMENTS.md § 8.15. A staged tray or emoticon goes first, as ordinary
   * sends — same bubbles, same upload/queue/optimistic rules `submit` uses — then
   * the question, exactly as an ordinary text send: optimistic bubble, retry
   * affordance, dedup on echo. `pendingAiQuestionsRef` holds the selected context
   * and the attachment `clientMsgId`s until `handleMessageSent` reports every one
   * of those sends has actually landed.
   *
   * INFO: § 8.15. Sending leaves AI 질문 모드 up, selection and all — a follow-up question is the ordinary next move, and the composer's own toggle is the way out.
   */
  function submitAiQuestion(text: string) {
    const messageIds = [...aiSelection.selected].sort(compareId);

    void goLiveForSend();

    // INFO: REQUIREMENTS.md § 16.1., § 16.2. Snapshotted once for the whole question — the same value seeds `pendingAiQuestionsRef` below.
    const isOnlyMe = notifyMode === "onlyMe";
    const attachmentClientMsgIds: string[] = [];
    let hasSounded = false;

    if (stagedEmoticon) {
      rememberEmoticon(stagedEmoticon.id, "emoticon");

      const emoticonClientMsgId = sendEmoticon(stagedEmoticon, null, notifyMode);

      attachmentClientMsgIds.push(emoticonClientMsgId);
      hasSounded = soundSend(emoticonClientMsgId, stagedEmoticon);
      setStagedEmoticon(null);
    }

    // INFO: REQUIREMENTS.md § 8.15. `isAiAttachment = true` tells the server to stamp `expires_at` so the bytes are cleaned up after one day instead of being kept indefinitely.
    const mediaClientMsgIds =
      selection.drafts.length > 0 ? sendMedia(selection.takeAll(), null, true, notifyMode) : [];

    attachmentClientMsgIds.push(...mediaClientMsgIds);

    const clientMsgId = send(text, [], null, notifyMode);

    if (clientMsgId === null) {
      return;
    }

    pendingAiQuestionsRef.current.set(clientMsgId, {
      text: text.trim(),
      messageIds,
      // INFO: Snapshotted at send time — a picker changed after this question was queued must not retarget a question already on its way out.
      model: llmAgentChoice.model,
      thinking: llmAgentChoice.thinking,
      onlyMe: isOnlyMe,
      attachmentClientMsgIds,
      resolvedAttachmentIds: [],
    });
    attachmentClientMsgIds.forEach((attachmentClientMsgId) =>
      aiAttachmentQuestionRef.current.set(attachmentClientMsgId, clientMsgId),
    );

    if (!hasSounded) {
      soundSubmit(mediaClientMsgIds);
    }

    handleAtBottomChange(true);
    pinToBottom();
    requestAnimationFrame(pinToBottom);
  }

  /**
   * REQUIREMENTS.md § 8.5. Asked only once the question's own `POST /api/messages`
   * has landed — the streaming footer picks the run up from the SSE `queued`/`start`
   * events it publishes, with no further state kept here.
   *
   * WARN: `holdAwake` covers this request alone, not the wait for the question to
   * send — that POST already holds its own awake through `useSendMessage`'s
   * `enqueue`, and chaining the two into one hold would pin the device awake for as
   * long as a failed question sits waiting on a manual retry.
   */
  async function requestAiAnswer(
    questionClientMsgId: string,
    question: {
      text: string;
      messageIds: MessageId[];
      model: Nullable<string>;
      thinking: Nullable<LlmThinkingLevel>;
      onlyMe: boolean;
    },
  ) {
    const release = holdAwake();

    try {
      const response = await request(CHAT_AI_PATH, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          streamId: randomId(),
          questionClientMsgId,
          question: question.text,
          messageIds: question.messageIds,
          // INFO: § 8.5. Omitted rather than `null` for 자동/기본 — the route's schema takes both as optional, and a `null` would be a value it has to refuse instead of a field it never sees.
          ...(question.model !== null && { model: question.model }),
          ...(question.thinking !== null && { thinking: question.thinking }),
          onlyMe: question.onlyMe,
        }),
      });

      if (response.ok && response.status === 201) {
        const payload = (await response.json().catch(() => null)) as Nullable<{
          message: ChatMessage;
          emoticons?: InlineEmoticonMap;
        }>;

        if (payload?.message) {
          rememberInlineEmoticons(payload.emoticons ?? {});
          receiveMessage(payload.message, "live");
        }
      } else if (!response.ok && response.status !== 502) {
        toast("AI 요청을 보내지 못했어요");
      }
    } catch {
      toast("AI 요청을 보내지 못했어요");
    } finally {
      release();
    }
  }

  /**
   * REQUIREMENTS.md § 13.6. My own emoticon sounds at the send, from its optimistic
   * row — the same one-row flag a live arrival takes, so the picture and the sound
   * start on one frame there too. Returns whether anything will sound.
   *
   * WARN: Only where the row certainly mounts, which is the live edge; anywhere else the sound plays alone, as the arrival's does.
   */
  function soundSend(clientMsgId: Nullable<string>, emoticon: Maybe<EmoticonSound>): boolean {
    if (!clientMsgId || !emoticon?.hasAudio) {
      return false;
    }

    if (isAtBottom && !hasNewer) {
      announceArrivalSound(clientMsgId, emoticon);
    } else {
      playEmoticonSound(emoticon);
    }

    return true;
  }

  /**
   * REQUIREMENTS.md § 13.6. The submit's own 전송음. A tray is held back until one of
   * its bubbles has actually landed — a § 9. upload puts seconds between the tap and
   * the send, where every other kind of message is sent by the time this returns.
   *
   * WARN: Keyed on the attachments alone, not on the caption queued behind them. `useSendMessage` delivers on one chain in queue order (§ 8.10.'s own comment on `submit`), so the text lands last — waiting on it would put the sound after the upload it is meant to end rather than at it.
   */
  function soundSubmit(mediaClientMsgIds: string[]) {
    if (mediaClientMsgIds.length === 0) {
      playMessageSound("sent");

      return;
    }

    pendingSendSoundsRef.current.push(new Set(mediaClientMsgIds));
  }

  /**
   * INFO: § 8.5. 전송 취소, and the only way a bubble leaves without landing — so it is
   * also where a 전송음 `soundSubmit` is still holding for that bubble is released.
   *
   * INFO: § 13.6. Per bubble rather than per submit: a pick of twenty photos is three bubbles, and cancelling the first leaves the other two to sound as they land.
   */
  function cancelSend(clientMsgId: string) {
    pendingSendSoundsRef.current = pendingSendSoundsRef.current.filter((group) => {
      group.delete(clientMsgId);

      return group.size > 0;
    });
    cancel(clientMsgId);
  }

  /** INFO: REQUIREMENTS.md § 13.8. Only ever true beside an emoticon — on its own the word is the message the user typed. */
  function isConsumedByEmoticonSearch(text: string): boolean {
    return stagedEmoticon !== null && text.trim() === searchedWordRef.current;
  }

  /**
   * WARN: REQUIREMENTS.md § 13.8. Closing the panel is what releases the search, and
   * every route out of it has to come through here. The picker never unmounts
   * (`hasMountedEmoticonPanel` is one-way), so a request left standing keeps it forced
   * onto the search tab — which reopens on a finished search and, worse, latches the
   * § 13.6. keyboard exemption on for good.
   */
  // WARN: § 13.8. The latch is dropped here and only here. It is otherwise released by the keyboard alone, and a keyboard the composer took over from 검색's field never goes down — left held, the screen stays at its resting height with the composer under the keys.
  // INFO: § 13.6. On a coarse pointer the sheet stays up until the keys have risen over it, which is the closing swap; a fine pointer has no keys coming and closes at once.
  function yieldToComposer() {
    setIsEmoticonSearchExempt(false);
    setIsEmoticonSearchTab(false);

    if (isFinePointer || !isEmoticonPanelOpen) {
      closeEmoticonPanel();

      return;
    }

    setSheetSwap("closing");
  }

  function closeEmoticonPanel() {
    clearTimeout(collapseTimerRef.current);
    setSheetSwap(null);
    setIsEmoticonPickerOpen(false);
    setEmoticonSearch(null);
    searchedWordRef.current = null;
    setEmoticonReveal(null);
  }

  /**
   * REQUIREMENTS.md § 8.14. The composer's toggle, which opens the panel **and puts
   * focus inside it** — the half a pointer open was missing.
   *
   * WARN: Toggled against what is on screen, not the flag behind it. The flag can be true while the keyboard suppresses the panel (§ 13.6.), and inverting it there closes a panel the user is asking to open.
   * INFO: `viaKeyboard: false`, because this is the pointer route and the rings belong to the keyboard one. A user who reached the toggle with `Tab` and pressed `Enter` lands unringed and gets them back on their first arrow key, through the panel's own `noteKeyboardUse`.
   */
  function openEmoticonPanel() {
    if (isEmoticonPanelOpen) {
      // WARN: § 13.6. `yieldToComposer` and never `closeEmoticonPanel` — the button's own tap focuses the field first, so a close here cancels the swap that focus armed and the composer drops the sheet's height before the keys have covered it.
      yieldToComposer();

      return;
    }

    // INFO: § 13.6. With the keys up the sheet opens under them at once and they slide off it, rather than waiting for them to be gone and then rising.
    if (isKeyboardOpen) {
      setSheetSwap("opening");
    }

    setIsEmoticonPickerOpen(true);
    requestPickerFocus(false);
  }

  // INFO: REQUIREMENTS.md § 8.14. One place the token is bumped from, so no caller can ask for the focus and forget to say which hand asked.
  function requestPickerFocus(viaKeyboard: boolean) {
    setPickerFocusRequest((request) => ({ token: request.token + 1, viaKeyboard }));
  }

  /**
   * REQUIREMENTS.md § 8.14. `Escape` — the panel away and the caret back in the
   * field, which is the only exit a keyboard has from the picker.
   *
   * WARN: The field's own invariant, beside the hook's `isCovered`: this stack is
   * `hidden` and `inert` for the length of a § 8.6. search, and `focus()` on an inert
   * field silently does nothing at all rather than failing.
   */
  function focusComposer() {
    if (isSearching) {
      return;
    }

    setComposerFocusRequest((token) => token + 1);
  }

  /**
   * REQUIREMENTS.md § 8.14. A character typed into the conversation, taken by the field
   * it was meant for.
   *
   * WARN: The node and not `focusComposer`'s token, and the difference is the whole
   * behaviour. A token is answered an effect later, by which time this `keydown`'s
   * default action has been spent on `body` and the character is gone. Reaching the
   * field inside the handler moves the focus first, so the engine inserts into it —
   * which is also why nothing here prevents the event.
   *
   * WARN: `reachesComposer` and not the hook's `isCovered`, which says the same thing
   * one commit later. That flag rides a passive effect, so between the render that
   * opens § 8.6.'s search and the effect that reports it, a keystroke arrives here with
   * the field already `hidden` and `inert` — and `focus()` on that is the silent no-op
   * `focusComposer` refuses for, with the character typed into nothing.
   *
   * INFO: Guarded on the pointer rather than on the keyboard flag. The behaviour is the
   * desktop's, where a stray key means someone at a keyboard is starting a message; on a
   * phone there is no key to strike until something has already been focused.
   *
   * INFO: `onFieldFocus` carries the rest — § 13.6.'s panel closes on the focus this
   * takes, exactly as it does for a click into the field.
   */
  function typeIntoComposer() {
    if (!reachesComposer()) {
      return;
    }

    focusWithoutPan(composerFieldRef.current);
  }

  /**
   * REQUIREMENTS.md § 8.14. ⌘V with nothing focused — the caret into the composer and
   * the clipboard's text with it. Answers whether it took the paste, which is what
   * spends its default action.
   *
   * WARN: Inserted through `execCommand` rather than by setting the value, and the
   * deprecation is known. It is the one insertion the field's own undo stack survives,
   * and it raises the `input` the composer is controlled by — a value written past that
   * would be a paste ⌘Z could not take back, and a draft React would overwrite on its
   * next render.
   *
   * INFO: Appended at the caret, which a field the reader has not touched puts at the
   * end of whatever was already drafted. Pasting into a room mid-draft adds to it
   * rather than replacing it, as pasting anywhere else would.
   */
  function pasteIntoComposer(text: string): boolean {
    const field = composerFieldRef.current;

    if (!reachesComposer() || !field) {
      return false;
    }

    focusWithoutPan(field);

    return document.execCommand("insertText", false, text);
  }

  /**
   * Whether a keystroke may reach the composer's field at all — the invariant
   * `focusComposer` refuses on, asked of the two routes that hold the node rather than
   * the token.
   *
   */
  function reachesComposer(): boolean {
    return isFinePointer && !isSearching;
  }

  /**
   * REQUIREMENTS.md § 8.14. `Escape` — one layer off the composer's stack, and the
   * caret back in the field either way.
   *
   * INFO: The open panel first and the staged emoticon second.
   */
  function peelComposerStack() {
    if (isSearching) {
      return;
    }

    // INFO: REQUIREMENTS.md § 8.5. Ahead of the panel below — an empty field asking AI a question has nothing else this key could mean. Left non-empty, Escape falls through to the room's ordinary layers instead of discarding a question mid-type.
    if (aiSelection.isSelecting && isComposerFieldEmpty()) {
      aiSelection.exit();

      return;
    }

    if (isEmoticonPanelOpen) {
      closeEmoticonPanel();
      focusComposer();

      return;
    }

    if (stagedEmoticon) {
      setStagedEmoticon(null);
      focusComposer();

      return;
    }

    // INFO: Through `focusComposer`, which carries the § 8.6. refusal.
    focusComposer();
  }

  // INFO: REQUIREMENTS.md § 8.5. Read off the field's own node rather than the composer's draft, which lives inside `MessageComposer` and never reaches the room.
  function isComposerFieldEmpty(): boolean {
    const field = composerFieldRef.current;

    if (field instanceof HTMLTextAreaElement) {
      return field.value.trim() === "";
    }

    return (field?.textContent ?? "").trim() === "";
  }

  /**
   * REQUIREMENTS.md § 8.14. `⌃E` — § 13.6.'s panel, opened on its remembered tab or
   * closed. It is the **only** key that closes it; the digits below choose a menu and
   * never do.
   *
   * INFO: With no menu request, the picker restores `ACTIVE_TAB_KEY`; a stored 미니 pack
   * therefore reopens in 미니 rather than falling back through 이모티콘's 최근 사용 tab.
   *
   * WARN: § 13.6. The blur is the same one the toggle button makes and for the same
   * reason: the panel is gated on the keyboard being down, and iOS lowers it for a blur
   * alone — a key press is not one, so without this the flag flips and the panel never
   * gets to act on it.
   */
  function toggleEmoticonPanel() {
    if (isEmoticonPanelOpen) {
      closeEmoticonPanel();
      focusComposer();

      return;
    }

    if (document.activeElement instanceof HTMLElement) {
      document.activeElement.blur();
    }

    setIsEmoticonPickerOpen(true);
    requestPickerFocus(true);
  }

  /**
   * REQUIREMENTS.md § 8.14. `⌃1` / `⌃2` / `⌃3` — § 13.6.'s panel on the menu the digit
   * names, opened if it is shut.
   *
   * WARN: A digit never closes the panel, so the digit of the menu already on screen
   * changes no menu — the request reaches a panel that is already there and already on
   * that menu, and `selectMenu` finds nothing to do. `⌃E` is the one key that closes.
   *
   * WARN: § 13.6. The blur is the same one the toggle button makes and for the same
   * reason: the panel is gated on the keyboard being down, and iOS lowers it for a blur
   * alone — a key press is not one, so without this the flag flips and the panel never
   * gets to act on it.
   *
   * WARN: § 8.13. The correction guard is needed for a reason that is easy to miss: the
   * composer refuses the 검색 digit while editing and therefore does not prevent it, so the press
   * falls straight through to this room — where the panel would stage a payload the edit
   * has no row to send, invisibly, since § 8.13. hides the tray that would have shown it.
   *
   * WARN: § 13.8. 검색's exemption is armed here rather than waited for. `isEmoticonPanelOpen` reads the flag in the same commit the panel is asked to open in, and the picker reports the tab an effect later — that frame is an unexempted panel opening against a keyboard still on its way down, which closes it again.
   */
  function selectEmoticonMenu(menu: EmoticonMenu) {
    if (isSearching || editingId !== null) {
      return;
    }

    if (document.activeElement instanceof HTMLElement) {
      document.activeElement.blur();
    }

    if (menu === "search") {
      setIsEmoticonSearchTab(true);
    }

    setMenuRequest((request) => ({ menu, token: (request?.token ?? 0) + 1 }));
    setIsEmoticonPickerOpen(true);
  }

  /**
   * REQUIREMENTS.md § 13. A mini from the picker, into the composer's draft rather than
   * staged — § 2.2. stores one as a fragment of a `text` message and never in
   * `messages.emoticon_item_id`.
   *
   * INFO: § 13.8. The name is the item's first keyword, which is all a mini has (§ 2.6.).
   */
  function insertEmoticon({ version, width, height, keywords, hasAudio, id }: Emoticon) {
    setInsertedEmoticon((request) => ({
      emoticon: { version, width, height, name: keywords[0] ?? null, hasAudio, id },
      token: (request?.token ?? 0) + 1,
    }));
    // INFO: § 13.6. The draft it lands in is under an expanded sheet.
    emoticonSheet.collapse();
  }

  // INFO: § 13. 미니's own 지우기 button — the composer takes it exactly as a Backspace on the field.
  function deleteLastComposerUnit() {
    setDeleteRequest((request) => ({ token: (request?.token ?? 0) + 1 }));
  }

  /**
   * REQUIREMENTS.md § 8.14. `⌥↑` / `⌥↓` — the conversation, a step at a time.
   *
   * WARN: `hasTakenScrollRef` is set by hand here. § 8.3.'s park is released by a real
   * gesture, and the listener that hears one is on the scroller — which a key pressed
   * with focus in the composer never reaches. Left unset, the next arrival would drag
   * the reader back to the live edge they had just scrolled away from.
   *
   * INFO: Smooth, and § 13.6.'s refusal of `behavior: "smooth"` does not reach here.
   * That one is about an animation running **across** the emoticon panel's collapse,
   * which changes the content size underneath it; this runs across nothing, and § 8.3.'s
   * prepend is held back until the scroller has been still for `SETTLE_DELAY` — so the
   * page that would change the content size lands after the animation rather than under
   * it.
   *
   * INFO: A repeat aborts the animation in flight and starts a new one from wherever it
   * had reached, so a held key reads as one glide rather than a queue of jumps that
   * outlives the press.
   */
  function scrollHistory(direction: -1 | 1) {
    const scroller = scrollerRef.current;

    if (!scroller) {
      return;
    }

    hasTakenScrollRef.current = true;
    scroller.scrollBy({
      top: scroller.clientHeight * HISTORY_SCROLL_STEP * direction,
      behavior: "smooth",
    });
  }

  /**
   * REQUIREMENTS.md § 13.9. 따라하기 — a tap on an emoticon in the conversation opens
   * the picker where that emoticon is, ready to be sent back.
   *
   * WARN: The field is blurred here, for the reason § 13.6.'s toggle blurs it: the
   * panel is gated on the keyboard being down, and iOS lowers the keyboard for a
   * blur alone — a tap on a `<button>` is not one, so a tap made while typing would
   * otherwise read as doing nothing at all.
   */
  function followEmoticon(emoticon: Emoticon) {
    if (document.activeElement instanceof HTMLElement) {
      document.activeElement.blur();
    }

    setEmoticonReveal({ emoticon, token: Date.now() });
    setIsEmoticonPickerOpen(true);
  }

  /**
   * REQUIREMENTS.md § 13.8. A word tapped in the composer opens the picker on its
   * search tab, already holding it.
   *
   * WARN: § 8.14. `⌃1` reaches this with an empty query where no word is underlined,
   * and an empty `searchedWordRef` is not a word the send may spend — `""` is what a
   * cleared draft trims to, so the next quick send would swallow whatever had been
   * typed since.
   */
  function openEmoticonSearch(query: string) {
    setEmoticonSearch({ query, token: Date.now() });
    searchedWordRef.current = query === "" ? null : query;
    // WARN: Set here as well as reported back by the picker's own effect. The gate above reads it in the same commit the panel is asked to open in, and waiting for the effect leaves one frame where the panel is open, the keyboard is still retracting and the exemption is not in yet — which closes it again.
    setIsEmoticonSearchExempt(true);
    setIsEmoticonSearchTab(true);
    setIsEmoticonPickerOpen(true);

    if (isKeyboardOpen) {
      setSheetSwap("opening");
    }
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

  function handleEmoticonSheetTransitionEnd(event: TransitionEvent<HTMLDivElement>) {
    if (event.target !== event.currentTarget || event.propertyName !== "transform") {
      return;
    }

    if (!isEmoticonPanelOpen) {
      setIsEmoticonSheetSettledClosed(true);
    }
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

    // WARN: § 13.6. A sheet step's spacer has already snapped in this commit while the FLIP's pin only lands in the pre-paint observer — read in that window, the edges publish a one-frame "left the bottom" that flashes the pill and poisons the FLIP gate.
    if (containerRef.current?.hasAttribute(SHEET_FLIP_ATTRIBUTE)) {
      return;
    }

    const distanceToEnd = element.scrollHeight - element.scrollTop - element.clientHeight;
    const atBottom = distanceToEnd <= AT_BOTTOM_THRESHOLD;

    if (atBottom !== isAtBottomRef.current) {
      handleAtBottomChange(atBottom);
    }

    const atTop = element.scrollTop <= 0;

    // WARN: Never an unguarded `setIsAtTop`. This runs from a render-scoped effect, so a same-value call still schedules while any other update is in flight — which is React's nested-update limit, thrown here rather than where the storm actually started.
    if (atTop !== isAtTopRef.current) {
      isAtTopRef.current = atTop;
      setIsAtTop(atTop);
    }
  }

  /**
   * WARN: Never call this from a render-scoped effect. Both loads commit messages, which renders, which would ask again — one page per render rather than one per landed page, and the room pages itself to the start of history with the main thread pinned the whole way.
   */
  function requestAdjacentPages() {
    const element = scrollerRef.current;

    if (!element) {
      return;
    }

    const isScrollable = element.scrollHeight > element.clientHeight;

    // INFO: REQUIREMENTS.md § 8.3. Only page older history if the list overflows the viewport and the user has scrolled up towards the top, OR if the list does not overflow the viewport at all (meaning the screen is not yet full, which happens in locally-filtered modes like 나에게만 보기).
    if ((hasTakenScrollRef.current || !isScrollable) && element.scrollTop <= LOAD_OLDER_THRESHOLD) {
      void loadOlder();
    }

    // INFO: REQUIREMENTS.md § 8.6.1. Downward paging exists for the jumped-away window alone; at the live edge `loadNewer` returns immediately.
    if (
      isScrollable &&
      element.scrollHeight - element.scrollTop - element.clientHeight <= AT_BOTTOM_THRESHOLD
    ) {
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

  /**
   * REQUIREMENTS.md § 8.5. The id `SelectableRow`'s check column toggles for a row —
   * `null` for a date divider and for a pending row, which has no server id yet.
   *
   * WARN: A withdrawn `message` row is refused too. `isSelectableMessage` is the same
   * `!isDeleted` test `useAiSelection`'s own auto-select folds in, kept as one function
   * so the two cannot drift into disagreeing about a tombstone.
   */
  function toSelectableMessageId(row: ChatRow): Nullable<MessageId> {
    switch (row.kind) {
      case "message":
      case "assistant":
        return isSelectableMessage(row.message) ? row.message.id : null;
      // INFO: A calendar notice — `buildChatRows` never gives this kind an `assistant_reply`, so it has no text an AI question could read.
      case "system":
      case "date":
      case "pending":
        return null;
    }
  }

  /**
   * REQUIREMENTS.md § 8.5. Whether `SelectableRow` should translate this row's
   * content for the gutter, rather than leaving its own reduced cap to do the
   * whole job.
   *
   * WARN: `mine` content is right-aligned (`MessageRow`'s own `isMine` column),
   * so a translate meant to make room on the *left* pushes it further past the
   * row's *right* edge instead — the cap reduction alone already opens the 40px
   * the check circle needs there. Every left-anchored row (`theirs`, the AI
   * answer, a system notice, a date divider) still translates, since those cross
   * the check column on the left and have no right edge to overflow.
   */
  function isTranslatedRow(row: ChatRow): boolean {
    switch (row.kind) {
      case "message":
        return !row.isMine;
      case "pending":
        // INFO: An optimistic bubble is always mine (§ 8.3.'s own comment on this row).
        return false;
      case "system":
      case "date":
      case "assistant":
        return true;
    }
  }

  function renderRow(row: ChatRow) {
    switch (row.kind) {
      case "date":
        return <DateDivider dayKey={row.dayKey} />;
      case "system":
        return (
          <SystemNotice
            message={row.message}
            sender={participantById.get(row.message.senderId)}
            onOpenEvent={onOpenEvent}
          />
        );
      case "assistant": {
        // INFO: REQUIREMENTS.md § 8.15. The question the answer was asked with — the same field a reply carries, resolved by `listReplyPreviews` for either kind.
        const question = row.message.replyTo;

        return (
          <AssistantMessageRow
            message={row.message}
            isSelecting={aiSelection.isSelecting}
            replyTo={question}
            replyToHeading={question ? toQuoteHeadingFor(question) : undefined}
            isCollapsed={row.isCollapsed}
            reactions={row.message.reactions ?? []}
            currentUserId={currentUserId}
            onOpenReply={
              question ? () => void jumpToMessage(question.id, { flash: true }) : undefined
            }
            onLongPress={(anchor, point) => {
              if (document.activeElement instanceof HTMLElement) {
                document.activeElement.blur();
              }
              menuAnchorRef.current = anchor;
              menuAnchorPointRef.current = point;
              setActionTarget(row.message);
            }}
            onShare={
              canShareMessage(row.message) ? () => void shareMessage(row.message) : undefined
            }
            onExpand={() => expandBody(row.message, true)}
            onFollowUp={() => stageReply(row.message)}
            onToggleReaction={(reaction) => void handleReaction(row.message.id, reaction)}
            onUnfold={() => void toggleCollapse(row.message.id)}
          />
        );
      }
      case "pending": {
        const cells = toCellsFromDrafts(row.pending.media);

        return (
          <MessageRow
            text={row.pending.text}
            media={cells}
            emoticon={row.pending.emoticon}
            inlineEmoticonItemIds={row.pending.inlineEmoticons.map(({ id }) => id)}
            // WARN: § 8.3. Drawn from what the send is carrying rather than from the room's map, which only fills once the echo lands — read from there the optimistic bubble would reserve nothing and re-measure the moment it arrives.
            inlineEmoticons={toInlineEmoticonMap(row.pending.inlineEmoticons)}
            replyTo={row.pending.replyTo}
            progress={row.pending.progress}
            encodingIndex={row.pending.encodingIndex}
            encodeProgress={row.pending.encodeProgress}
            createdAt={row.pending.createdAt}
            sender={participantById.get(currentUserId)}
            isMine
            // INFO: REQUIREMENTS.md § 16.1. The live mode rather than a field on `PendingMessage` — an optimistic bubble is on screen only for as long as its own send is in flight, and `POST /api/messages` reads the same cookie at that same moment.
            isOnlyMe={notifyMode === "onlyMe"}
            isFirstOfGroup={row.isFirstOfGroup}
            isLastOfGroup={row.isLastOfGroup}
            hasNotch={row.hasNotch}
            isSelecting={aiSelection.isSelecting}
            status={row.pending.status}
            awaitsArrivalSound={row.pending.clientMsgId === arrivalSoundId}
            replyToHeading={
              row.pending.replyTo ? toQuoteHeadingFor(row.pending.replyTo) : undefined
            }
            onExpand={() =>
              setExpandedBody({
                isMarkdown: false,
                senderName: participantById.get(currentUserId)?.name ?? "알 수 없음",
                createdAt: row.pending.createdAt,
                text: row.pending.text ?? "",
                inlineEmoticonItemIds: row.pending.inlineEmoticons.map(({ id }) => id),
                inlineEmoticons: toInlineEmoticonMap(row.pending.inlineEmoticons),
              })
            }
            onFollowEmoticon={toFollowEmoticon(row.pending.emoticon)}
            onArrivalSoundReady={() => settleArrivalSound(row.pending.clientMsgId)}
            onRetry={() => retry(row.pending.clientMsgId)}
            onCancel={() => cancelSend(row.pending.clientMsgId)}
          />
        );
      }
      case "message": {
        // WARN: REQUIREMENTS.md § 8.13. A withdrawn message is a tombstone and nothing else — no payload to draw, no quote to follow, and not one of the affordances below. It is deliberately an early return rather than a pile of conditions on the row that follows.
        if (row.message.isDeleted) {
          return (
            <MessageRow
              text={null}
              inlineEmoticonItemIds={NO_INLINE_EMOTICONS}
              inlineEmoticons={NO_INLINE_EMOTICON_MAP}
              createdAt={row.message.createdAt}
              sender={participantById.get(row.message.senderId)}
              isMine={row.isMine}
              isOnlyMe={row.message.onlyMe}
              isFirstOfGroup={row.isFirstOfGroup}
              isLastOfGroup={row.isLastOfGroup}
              hasNotch={row.hasNotch}
              isDeleted
              isHighlighted={row.message.id === highlightedId}
              isSelecting={aiSelection.isSelecting}
              status="sent"
            />
          );
        }

        const cells = toCellsFromMedia(row.message.media, row.message.onlyMe);
        // INFO: REQUIREMENTS.md § 8.13. A withdrawn parent is still reachable — it keeps its place as a tombstone, so the jump lands on where the message was instead of failing.
        const quoted = row.message.replyTo;

        return (
          <MessageRow
            text={row.message.text}
            media={cells}
            emoticon={row.message.emoticon}
            inlineEmoticonItemIds={row.message.inlineEmoticonItemIds}
            // WARN: REQUIREMENTS.md § 8.3. The same map `readInlineEmoticon` reads. Two sources and the estimate and the bubble disagree about the box by construction.
            inlineEmoticons={inlineEmoticons}
            replyTo={quoted}
            replyToHeading={quoted ? toQuoteHeadingFor(quoted) : undefined}
            createdAt={row.message.createdAt}
            sender={participantById.get(row.message.senderId)}
            isMine={row.isMine}
            isOnlyMe={row.message.onlyMe}
            isSilent={row.message.silent}
            isFirstOfGroup={row.isFirstOfGroup}
            isLastOfGroup={row.isLastOfGroup}
            hasNotch={row.hasNotch}
            unreadCount={countUnreadReaders(row.message)}
            readerTotal={readerCursors.length}
            isEdited={row.message.editedAt !== null}
            isHighlighted={row.message.id === highlightedId}
            searchQuery={searchQuery}
            status="sent"
            isSelecting={aiSelection.isSelecting}
            awaitsArrivalSound={row.message.id === arrivalSoundId}
            isCollapsed={row.message.isCollapsed}
            reactions={row.message.reactions ?? []}
            currentUserId={currentUserId}
            onShare={
              canShareMessage(row.message) ? () => void shareMessage(row.message) : undefined
            }
            onOpenMedia={(index, origin) =>
              openAttachment(cells, index, row.message.id, row.message.senderId, origin)
            }
            onLongPress={(anchor, point) => {
              if (document.activeElement instanceof HTMLElement) {
                document.activeElement.blur();
              }
              menuAnchorRef.current = anchor;
              menuAnchorPointRef.current = point;
              setActionTarget(row.message);
            }}
            onToggleReaction={(reaction) => void handleReaction(row.message.id, reaction)}
            onOpenReply={quoted ? () => void jumpToMessage(quoted.id, { flash: true }) : undefined}
            onFollowEmoticon={toFollowEmoticon(row.message.emoticon)}
            onArrivalSoundReady={() => settleArrivalSound(row.message.id)}
            onExpand={() => expandBody(row.message, false)}
            onUnfold={() => void toggleCollapse(row.message.id)}
            onReply={() => stageReply(row.message)}
          />
        );
      }
    }
  }

  /**
   * REQUIREMENTS.md § 8.17. Folds a message away for both readers, or unfolds it.
   *
   * WARN: The local unfold is dropped on the way in. A row folded again while this
   * reader was holding it open would arrive folded and be drawn open, since the set
   * wins over the wire — and there would be nothing left to tap to fix it.
   */
  async function toggleCollapse(id: MessageId) {
    // WARN: REQUIREMENTS.md § 8.17. Resolved here and never captured. The action sheet holds the message it was opened on, and a fold that read *that* would toggle against a state two taps old — which is what left a bubble folded after 펼치기.
    const message = messages.find((entry) => entry.id === id);

    if (!message) {
      return;
    }

    const isCollapsed = !message.isCollapsed;

    // INFO: § 8.13.'s own local apply — `PATCH` answers 204, and the echo confirms a moment later.
    replaceMessage({ ...message, isCollapsed });

    try {
      await requestMessageCollapse(id, isCollapsed);
    } catch {
      replaceMessage(message);
      toast.error(isCollapsed ? "메시지를 접지 못했어요" : "메시지를 펼치지 못했어요");
    }
  }

  async function handleReaction(messageId: MessageId, reaction: ReactionPayload) {
    const target = messages.find((entry) => entry.id === messageId);
    if (!target) {
      return;
    }

    const isMatch = (r: MessageReaction) =>
      r.userId === currentUserId &&
      r.reactionType === reaction.reactionType &&
      ((reaction.reactionType === "emoji" && r.emoji === reaction.emoji) ||
        (reaction.reactionType === "emoticon" && r.emoticonItemId === reaction.emoticonItemId));

    const existing = (target.reactions ?? []).find(isMatch);
    let nextReactions = target.reactions ? [...target.reactions] : [];

    if (existing) {
      nextReactions = nextReactions.filter((r) => !isMatch(r));
    } else {
      nextReactions.push({
        messageId,
        userId: currentUserId,
        reactionType: reaction.reactionType,
        emoji: reaction.reactionType === "emoji" ? reaction.emoji : null,
        emoticonItemId: reaction.reactionType === "emoticon" ? reaction.emoticonItemId : null,
      });
    }

    replaceMessage({ ...target, reactions: nextReactions });

    try {
      await sendMessageReaction(messageId, reaction);
    } catch {
      replaceMessage(target);
      toast.error("리액션을 남기지 못했어요");
    }
  }

  // INFO: REQUIREMENTS.md § 8.16. A landed row draws its emoticons from the page's own map, whichever of the two kinds of bubble the tap came from — only § 8.5.'s outbox carries its own.
  function expandBody(message: ChatMessage, isMarkdown: boolean) {
    setExpandedBody({
      isMarkdown,
      senderName: toExpandedSenderName(message),
      createdAt: message.createdAt,
      text: message.text ?? "",
      inlineEmoticonItemIds: message.inlineEmoticonItemIds,
      inlineEmoticons,
    });
  }

  // INFO: REQUIREMENTS.md § 8.16. The sheet is titled by whoever spoke — a § 8.15. answer by its model name when known (falling back to the provider's own 별명), and any other system row by 시스템.
  function toExpandedSenderName(message: ChatMessage): string {
    if (message.type !== "system") {
      return participantById.get(message.senderId)?.name ?? "알 수 없음";
    }

    if (!message.llmProvider) {
      return "시스템";
    }

    return message.llmModel ?? toLlmProviderName(message.llmProvider);
  }

  // INFO: § 8.3. What an optimistic bubble draws from — the composer's own emoticons, in the shape the sent row reads from the page's map.
  function toInlineEmoticonMap(emoticons: readonly ComposerEmoticon[]): InlineEmoticonMap {
    return Object.fromEntries(
      emoticons.map(({ width, height, version, name, hasAudio, id }) => [
        id,
        { width, height, version, name: name ?? null, hasAudio, isDeleted: false },
      ]),
    );
  }

  // INFO: REQUIREMENTS.md § 13.9. A row with no emoticon in it hands the bubble nothing, so a text row's tap is unchanged.
  function toFollowEmoticon(emoticon: Optional<Nullable<Emoticon>>) {
    return emoticon ? () => followEmoticon(emoticon) : undefined;
  }

  // INFO: REQUIREMENTS.md § 9.1. A file bubble carries no photos to warn about losing, and § 6. keeps a bubble's attachments all of one kind — so the first one names them all.
  function toDeleteWarning(messageId: Nullable<MessageId>): string {
    // INFO: The modal stays mounted, so this prop is evaluated on every render of the room — the scan belongs behind the one state that can ask for it.
    if (messageId === null) {
      return MEDIA_DELETE_WARNING;
    }

    const target = messages.find((message) => message.id === messageId);

    return target?.media[0]?.filename ? "말풍선에 담긴 파일이 모두 사라져요" : MEDIA_DELETE_WARNING;
  }

  /**
   * WARN: REQUIREMENTS.md § 9.1. A file attachment saves instead of opening. It has
   * no thumbnail and no inline representation, so the § 7.10. viewer would open on
   * an empty slide it could neither draw nor swipe out of.
   *
   * WARN: The finished restructure. The seed track is the bubble's cells **less its
   * tombstones**, which is what `toSurvivingRows` does to every page behind it. The
   * grid draws a tombstone in place and hands over no tap, so the index has to be
   * re-found rather than carried across — the two arrays no longer agree.
   */
  function openAttachment(
    cells: MediaCell[],
    index: number,
    messageId: MessageId,
    senderId: UserId,
    origin?: HTMLElement,
  ) {
    const cell = cells[index];

    // INFO: § 4.3. Nothing to open and nothing to save — the object is gone, and the tombstone that says so is already on screen.
    if (!cell || cell.isDeleted) {
      return;
    }

    if (cell.filename) {
      void downloadMedia([cell.id]);
      // INFO: The same acknowledgement § 10.'s 저장 gives, for the same reason — `downloadMedia` resolves whatever the navigation does, so a 404 or a swallowed download would otherwise be a tap that did nothing.
      toast.success("파일을 저장하고 있어요");

      return;
    }

    const openable = cells.filter((item) => !item.isDeleted);

    // INFO: DESIGN.md § 4.7.3. The cell expands into the slide rather than the viewer cutting in over the room. Wrapped around this call alone and not around the whole function — the two branches above save a file and open nothing, and a transition started for either would freeze the room for a frame with no morph in it.
    startMediaMorph(origin ?? null, () =>
      mediaTrack.open(
        openable,
        openable.findIndex((item) => item.id === cell.id),
        messageId,
        senderId,
      ),
    );
  }

  /**
   * REQUIREMENTS.md § 8.1. 원본 저장 on a slide whose bubble carries more than one
   * attachment offers the rest of them first.
   *
   * WARN: The bundle is the **bubble**, never the track. The track spans the conversation now, so "모두" over it would be hundreds of files; the sender picked these together and § 6. sent them as one row, which is the only grouping the reader ever saw.
   * INFO: A single attachment saves on the one tap it always did. A question with one answer is a question not worth asking.
   */
  /**
   * WARN: AGENTS.md § 0.4. The particle after the count comes from `josa`, not from a
   * literal. It reads as `3장을` here and would read wrongly the moment this sentence
   * counted anything else — and the unit itself is § 10.'s, so 사진 and 파일 already
   * disagree about which noun precedes it.
   */
  function saveBundle(wantsAll: boolean) {
    // WARN: Gated on the openness flag as well as the subject, which now outlives the dismissal. `DialogContent` is mounted and still clickable through its 200ms exit (`DESIGN.md § 7.4.`), so the second half of a double tap would otherwise start the same download twice.
    if (!pendingBundle || !isChoosingBundle) {
      return;
    }

    const ids = wantsAll ? pendingBundle.ids : [pendingBundle.mediaId];

    setIsChoosingBundle(false);
    void downloadMedia(ids);
    // INFO: 이 사진만 saves the slide, so it is named the way the single-attachment path names it — a count of one is not worth a counter, and the bundle's kind is not this slide's.
    toast.success(
      wantsAll
        ? `${josa(toBundleCount(ids.length, pendingBundle.kind), "을/를")} 저장하고 있어요`
        : `${josa(pendingBundle.slideNoun, "을/를")} 저장하고 있어요`,
    );
  }

  function askToSaveBundle(mediaId: MediaId) {
    const siblings = toBundleItems(mediaId);
    // INFO: REQUIREMENTS.md § 10. The slide's own kind, which names the one control that acts on the slide alone — 이 사진만 / 이 동영상만, and the toast that answers it.
    const isVideo = mediaTrack.viewer?.cells.find((cell) => cell.id === mediaId)?.isVideo ?? false;
    const slideNoun = toMediaLabel(isVideo ? "video" : "photo");

    if (siblings.length < 2) {
      void downloadMedia([mediaId]);
      toast.success(`${josa(slideNoun, "을/를")} 저장하고 있어요`);

      return;
    }

    setPendingBundle({
      mediaId,
      ids: siblings.map((item) => item.id),
      slideNoun,
      // WARN: REQUIREMENTS.md § 8.1. The **bundle's** kind, not the tapped slide's, because 모두 저장 acts on the bundle. § 6. lets one bubble carry photos and videos together, so a slide-named heading offered to save 동영상 and then saved the photos beside it too — it misdescribed the action rather than merely labelling it. `toMediaNoun` calls a mixed set `photo`, which is 갤러리's own rule for a selection carrying both.
      kind: toMediaNoun(siblings),
    });
    setIsChoosingBundle(true);
  }

  /**
   * INFO: REQUIREMENTS.md § 8.1. The attachments of the bubble the slide belongs to, in the order they were sent — read off the loaded message rather than off the track, which carries no bubble boundaries.
   * WARN: Empty when that message is no longer in the loaded window, which the conversation-wide track makes ordinary: the reader can swipe to a photo whose bubble has been paged out. The caller then saves the one slide, since the bundle it cannot see is a bundle it must not claim to know the size of.
   * WARN: The rows rather than their ids, because the bundle's own kind is read off them (§ 6.) — an id cannot say whether it is a photo.
   */
  function toBundleItems(mediaId: MediaId) {
    const messageId = mediaTrack.viewer?.owners.get(mediaId)?.messageId;
    const message = messageId === undefined ? undefined : messages.find((m) => m.id === messageId);

    return (message?.media ?? []).filter((item) => !item.filename && !item.voice);
  }

  // INFO: REQUIREMENTS.md § 10. The unit follows the kind of the set being counted — 장 for photos and for a mixed bubble, 개 for one that is all video. § 9.1.'s files never reach the viewer at all.
  function toBundleCount(count: number, kind: Nullable<MediaNoun>): string {
    return `${count}${toMediaCountUnit(kind)}`;
  }

  /**
   * DESIGN.md § 7.10. The viewer's identity block travels to the bubble the slide was
   * sent in — § 8.6.1.'s own jump, reached from the viewer.
   *
   * WARN: This exists only because § 8.1.'s track leaves the bubble. While the viewer showed one message's attachments the destination was the message the reader was already on, which is why 보관함's viewer had this journey and 채팅's had none.
   * WARN: The viewer is dismissed first, or it would cover the bubble the jump flashes — the same reason both route-changing jumps close it.
   */
  function openBubble(messageId: MessageId) {
    mediaTrack.close();
    void jumpToMessage(messageId, { flash: true });
  }

  /**
   * DESIGN.md § 7.10. 채팅's own top-right jump, the mirror of 보관함's 대화에서 보기 —
   * it travels to the library rather than to the conversation the reader is already in.
   *
   * WARN: Keyed by the media id, not the message id. The library is a grid of photos and this lands on the tile (`ARCHIVE_TARGET_PARAM`), where the § 10. viewer's jump lands on a bubble — the two directions genuinely travel by different keys.
   * WARN: The viewer is dismissed first, for the reason 보관함's is: it is a `ShellOverlay` and the shell outlives the route change, so left open it would cover the grid it just travelled to.
   */
  function openInArchive(cell: MediaCell) {
    mediaTrack.close();
    const params = new URLSearchParams({ [ARCHIVE_TARGET_PARAM]: cell.id });
    if (cell.onlyMe) {
      params.set("mode", "onlyMe");
    }
    router.push(`${ARCHIVE_GALLERY_ROUTE}?${params}`);
  }

  /**
   * DESIGN.md § 6.10. The composer pill's header row: the staged quote, or § 6.10.1.'s
   * notice while a message is being corrected.
   *
   * WARN: REQUIREMENTS.md § 8.13. One position and never both at once — a correction
   * composes no new message, so there is nothing for a quote to be the header of.
   *
   * WARN: § 8.13. The quote is hidden rather than cleared, and comes back on cancel.
   * Entering the mode must cost the user nothing they had already staged.
   */
  function composerHeader(): Nullable<ReactNode> {
    if (editingId !== null) {
      return <EditBar onCancel={cancelEdit} />;
    }

    if (aiSelection.isSelecting) {
      return (
        <AiSelectionBar
          agents={llmAgentChoice.agents}
          model={llmAgentChoice.model}
          thinking={llmAgentChoice.thinking}
          onSelectModel={llmAgentChoice.setModel}
          onSelectThinking={llmAgentChoice.setThinking}
        />
      );
    }

    if (!replyTarget) {
      return null;
    }

    return (
      <ReplyBar
        replyTo={replyTarget}
        heading={toQuoteHeadingFor(replyTarget)}
        onCancel={() => setReplyTarget(null)}
      />
    );
  }

  // INFO: DESIGN.md § 6.10. `나에게 답장` / `{이름}에게 답장`, from the one copy the § 12.2. mirror shares.
  function toQuoteHeadingFor(quoted: ReplyPreview): string {
    return toQuoteHeading(
      participantById.get(quoted.senderId)?.name,
      quoted.senderId === currentUserId,
      quoted.llmProvider,
    );
  }

  function buildActionItems(): ActionSheetItem[] {
    if (!actionTarget) {
      return [];
    }

    const target = actionTarget;
    // INFO: REQUIREMENTS.md § 8.10., § 8.15. First, and on the other person's messages as much as on my own — replying is the sheet's most-reached-for action, unlike copy. An AI answer names what its own 답장 does instead (`stageReply`).
    const isAssistantReply = target.systemAction === "assistant_reply";
    const items: ActionSheetItem[] = [
      // INFO: `keepsFocus` for 수정's reason — `stageReply` hands the field the caret, and the sheet's close would take it straight back.
      {
        label: isAssistantReply ? "이어서 질문" : "답장",
        Icon: isAssistantReply
          ? Sparkles
          : target.senderId === currentUserId
            ? CornerUpRight
            : CornerUpLeft,
        keepsFocus: true,
        onSelect: () => stageReply(target),
      },
    ];

    // INFO: REQUIREMENTS.md § 8.17. Above the `system` return, since a long AI answer is what folding was built for — and on either participant's message, folding being curation of the shared timeline rather than a change to what anyone said.
    if (isAssistantReply || target.type === "text") {
      items.push({
        label: target.isCollapsed ? "펼치기" : "접기",
        Icon: target.isCollapsed ? ChevronsUpDown : ChevronsDownUp,
        onSelect: () => void toggleCollapse(target.id),
      });
    }

    // INFO: REQUIREMENTS.md § 8.15. An AI answer's `senderId` is the asker (§ 8.10.), so nothing below this line applies to it — 수정/삭제 read as though the asker could correct or withdraw 쨈미니's own words, and 이모티콘 따라하기 has nothing to key off since the row carries none.
    if (target.type === "system") {
      if (target.text) {
        items.push({ label: "복사", Icon: Copy, onSelect: () => void copyText(target.text ?? "") });
      }

      if (canShareMessage(target)) {
        items.push({ label: "공유", Icon: Share, onSelect: () => void shareMessage(target) });
      }

      return items;
    }

    const emoticon = target.emoticon;

    // INFO: REQUIREMENTS.md § 13.9. The same action the bubble's own tap performs, offered here because a mouse reaches this sheet by right-click (`DESIGN.md § 3.2.`) — and because a tap that also replays a sound is not the only way anyone should have to ask for it.
    // WARN: Withheld once the item is deleted, for the reason the bubble's tap is: every picker list filters it out, so the panel would open on nothing.
    if (emoticon && !emoticon.isDeleted) {
      items.push({
        label: "이모티콘 따라하기",
        Icon: Smile,
        onSelect: () => followEmoticon(emoticon),
      });
    }

    if (target.text) {
      items.push({ label: "복사", Icon: Copy, onSelect: () => void copyText(target.text ?? "") });
    }

    if (canShareMessage(target)) {
      const isMediaShare = target.media.length > 0;

      items.push({
        label: "공유",
        Icon: Share,
        onSelect: isMediaShare
          ? shareGate.guard(() => void shareMessage(target))
          : () => void shareMessage(target),
      });
    }

    // INFO: REQUIREMENTS.md § 8.13. Text only, which `messages_edited_is_text_check` says again at the database — an attachment or an emoticon has no prose to correct, and a system notice is nobody's to touch.
    if (target.senderId === currentUserId && target.type === "text") {
      // INFO: REQUIREMENTS.md § 8.13. The one row in the app that declares `keepsFocus` — it hands the field the message being corrected, and the sheet's close would otherwise take that focus straight back.
      items.push({
        label: "수정",
        Icon: Pencil,
        keepsFocus: true,
        onSelect: editGate.guard(() => startEdit(target)),
      });
    }

    if (target.senderId === currentUserId) {
      items.push({
        label: "삭제",
        Icon: Trash2,
        variant: "destructive",
        // INFO: DESIGN.md § 7.10. An attachment bubble is confirmed, wherever the delete was reached from — one row is every photo in it (§ 6.), which is the one thing neither the sheet nor the viewer shows.
        onSelect: deleteGate.guard(() =>
          target.media.length > 0
            ? setConfirmingDeleteId(target.id)
            : void deleteMessage(target.id),
        ),
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
    // INFO: REQUIREMENTS.md § 8.15. 답장 on an AI answer opens AI 질문 모드 on it instead of staging a quote — the answer is 쨈미니's own turn, so following it up is the next question.
    if (message.systemAction === "assistant_reply") {
      askFollowUp(message);

      return;
    }

    setReplyTarget(toReplyPreviewFor(message));

    // WARN: The node and not `focusComposer`'s token, for `typeIntoComposer`'s reason — a token is answered an effect later, and iOS raises the keyboard only for a `focus()` the pull's `pointerup` or the row's click still covers.
    if (!isSearching) {
      focusWithoutPan(composerFieldRef.current);
    }
  }

  /** REQUIREMENTS.md § 8.15. AI 질문 모드 on the answer that was pulled or long-pressed, with it selected — the caret is taken by node for `stageReply`'s own reason. */
  function askFollowUp(message: ChatMessage) {
    aiSelection.askAbout(message.id);

    if (!isSearching) {
      focusWithoutPan(composerFieldRef.current);
    }
  }

  /** REQUIREMENTS.md § 8.15. The § 6.11. streaming row quotes its question from here too, so the bubble it draws mid-stream and the one `listReplyPreviews` answers with when the answer lands are the same quote. */
  function toReplyPreviewFor(message: ChatMessage): ReplyPreview {
    return {
      senderId: message.senderId,
      kind: message.type,
      // WARN: REQUIREMENTS.md § 13. The same summary `listReplyPreviews` answers with, for the reason the thumbnail below is the same call — the quote has one line and no room to draw an emoticon, and an optimistic quote that kept the placeholders would disagree with the echoed one about its own text.
      text: toQuotedText(message),
      // INFO: REQUIREMENTS.md § 8.10. The same call `listReplyPreviews` makes on the server, so the optimistic quote and the echoed one cannot disagree about whether the row has a tile.
      thumbnail: message.isDeleted
        ? null
        : toQuoteThumbnail(
            message.emoticon,
            message.media,
            toSoloInlineQuoteEmoticon(message),
            // INFO: REQUIREMENTS.md § 8.9. The cache `useLinkPreviewPrefetch` has already filled for every loaded message, which is the browser's half of the row `listReplyPreviews` reads server-side.
            readPreview(findFirstUrl(message.text))?.imageUrl ?? null,
          ),
      // WARN: REQUIREMENTS.md § 8.13. A withdrawn parent surrenders its payload here too. Nothing routes 답장 onto a tombstone today, but that is the row it is rendered on rather than a property of this function — and `listReplyPreviews` nulls all four, so staging them live would be the optimistic/echo disagreement `toQuoteThumbnail` exists to rule out.
      mediaKind: message.isDeleted ? null : toMediaNoun(message.media),
      mediaCount: message.isDeleted ? 0 : message.media.length,
      isDeleted: message.isDeleted,
      llmProvider: message.isDeleted ? null : message.llmProvider,
      id: message.id,
    };
  }

  /**
   * REQUIREMENTS.md § 13. A message as one line of prose, every emoticon in it reading
   * as `(이모티콘)`.
   *
   * INFO: The client's copy of what `listReplyPreviews` does server-side, so the staged
   * quote, the optimistic bubble and the echoed row all say the same sentence.
   */
  function toQuotedText(message: ChatMessage): Nullable<string> {
    if (message.type !== "text") {
      return message.text?.slice(0, REPLY_PREVIEW_MAX_LENGTH) ?? null;
    }

    return toMessageSummary(message.text ?? "").slice(0, REPLY_PREVIEW_MAX_LENGTH);
  }

  /**
   * REQUIREMENTS.md § 13. The client's copy of `listReplyPreviews`'s own solo-inline
   * resolution, off the same `inlineEmoticons` map `readInlineEmoticon` reads.
   */
  function toSoloInlineQuoteEmoticon(
    message: ChatMessage,
  ): Nullable<{ version: number; isDeleted: boolean; id: EmoticonItemId }> {
    if (message.type !== "text") {
      return null;
    }

    const soloId = toSoloInlineEmoticonId({
      text: message.text ?? "",
      inlineEmoticonItemIds: message.inlineEmoticonItemIds,
    });
    const info = soloId ? inlineEmoticons[soloId] : undefined;

    return soloId && info ? { id: soloId, version: info.version, isDeleted: info.isDeleted } : null;
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
  async function jumpToMessage(
    id: MessageId,
    { flash, onlyMe }: { flash: boolean; onlyMe?: boolean },
  ) {
    if (!messages.some((message) => message.id === id)) {
      const outcome = await loadAround(id, onlyMe);

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

    // WARN: § 8.6.1. Retried across frames rather than looked up once. WebKit can run this rAF before React's re-render has written the around window into `rowsRef`, and a single lookup then misses and bails silently — no scroll, no flash, the reader left clamped at the replaced window's bottom.
    let lookupsRemaining = JUMP_SETTLE_FRAMES;

    cancelJumpScroll();

    const seek = () => {
      const index = rowsRef.current.findIndex(
        (row) => row.kind === "message" && row.message.id === id,
      );

      if (index < 0) {
        lookupsRemaining -= 1;

        if (lookupsRemaining > 0) {
          jumpFrameRef.current = requestAnimationFrame(seek);
        }

        return;
      }

      settleJumpScroll(index);

      // WARN: DESIGN.md § 6.10. A property of the jump, never of whether a search happens to be open. The flash is for a jump with nothing else to point at — a quote, whose parent need not contain the query, so keying this on the search being open leaves such a jump marked by nothing at all.
      if (flash) {
        // WARN: `flushSync`, and after the bail-out above. A CSS animation restarts only when the class is applied, so a second jump to the row already flashing has to commit its removal *before* re-adding it — batched, the two updates collapse into a render whose state never changed and the wash never plays again. A jump that found no row keeps the flash it has rather than clearing one it cannot replace.
        flushSync(() => setHighlightedId(null));
        setHighlightedId(id);
      }
    };

    jumpFrameRef.current = requestAnimationFrame(seek);
  }

  /**
   * REQUIREMENTS.md § 8.3., § 8.6.1. Lands the jump, then re-asserts it until the
   * offset stops moving — because the rows it scrolled past have not been measured yet.
   *
   * WARN: One `scrollToIndex` is right in Chrome and short in WebKit, and the difference is *when* the first measurement arrives. Rows are deliberately not measured in React's commit (see `measureElement`), so their real heights come from the `ResizeObserver`'s first delivery — which Blink runs before this frame's paint and WebKit runs after it. The estimate→actual corrections therefore land under a scroll that has already been committed against the estimates, and the target ends up below the fold: the reader has to scroll up to find the message the jump was for.
   * WARN: Bounded, and it stops the moment two asserts resolve the row to the same offset. Every extra frame is one the reader could be scrolling in, and re-asserting on top of a real gesture would drag them back.
   */
  function settleJumpScroll(index: number) {
    let remaining = JUMP_SETTLE_FRAMES;
    let previous = Number.NaN;

    // WARN: The loop in flight is cancelled rather than left to race this one. It closes over the *previous* target's index, and `jumpToMessage` names pressing § 8.6.1.'s arrows twice as the ordinary case — two jumps inside these few frames left the older loop re-asserting the match the reader had already stepped off, landing them back on it.
    cancelJumpScroll();
    recentJumpRef.current = { index, at: performance.now() };
    assert();

    function assert() {
      // WARN: The offset the row *resolves* to, never the scroller's own. Before WebKit's first `ResizeObserver` delivery two asserts land on the identical `scrollTop` — nothing has been measured yet — and a loop that reads settling off that exits one frame before the corrections it exists to absorb.
      const offset = toJumpOffset(index);

      // WARN: Not `behavior: "smooth"`. A jump crosses an arbitrary distance, so smooth animates through history the user did not ask to see, and the window it is animating over was replaced a frame ago — and a re-assert would then be measuring a scroll still in flight.
      if (!Number.isNaN(offset)) {
        virtualizer.scrollToOffset(offset);
      }

      remaining -= 1;

      if (offset === previous || remaining <= 0) {
        return;
      }

      previous = offset;
      jumpFrameRef.current = requestAnimationFrame(assert);
    }
  }

  // WARN: Not `scrollToIndex(…, { align: "center" })` — the library centres against the scroller's full height and applies `scrollPaddingStart` to `start` alone, so a tall row's top lands under the header band. A row taller than the clear area is parked at the band's edge instead.
  function toJumpOffset(index: number): number {
    const item = virtualizer.measurementsCache[index];

    if (!item) {
      return Number.NaN;
    }

    const element = scrollerRef.current;

    if (!element) {
      return Number.NaN;
    }

    const clearHeight = element.clientHeight - JUMP_TOP_CLEARANCE;
    const lead = JUMP_TOP_CLEARANCE + Math.max(0, (clearHeight - item.size) / 2);
    const maxOffset = element.scrollHeight - element.clientHeight;

    return Math.max(0, Math.min(maxOffset, item.start - lead));
  }

  // INFO: Also the unmount cleanup — a frame left queued would call into a virtualizer whose scroller is gone.
  function cancelJumpScroll() {
    if (jumpFrameRef.current !== null) {
      cancelAnimationFrame(jumpFrameRef.current);
      jumpFrameRef.current = null;
    }
  }

  /**
   * REQUIREMENTS.md § 8.11. Attachments go to the OS as files — which is what puts a
   * received photo in the iOS photo library — and a text message as its text. An
   * emoticon is neither: it is a pack item rather than something the sender sent.
   */
  // WARN: REQUIREMENTS.md § 9.1. A file bubble is withheld here, and only here — the card's own tap already downloads it, so a second route to the same bytes in the hold sheet is a row that does nothing new. 보관함's 파일 segment does offer 공유 (§ 10.), because there a selection of several is the thing being handed over and no tap has downloaded them.
  // WARN: REQUIREMENTS.md § 9.3. A recording is withheld for the reason a file attachment is — `useMediaShare` names each `File` from its mime, and `extensionForMime` answers `bin` for `audio/mp4`, so 공유 would hand the OS `{uuid}.bin` under a dialog worded 사진.
  function canShareMessage(message: ChatMessage): boolean {
    const [first] = message.media;
    const hasShareableMedia = first !== undefined && !first.filename && !first.voice;

    return hasShareableMedia || (message.text !== null && message.text.length > 0);
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

    // INFO: REQUIREMENTS.md § 13. A share sheet and a clipboard have no room for an emoticon either, so what leaves the app is the § 16.1. summary rather than the placeholders themselves.
    const text = toQuotedText(message) ?? "";

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

  /**
   * DESIGN.md § 7.10. The control sits beside a per-slide 원본 저장, so the reach of
   * one tap is not obvious from where it is — 메시지 is the label's whole job, and
   * 보관함's viewer renders the same trash over a row-only delete.
   *
   * WARN: REQUIREMENTS.md § 8.1. Resolved per slide, never once per open. The track
   * crosses bubbles, so the reach of this trash changes with every swipe — and
   * § 8.13. withdraws my own messages only, which is what `isAvailable` answers.
   */
  function buildViewerDelete(owners: Map<MediaId, TrackOwner>) {
    return {
      label: "메시지 삭제",
      isAvailable: (mediaId: MediaId) => owners.get(mediaId)?.senderId === currentUserId,
      onSelect: (mediaId: MediaId) => {
        const messageId = owners.get(mediaId)?.messageId;

        if (messageId !== undefined) {
          setConfirmingDeleteId(messageId);
        }
      },
    };
  }

  /**
   * WARN: REQUIREMENTS.md § 8.1. The viewer is **narrowed**, not closed. It used to
   * be closed, and that was right while the track was the one bubble being deleted —
   * there was nothing left to look at. The track now spans the conversation, so
   * closing it would throw the reader out of a photo stream over one bubble leaving
   * it; the slides go and the next photo is already under them (`DESIGN.md § 7.10.`).
   *
   * INFO: A no-op when nothing is open, which is the § 8.11. action sheet's path into the same confirmation.
   */
  function confirmMediaDelete() {
    if (confirmingDeleteId !== null) {
      void deleteMessage(confirmingDeleteId);
    }

    setConfirmingDeleteId(null);
  }

  /**
   * REQUIREMENTS.md § 8.13. The row stays and becomes a tombstone; it is not taken
   * out of the window.
   *
   * WARN: The local copy is stripped to exactly what the server will echo back —
   * no text, no attachments, no emoticon, no quote. Leaving any of them on would
   * draw a bubble here that no other client can see, until the echo replaced it.
   */
  async function deleteMessage(id: MessageId) {
    const current = messages.find((entry) => entry.id === id);

    try {
      await requestMessageDeletion(id);

      if (current) {
        replaceMessage({
          ...current,
          text: null,
          media: [],
          emoticon: null,
          replyTo: null,
          isDeleted: true,
        });
      }

      // WARN: REQUIREMENTS.md § 8.1. The open track is narrowed **here**, after the server has accepted, and never beside the confirmation. Dropped optimistically, a refused delete left the slides gone from a viewer the reader is still holding — closing it outright when that bubble was the only one in the track — while the bubble itself stayed, since the local row is only rewritten on success. There is nothing to roll back if nothing was removed.
      mediaTrack.drop(id);

      if (id === editingId) {
        cancelEdit();
      }
    } catch {
      toast.error("메시지를 삭제하지 못했어요");
    }
  }

  /**
   * REQUIREMENTS.md § 8.13. A change that arrived over the stream. A **withdrawal**
   * can name a message this screen is composing against: the same account signs in
   * on more than one device (§ 12.), so my own message can go while I hold it open
   * here.
   *
   * WARN: Clearing `editingId` breaks a loop rather than merely tidying up.
   * `editMessage` narrows on `deleted_at IS NULL`, so submitting the correction
   * 404s and `applyEdit`'s catch re-enters the mode and re-seeds it — leaving the
   * cancel control as the only way out of a bar that will never succeed.
   */
  function handleRemoteChange(message: ChatMessage) {
    replaceMessage(message);

    if (!message.isDeleted) {
      return;
    }

    if (message.id === editingId) {
      cancelEdit();
    }

    // INFO: REQUIREMENTS.md § 8.10. `POST /api/messages` refuses a withdrawn parent with a 400, so a quote left staged here is a send that cannot land.
    if (message.id === replyTarget?.id) {
      setReplyTarget(null);
    }

    // INFO: § 7.10. The confirmation names attachments the tombstone no longer has, and this reaches the other participant's photos as much as my own.
    if (message.id === confirmingDeleteId) {
      setConfirmingDeleteId(null);
    }

    mediaTrack.drop(message.id);
  }

  /** REQUIREMENTS.md § 8.13. Hands the message's current text to the composer and puts it in the correcting mode. */
  function startEdit(message: ChatMessage) {
    setEditingId(message.id);
    // WARN: REQUIREMENTS.md § 13. The emoticons go back with the text. Seeded without them the correction holds placeholders nothing is paired to — blank boxes to read, and a body the route refuses on submit.
    seedDraft(message.text ?? "", toComposerEmoticons(message));
  }

  // INFO: REQUIREMENTS.md § 13. The row's ids against what this tab has been told they draw; an id the store has never heard of is dropped rather than seeded as a box nothing fills.
  function toComposerEmoticons(message: ChatMessage): ComposerEmoticon[] {
    return message.inlineEmoticonItemIds.flatMap((itemId) => {
      const emoticon = inlineEmoticons[itemId];

      return emoticon ? [{ ...emoticon, id: itemId }] : [];
    });
  }

  // INFO: REQUIREMENTS.md § 8.13. Leaves the field empty rather than restoring whatever was half-typed before the edit — the draft the composer held is the one that has just been abandoned.
  function cancelEdit() {
    setEditingId(null);
    seedDraft("");
  }

  /**
   * REQUIREMENTS.md § 8.13. The correction, applied locally the way a delete is
   * (§ 8.10.) rather than waited on — the PATCH answers 204 and carries no row.
   *
   * WARN: `text.trim()`, because the route's schema trims before it writes. Storing
   * one string and drawing another is a bubble that changes under the reader the
   * moment the § 8.13. echo of the real row arrives.
   *
   * INFO: The `editedAt` written here is this device's clock and the server's is the
   * database's, so the echo corrects it a moment later — one extra key revision
   * (§ 8.3.) and nothing else, since the label only ever asks whether it is null.
   */
  async function applyEdit(id: MessageId, text: string, emoticons: ComposerEmoticon[]) {
    const current = messages.find((entry) => entry.id === id);
    const edited = text.trim();

    setEditingId(null);

    // INFO: REQUIREMENTS.md § 8.13. Reopening the field and submitting it untouched is not a correction — stamping `edited_at` for it would put 수정됨 on a message nobody changed.
    if (edited === current?.text) {
      return;
    }

    try {
      const inlineEmoticonItemIds = emoticons.map(({ id: itemId }) => itemId);

      await requestMessageEdit(id, edited, inlineEmoticonItemIds);

      if (current) {
        replaceMessage({
          ...current,
          text: edited,
          inlineEmoticonItemIds,
          editedAt: new Date().toISOString(),
        });
      }
    } catch {
      toast.error("메시지를 수정하지 못했어요");
      // WARN: The composer clears the field on submit, so a failure has to hand the correction back — otherwise the user's rewrite is gone and the only recovery is to type it again.
      setEditingId(id);
      seedDraft(edited, emoticons);
    }
  }

  // WARN: The token is what makes a repeat an instruction. Two cancels both seed `""`, and a bare value would make the second one no change at all.
  function seedDraft(text: string, emoticons: ComposerEmoticon[] = []) {
    seedTokenRef.current += 1;
    setSeededDraft({ text, emoticons, token: seedTokenRef.current });
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
 * REQUIREMENTS.md § 8.8. How many participants have still not read this message —
 * KakaoTalk's own marker, which counts down and disappears at zero.
 *
 * INFO: A fold over the readers' cursors rather than a per-message read receipt. That
 * is what makes the marker cost nothing to compute and nothing to store: a cursor is
 * one id per participant, and every message is behind it or ahead of it.
 *
 * INFO: With two participants the fold is `1` or `0`, which is the `1` beside an unread
 * bubble and no column at all once it has been read.
 *
 * WARN: `compareId`, never `<`. Both sides are branded id strings, and `CLAUDE.md § 3.2.`
 * forbids comparing those with an operator — it works today only because every id this
 * layout mints is the same width.
 */
function toUnreadReaderCount(
  message: ChatMessage,
  currentUserId: UserId,
  readerCursors: Nullable<MessageId>[],
): number {
  // INFO: DESIGN.md § 6.3. `mine` only — the marker says who has yet to read what I sent, and nobody is waiting on their own message.
  // INFO: REQUIREMENTS.md § 8.13. A tombstone carries no marker at all: it says nothing that could be read.
  // INFO: REQUIREMENTS.md § 16.1. 나에게만 보내기 — withholds the unread marker since private messages are never delivered to other participants.
  if (message.senderId !== currentUserId || message.isDeleted || message.onlyMe) {
    return 0;
  }

  // INFO: § 8.8. A null cursor is "has read nothing", which counts — the column means everything is unread rather than that the reader is absent.
  return readerCursors.filter((cursor) => cursor === null || compareId(cursor, message.id) < 0)
    .length;
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
  aiRowRef: RefObject<Nullable<HTMLDivElement>>;
  primaryGeneration: Optional<[string, GenerationEntry]>;
  queuedGenerationCount: number;
  /** REQUIREMENTS.md § 8.15. The question the streaming answer belongs to, quoted in its bubble exactly as the landed `AssistantMessageRow` quotes it. */
  replyTo: Optional<ReplyPreview>;
  replyToHeading: Optional<string>;
  onOpenReply: Optional<() => void>;
  onCancelGeneration: (streamId: string) => void;
  /** REQUIREMENTS.md § 12.3. The streaming row's own avatar tap — the same profile screen the finished `AssistantMessageRow` opens. */
  onOpenLlmProfile: (provider: Maybe<string>, modelId?: Optional<string>) => void;
};

// INFO: DESIGN.md § 3.5. The trailing space the floating bars need, plus the § 8.12. 입력 중 slot and the AI answer row standing on top of it. All are the list's own content, so scrolling to the bottom parks the newest message just above the composer instead of behind it.
function ListFooter({
  slotRef,
  typist,
  aiRowRef,
  primaryGeneration,
  queuedGenerationCount,
  replyTo,
  replyToHeading,
  onOpenReply,
  onCancelGeneration,
  onOpenLlmProfile,
}: ListFooterProps) {
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
        {/* INFO: Anchored to the bottom, so it holds one position on screen while the slot opens under it rather than travelling with the clip. */}
        {/* WARN: REQUIREMENTS.md § 8.12. It fades in *after* the slot has finished opening, and the delay is what makes the reveal readable. The strip clips, so a row drawn during the growth is a horizontal cut travelling down through the avatar and the bubble — held at zero for those 200ms the reader sees the conversation pushed up by an empty gap, and the row appears in a slot that is already its own size. */}
        {typist && (
          <TypingIndicator
            className="absolute inset-x-0 bottom-0 animate-in delay-200 duration-150 fill-mode-both fade-in"
            typist={typist}
          />
        )}
      </div>
      {/* INFO: Not a fixed-reveal slot like the one above — an AI answer's height changes on every streamed delta, so it is simply mounted in flow, the way an ordinary message row is (§ 6.5.'s bubbles carry no arrival transition of their own either). */}
      {primaryGeneration && (
        <div ref={aiRowRef}>
          <AiAnswerRow
            entry={primaryGeneration[1]}
            replyTo={replyTo}
            replyToHeading={replyToHeading}
            onOpenProfile={() =>
              onOpenLlmProfile(primaryGeneration[1].provider, primaryGeneration[1].model)
            }
            onOpenReply={onOpenReply}
            onCancel={() => onCancelGeneration(primaryGeneration[0])}
          />
          {queuedGenerationCount > 0 && (
            <p className="mx-auto max-w-(--content-max-width) px-md pb-2xs text-caption text-meta">
              대기 중 {queuedGenerationCount}
            </p>
          )}
        </div>
      )}
      <div className="h-(--chat-bottom-gap)" />
    </>
  );
}

type AiAnswerRowProps = {
  entry: GenerationEntry;
  /** `ListFooter`'s own prop of the same name — see there. */
  replyTo: Optional<ReplyPreview>;
  replyToHeading: Optional<string>;
  onOpenReply: Optional<() => void>;
  onCancel: () => void;
  /** REQUIREMENTS.md § 12.3. The avatar tap — the same profile screen the finished `AssistantMessageRow` opens. */
  onOpenProfile: () => void;
};

/**
 * DESIGN.md § 6.2., § 6.7.1., § 7.7. The § 6.7.1. incoming row, drawn for an AI
 * generation instead of a typist: the same avatar-then-bubble shape and the same
 * dots while there is nothing to show yet, but the bubble is a `MarkdownBody` once
 * text has streamed in. It sizes to its content (`w-fit max-w-full`) rather than the
 * ordinary 72% — the `min-w-0 flex-1` slot around it caps that at the content column
 * minus the avatar gutter and the 중지 control without any width arithmetic of its own.
 */
function AiAnswerRow({
  entry,
  replyTo,
  replyToHeading,
  onOpenReply,
  onCancel,
  onOpenProfile,
}: AiAnswerRowProps) {
  const branding = toLlmProviderBranding(entry.provider);
  const isEmpty = entry.text.length === 0;
  const isCancelling = entry.cancelling === true;

  return (
    <div className="mx-auto flex max-w-(--content-max-width) items-end gap-2xs px-md py-xs">
      {/* INFO: Announced politely, for the § 6.7.1. typing indicator's own reason — this changes often enough that an assertive region would talk over every other update. */}
      <span className="sr-only" aria-live="polite">
        {branding.name}가 답변하고 있어요
      </span>
      <button
        className="block size-9 shrink-0 cursor-pointer rounded-full transition-opacity outline-none hover:opacity-80 focus-visible:ring-2 focus-visible:ring-primary active:opacity-70"
        type="button"
        aria-label={`${branding.name} 프로필 보기`}
        onClick={onOpenProfile}
      >
        {branding.avatarSrc ? (
          <span className="block size-full overflow-hidden rounded-full ring-1 ring-hairline ring-inset">
            {/* eslint-disable-next-line @next/next/no-img-element -- a static asset under `public/llm`, not a stored `media` row `next/image` would otherwise optimize */}
            <img className="size-full object-cover" src={branding.avatarSrc} alt="" />
          </span>
        ) : (
          <span className="flex size-full items-center justify-center rounded-full bg-primary-tint ring-1 ring-hairline ring-inset">
            <Sparkles className="size-4 text-primary" strokeWidth={1.75} />
          </span>
        )}
      </button>
      {/* WARN: DESIGN.md § 6.11. A `max-width` and never `flex-1` — the same trap `assistant-message-row.tsx` carries. `w-fit` keeps the *bubble* compact, but a growing slot still stretches, which parks 중지 at the row's far edge instead of beside the bubble. The cap is what the finished `AssistantMessageRow` wraps at (its own `calc(100%-44px)` column less the `gap-2xs` and `w-[68px]` beside it), so the last streamed frame and the landed row wrap identically. */}
      <div className="max-w-[calc(100%-116px)] min-w-0">
        <div
          className={cn(
            "w-fit max-w-full rounded-bubble rounded-tl-xs border border-hairline px-sm py-xs",
            // INFO: REQUIREMENTS.md § 16.1. 나에게만 보내기 — the asker's own private question answered with the other theme's `theirs` fill, matching the landed `AssistantMessageRow`.
            entry.onlyMe ? "bg-bubble-theirs-private" : "bg-bubble-theirs",
          )}
          onClick={replyTo ? toBubbleTapHandler(onOpenReply) : undefined}
        >
          {replyTo && (
            // INFO: DESIGN.md § 6.10. The divider is the bubble's, exactly as it is in `MessageRow` and in the landed `AssistantMessageRow`.
            <ReplyQuote
              className="mb-2xs border-b border-quote-divider pb-2xs"
              replyTo={replyTo}
              heading={replyToHeading ?? ""}
              onOpen={onOpenReply}
            />
          )}
          {/* WARN: The answer alone is hidden from the reader above, never the whole bubble — the quote is a real jump target, and a focusable descendant of an `aria-hidden` box is one no screen reader can explain. */}
          <div aria-hidden>
            {isEmpty ? (
              // INFO: Still bouncing would say the answer is coming; held still, the frozen dots are the tap's own answer while the provider unwinds.
              <TypingDots
                dotClassName={cn(
                  isCancelling && "animate-none",
                  entry.onlyMe && "bg-bubble-private-ink/60",
                )}
              />
            ) : (
              <MarkdownBody isOnlyMe={entry.onlyMe} text={entry.text} />
            )}
          </div>
        </div>
      </div>
      {/* INFO: `message-row.tsx`'s own `w-[68px]` timestamp column, reused so the control hugs the bubble instead of the row's far edge — `items-end` above bottom-aligns it the same way it bottom-aligns a bubble's timestamp. */}
      <div className="flex w-[68px] shrink-0 justify-start">
        {/* INFO: DESIGN.md § 6.3., § 8.10. `message-row.tsx`'s own hover pill, drawn permanently — 중지 is the only way to stop an answer, so it is never hover-gated the way 답장/공유 are. One button rather than two, so the pill sizes to it. */}
        <div className="flex items-center gap-0.5 rounded-full border border-hairline bg-surface-soft px-1 py-0.5 shadow-raised">
          {/* WARN: `buttonClassName` and not `className` — `haptic` moves the latter to the wrapper and leaves the button at its own 44px, which swells the pill (`icon-button.tsx`). `message-row.tsx`'s pill carries no `haptic`, so its `className` reaches the button. */}
          <IconButton
            buttonClassName="size-7"
            iconClassName={cn("size-4", isCancelling && "animate-spin")}
            Icon={isCancelling ? LoaderCircle : Square}
            haptic
            disabled={isCancelling}
            aria-label={isCancelling ? "AI 응답 중지하는 중" : "AI 응답 중지"}
            onClick={onCancel}
          />
        </div>
      </div>
    </div>
  );
}
