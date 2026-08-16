"use client";

import type { Emoticon } from "@/entities/emoticon";
import type { MediaDraft } from "@/entities/media";
import type { ChatMessage, ReplyPreview } from "@/entities/message";
import type { Participant } from "@/entities/user";
import { useApplyPhoto } from "@/features/apply-photo";
import { useChatStream, useChatStreamListener } from "@/features/chat-stream";
import { useWriteChatSnapshot } from "@/features/offline-snapshot";
import {
  EmoticonPicker,
  EmoticonPreview,
  MessageComposer,
  useEmoticonPreload,
  useRecentEmoticons,
  useSendMessage,
  type EmoticonFocusRequest,
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
import {
  ARCHIVE_GALLERY_ROUTE,
  ARCHIVE_TARGET_PARAM,
  MESSAGE_FLASH_DURATION,
  REPLY_PREVIEW_MAX_LENGTH,
  toMediaCountUnit,
  toMediaLabel,
  toMediaNoun,
  toQuoteThumbnail,
  type MediaNoun,
  type MessageArrival,
} from "@/shared/config";
import {
  A_SECOND,
  GESTURE_SLOP,
  buildFadeMask,
  cn,
  compareId,
  composeEventNotice,
  countVisibleWakes,
  runWhenIdle,
  startMediaMorph,
  stopVoice,
  subscribeDormancy,
  useIsFinePointer,
  useIsVirtualKeyboardOpen,
  useIsomorphicLayoutEffect,
  useSettledCommit,
  useSoundUnlock,
  useUnsentWork,
  warmLineHeights,
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
  Copy,
  CornerUpLeft,
  LoaderCircle,
  MessageCircle,
  Pencil,
  Share,
  Smile,
  Trash2,
} from "lucide-react";
import { useRouter } from "next/navigation";
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
  type ReactNode,
  type RefObject,
  type TransitionEvent,
} from "react";
import { flushSync } from "react-dom";
import { requestMessageDeletion } from "../api/request-message-deletion";
import { requestMessageEdit } from "../api/request-message-edit";
import { buildChatRows } from "../model/build-chat-rows";
import {
  ROW_LINE_CLASSES,
  estimateRowHeight,
  type PreviewReader,
} from "../model/estimate-row-height";
import { toLinkPreviewQuery } from "../model/link-preview-query";
import { playEmoticonSound } from "../model/play-emoticon-sound";
import { toCellsFromDrafts, toCellsFromMedia, type TrackOwner } from "../model/to-media-cells";
import type { ChatRow } from "../model/types";
import { useChatShortcuts } from "../model/use-chat-shortcuts";
import { useComposerClearance } from "../model/use-composer-clearance";
import { useLinkPreviewPrefetch } from "../model/use-link-preview-prefetch";
import { useMessageHistory } from "../model/use-message-history";
import { useViewerTrack } from "../model/use-viewer-track";
import { ChatBackdrop } from "./chat-backdrop";
import { DateDivider } from "./date-divider";
import { EditBar } from "./edit-bar";
import { findChatMediaCell } from "./media-grid";
import { MessageRow } from "./message-row";
import { ReplyBar } from "./reply-bar";
import { ScrollToBottomPill } from "./scroll-to-bottom-pill";
import { ShortcutHelp } from "./shortcut-help";
import { SystemNotice } from "./system-notice";
import { TypingIndicator } from "./typing-indicator";

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
};

// INFO: § 13.6. The ceiling the emoticon panel's mount is given, matching the warm's own — the two are the same idle frame and a panel that mounted first would build its cells against an empty cache.
const PANEL_MOUNT_IDLE_DELAY = 2 * A_SECOND;

// INFO: DESIGN.md § 6.7. The pill appears once the newest message is roughly this far away, and the same distance is what `scrollEndThreshold` treats as near enough to the end that a row re-measuring there should hold the end still rather than let it drift.
const AT_BOTTOM_THRESHOLD = 200;

// INFO: REQUIREMENTS.md § 6. One row is every attachment in it, which is the one thing neither the sheet nor the viewer shows. REQUIREMENTS.md § 9.1.'s file bubble names files instead.
const MEDIA_DELETE_WARNING = "말풍선에 담긴 사진과 동영상이 모두 사라져요";

// INFO: The loading header's own height (`h-10`), constant whether or not the skeleton is in it — a header that collapsed would move the list under the finger every time a page lands.
const LIST_HEADER_HEIGHT = 40;

// INFO: Rows here run from a 44px bubble to a 363px photo, so this is counted generously — eight of the tall ones is roughly the 600px of runway a flick covers before the next frame.
const OVERSCAN_ROWS = 8;

// INFO: REQUIREMENTS.md § 8.6.1. How many frames a jump may re-assert its offset over while the rows around it are measured. Six spans WebKit's post-paint `ResizeObserver` deliveries — the first lands a frame late and the correction it causes brings a second — and the loop stops early the moment two asserts resolve to the same offset.
const JUMP_SETTLE_FRAMES = 6;

// INFO: REQUIREMENTS.md § 8.3. Upward paging fires once the scroller is this close to the top — far enough out that the fetch and the wait for a still scroller both fit before the reader arrives.
const LOAD_OLDER_THRESHOLD = 600;

// INFO: REQUIREMENTS.md § 8.14. How far `⌥↑`/`⌥↓` moves, as a share of what is on screen rather than a pixel count — a step that reads the same on a phone and on a desktop, and that leaves most of the last screenful in view to read against.
const HISTORY_SCROLL_STEP = 0.4;

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
  jumpTarget,
  initialJumpMessageId,
  searchQuery,
  bottomBar,
}: ChatRoomProps) {
  const containerRef = useRef<Nullable<HTMLDivElement>>(null);
  const composerRef = useRef<Nullable<HTMLDivElement>>(null);
  // INFO: REQUIREMENTS.md § 8.12. Observed rather than derived from `typist`, because what has to be followed is every frame of the height transition, not the state change that started it.
  const typingSlotRef = useRef<Nullable<HTMLDivElement>>(null);
  // INFO: REQUIREMENTS.md § 8.3. The rows' own box, observed for the same reason the slot above is — a row that grows after it was estimated moves the end of the list, and nothing scrolls to say so.
  const contentRef = useRef<Nullable<HTMLDivElement>>(null);
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
  // INFO: REQUIREMENTS.md § 8.3. Whether the rows may be painted. False until the park below has answered the first real measurements, so the estimate→actual correction is not a jump the reader watches.
  // WARN: Open from the start for a room that loaded empty. There is no window to park and nothing to correct, and the scroller only mounts when the first message lands — gating on it would hold that one arrival back for two frames, on the § 8.12. screen where an arrival is the whole event.
  const [hasSettledFirstPark, setHasSettledFirstPark] = useState(initialMessages.length === 0);
  const [isAtBottom, setIsAtBottom] = useState(true);
  const isAtBottomRef = useRef(true);
  const [isAtTop, setIsAtTop] = useState(true);
  const [actionTarget, setActionTarget] = useState<Nullable<ChatMessage>>(null);
  const [isPickerOpen, setIsPickerOpen] = useState(false);
  // INFO: REQUIREMENTS.md § 9.3. The recorder bar stands in the composer stack while it is true. Mounting is what starts the microphone, so this is only ever set from the tap that asked for it.
  const [isRecording, setIsRecording] = useState(false);
  const [isEmoticonPickerOpen, setIsEmoticonPickerOpen] = useState(false);
  // INFO: REQUIREMENTS.md § 8.14. Bumped to put the caret back in the composer; `0` is the resting value the composer skips, so mounting the room focuses nothing.
  const [composerFocusRequest, setComposerFocusRequest] = useState(0);
  // INFO: § 13.6. Whether a request arrived while the composer was yielded, to be handed over when the row comes back. A ref rather than state: nothing renders differently for it, and it is written from the handler that would otherwise spend the token on a hidden field.
  const isComposerFocusHeldRef = useRef(false);
  // INFO: REQUIREMENTS.md § 8.14. The composer's field, for the two things `composerFocusRequest` is a render too late for — a character typed with nothing focused, and the clipboard behind ⌘V.
  const composerFieldRef = useRef<Nullable<HTMLDivElement>>(null);
  // INFO: REQUIREMENTS.md § 8.14. The same token for the panel, bumped by **every** open — an opened panel nothing has focused is one the arrow keys cannot reach, and the toggle is a button, so a mouse open leaves focus on it rather than inside what it opened.
  // INFO: REQUIREMENTS.md § 8.6.1. The frame `settleJumpScroll` has queued, so a newer jump — or an unmount — can take it back.
  const jumpFrameRef = useRef<Nullable<number>>(null);
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
  // INFO: § 13.8. The one tab exempt from § 13.6.'s keyboard gate, reported by the picker because the tab is its own state.
  const [isEmoticonSearchTab, setIsEmoticonSearchTab] = useState(false);
  // INFO: § 13.8. The same exemption, held open for as long as the keyboard that tab raised takes to leave.
  const [isEmoticonSearchExempt, setIsEmoticonSearchExempt] = useState(false);
  // WARN: § 13.8. Memoized because the picker's own effect depends on it — a fresh identity every render re-runs that effect on every render of this room.
  const reportEmoticonSearchTab = useCallback((isOnSearchTab: boolean) => {
    setIsEmoticonSearchTab(isOnSearchTab);

    // WARN: § 13.8. Leaving 검색 ends the search, exactly as closing the panel does. The word is only consumed beside an emoticon the search itself produced, so a request surviving a walk to another pack swallows a typed word that merely equals it.
    if (!isOnSearchTab) {
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
    useState<Optional<{ text: string; token: number }>>(undefined);
  const seedTokenRef = useRef(0);
  // INFO: The newest id the user had in view when they last left the bottom — everything past it is what the § 6.7. pill counts.
  const [seenId, setSeenId] = useState(initialMessages.at(-1)?.id ?? 0);
  const {
    messages,
    isLoadingOlder,
    pendingOlder,
    hasNewer,
    loadOlder,
    clearOlderCooldown,
    commitPendingOlder,
    loadNewer,
    loadAround,
    returnToLive,
    appendMessage,
    replaceMessage,
    catchUp,
    reconcile,
  } = useMessageHistory(initialMessages);
  // INFO: REQUIREMENTS.md § 16. The room is the only place the loaded window exists, so the offline transcript is stored from here rather than from the screen above it.
  useWriteChatSnapshot(messages, hasNewer);
  const { pending, send, sendMedia, sendEmoticon, retry, cancel, resolve } = useSendMessage({
    onSent: appendMessage,
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
  // INFO: REQUIREMENTS.md § 8.14. Whether there is a keyboard to type at, which is what holds § 8.14.'s type-ahead and its paste to the desktop.
  const isFinePointer = useIsFinePointer();
  // INFO: REQUIREMENTS.md § 8.6. The composer's whole stack is put away for the length of a search, and everything it drives has to go with it.
  const isSearching = bottomBar !== undefined;
  // WARN: REQUIREMENTS.md § 13.8. The exemption outlives the tab by the length of the keyboard's retraction, which is what this latch holds. Leaving 검색 unmounts the field the panel had focused and the keyboard is only reported down some 250ms later — released with the tab, those frames are an unexempted panel that collapses to nothing and reopens by itself once the keys finish sliding.
  // WARN: § 13.8. `isEmoticonPickerOpen` is what the latch may be *set* by, and it is not decoration. The tab is reported off a picker that never unmounts, so a `forcedTab` that outlived a close — `EmoticonPicker` records that happening twice — or a stored `jandh:emoticon-tab` of `search` reports 검색 with nothing on screen. The release below is the keyboard alone, so a latch set that way is held by every keyboard the reader opens afterwards, and `isComposerYielded` hangs the composer's whole existence on it. Only the release is allowed to outlive the picker.
  const isEmoticonSearchHeld = isEmoticonSearchTab && isEmoticonPickerOpen;

  if (
    isEmoticonSearchExempt !== isEmoticonSearchHeld &&
    (isEmoticonSearchHeld || !isKeyboardOpen)
  ) {
    setIsEmoticonSearchExempt(isEmoticonSearchHeld);
  }

  // WARN: Belt to the field's own `onFieldFocus` braces, and derived rather than an effect that closes it — Android reopens the keyboard on a field that is already focused, which fires no `focus` event for the picker to hear.
  // WARN: `!isSearching` is load-bearing beyond the drawing. The panel being open is one of § 8.12.'s two sustained typing sources, so a panel left open behind the search goes on announcing 입력 중 — and it would pop back open on 취소.
  // WARN: REQUIREMENTS.md § 13.8. The search tab is the one exemption from the keyboard gate, because its field is the keyboard's reason for being up — it is drawn one row tall precisely so it fits in what the keyboard leaves. Keyed on the tab and never on that field's focus: a blur and the keyboard's retraction are separate frames, and between them the unexempted panel closes underneath the user.
  const isEmoticonPanelOpen =
    isEmoticonPickerOpen && (!isKeyboardOpen || isEmoticonSearchExempt) && !isSearching;
  /**
   * REQUIREMENTS.md § 13.6. The composer stands down for as long as § 13.8.'s tab
   * holds the keyboard, so what the keys leave is the panel and the staged preview
   * alone.
   *
   * WARN: § 13.6.'s clamp on the preview is the whole reason. With the keys up the
   * viewport is short enough that the `min()` below takes its second arm, so the
   * preview is drawn overlapping the panel's top rows — on this tab by more than half
   * its height, which is a staged emoticon the user cannot see at all. The composer is
   * the one box in the stack nothing can reach at that moment: touching its field
   * closes the panel (`onFieldFocus`), so it holds a row open for a control the
   * keyboard has already taken the purpose out of. Out of the flow, the wrapper this
   * hangs from is bottom-anchored, so everything above it moves down by its height and
   * the clamp stops binding.
   *
   * WARN: Keyed on the tab and **never** additionally on `stagedEmoticon`, which is
   * where this first went wrong. That term made the first tap of § 13.6.'s double tap
   * the thing that hid the composer — so the results row dropped ~70px, out from under
   * a finger inside a 333ms window, and the second tap landed on a different cell.
   * `handleSelect` only sends on a repeated id, so quick-send simply stopped working.
   *
   * WARN: The row still moves once, and later than reading this suggests.
   * `useIsVirtualKeyboardOpen` reports the keys up only after `visualViewport` has
   * actually shrunk, so the hide lands at the *end* of the ~250ms slide rather than on
   * arrival at the tab — by which time a 고민 tap has painted its results and they are
   * tappable. A double tap begun in that window still splits across the drop. It is
   * one shift per open instead of one per tap, and the cost of closing it is the room
   * having to hear about the search field's focus to know the keys are on their way up.
   * Recorded rather than solved.
   *
   * WARN: `isEmoticonSearchExempt` and not `isEmoticonSearchTab`, and — since the
   * latch is what carries the retraction — the panel's own open flag is deliberately
   * *not* a term beside it. Both spellings dropped the composer back the frame 검색 was
   * left while the keyboard was still 250ms from being down, the composer popping into
   * a viewport that had not grown yet, re-binding the clamp and throwing the preview
   * behind the panel and out again. Written on the tab flag that was the tab change;
   * written on `isEmoticonPanelOpen` it was every other exit — the § 13.9. tap on the
   * history that closes the panel, and `peelComposerStack`'s Escape. The latch is
   * released by the keyboard alone, so every exit now retracts on the one schedule.
   *
   * WARN: Which puts the whole existence of the composer on one latch, so that latch is
   * guarded where it is set rather than here: `isEmoticonSearchHeld` will not arm it
   * without an open picker behind the tab. Armed by a stale tab report alone it would be
   * released by nothing the reader can still reach — the field, the toggle and
   * `onFieldFocus` are all inside the box this hides — and every keyboard opened for the
   * rest of the session would take the composer with it.
   *
   * INFO: `isKeyboardOpen` holds this to the case that has the problem. A pointer opens
   * the same tab against the whole viewport, where the clamp never binds and the
   * composer costs the preview nothing.
   *
   * WARN: `useIsVirtualKeyboardOpen` says it is never to branch layout (AGENTS.md
   * § 4.2.), and this is inside that rule rather than an exception to it. What § 4.2.
   * protects is the fine-pointer reader, shown the same UI and never a lesser one — and
   * the flag is gated on `useIsCoarsePointer`, so it is false there and this composer
   * never moves. It is also the term `isEmoticonPanelOpen` above is already written on,
   * for § 13.6.'s reason: what the keyboard covers is this exact stack, so the stack is
   * the one place the flag describes geometry rather than guessing at a device.
   *
   * WARN: § 13.8.'s two-bubble send is the cost, and it is a real one. `submit` is the
   * only path that posts a sentence beside the emoticon it went looking for, and it is
   * the composer's own — so while this holds, a draft is neither visible nor sendable
   * and the reader has to put the keyboard down to reach it. Recorded rather than
   * solved: against it, the preview was previously not visible at all.
   */
  const isComposerYielded = isEmoticonSearchExempt && isKeyboardOpen && editingId === null;
  // INFO: REQUIREMENTS.md § 8.14. The request `focusComposer` held, handed over the frame the row is back in the document — the composer skips a token it has already acted on, so this is the one bump the field is there to receive.
  // WARN: `isSearching` is `focusComposer`'s own refusal, repeated because this is the second way to reach that field. A § 8.6. search leaves § 13.8.'s tab and picker both standing, so the latch is released by the keyboard alone — put down mid-search, this would spend the held token on a stack that is `hidden` and `inert`, and 취소 would return to no caret. Held rather than dropped, so the search's own end replays it.
  // WARN: The overlays drop the hold instead of deferring it. A sheet or the § 9.1. picker opened during the retraction is the reader having moved on, and a caret taken back under an open sheet re-raises the keyboard beneath it.
  useEffect(() => {
    if (!isComposerFocusHeldRef.current || isComposerYielded || isSearching) {
      return;
    }

    isComposerFocusHeldRef.current = false;

    if (actionTarget !== null || isPickerOpen) {
      return;
    }

    setComposerFocusRequest((token) => token + 1);
  }, [actionTarget, isComposerYielded, isPickerOpen, isSearching]);
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
    typingUserIds,
    setIsReading,
    markRead,
  } = useChatStream();
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
  const mediaTrack = useViewerTrack(toSenderName);
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
  const typist = typingUserIds.length > 0 ? (participantById.get(typingUserIds[0]) ?? null) : null;
  const rows = useMemo(
    () => buildChatRows({ messages, pending, currentUserId }),
    [messages, pending, currentUserId],
  );
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
      countUnreadReaders,
    }),
    [scroller, scrollerWidth, readPreview, participantById, countUnreadReaders],
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
      element.scrollTop = element.scrollHeight;
    }
  }, []);

  useComposerClearance({ containerRef, composerRef, scrollerRef, isAtBottomRef });

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

  // INFO: DESIGN.md § 6.7. The same target `pinToBottom` takes, animated — the pill is a journey back to the live edge that the user asked for, not a pin.
  const scrollToBottom = useCallback(() => {
    scrollerRef.current?.scrollTo({ top: scrollerRef.current.scrollHeight, behavior: "smooth" });
  }, []);

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
    onOpenEmoticonSearch: toggleEmoticonSearch,
    onScrollHistory: scrollHistory,
    onTypeAhead: typeIntoComposer,
    onPasteText: pasteIntoComposer,
  });

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

  // WARN: A returning network moves no finger either, and a reader parked at the top through a failed page is exactly who is waiting on it. Both halves are needed: the cooldown drops the wait `loadOlder` is still serving, and the edge check is what asks again — nothing else would until the reader scrolls.
  useEffect(() => {
    function retryPagesOnReconnect() {
      clearOlderCooldown();
      syncScrollEdges();
    }

    window.addEventListener("online", retryPagesOnReconnect);

    return () => window.removeEventListener("online", retryPagesOnReconnect);
    // eslint-disable-next-line react-hooks/exhaustive-deps
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
    // eslint-disable-next-line react-hooks/exhaustive-deps
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
    if (initialJumpMessageId) {
      void jumpToMessage(initialJumpMessageId, { flash: true });
    }

    // WARN: § 8.6.1. The jump's settle loop outlives this component otherwise, and it calls into a virtualizer whose scroller has gone.
    return cancelJumpScroll;
    // eslint-disable-next-line react-hooks/exhaustive-deps
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
    // eslint-disable-next-line react-hooks/exhaustive-deps
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
      className={cn("relative min-h-0 flex-1", className)}
      {...fileDrop.handlers}
    >
      {chatBackgroundMediaId && (
        <ChatBackdrop mediaId={chatBackgroundMediaId} blurhash={chatBackgroundBlurhash} />
      )}
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
                className={cn("relative w-full", !hasSettledFirstPark && "invisible")}
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
            {/* INFO: REQUIREMENTS.md § 8.13. Stands exactly where the staged quote does, and never beside it — a correction composes no new message, so there is nothing for a quote to be the header of. */}
            {/* WARN: § 8.13. The quote is hidden rather than cleared, and comes back on cancel. Entering the mode must cost the user nothing they had already staged. */}
            {editingId !== null ? (
              <EditBar className="mx-md mt-xs mb-2xs" onCancel={cancelEdit} />
            ) : (
              replyTarget && (
                <ReplyBar
                  className="mx-md mt-xs mb-2xs"
                  replyTo={replyTarget}
                  name={participantById.get(replyTarget.senderId)?.name}
                  onCancel={() => setReplyTarget(null)}
                />
              )
            )}
            {/* INFO: REQUIREMENTS.md § 9.3. Tops the composer stack while it is up, clearing the history by the same `xs` every other row in this position does (DESIGN.md § 6.6.). It replaces nothing — a recording is sent outright, so there is no tray for it to compete with. */}
            {isRecording && (
              <VoiceRecorderBar
                className="mx-md mt-xs mb-2xs"
                onDone={sendVoice}
                onClose={() => setIsRecording(false)}
              />
            )}
            {/* INFO: DESIGN.md § 6.6. Same gap as the bar above and the panel below; `MediaTray` renders nothing with an empty selection, so this costs the resting composer no height. */}
            {/* WARN: REQUIREMENTS.md § 8.13. Hidden while a message is being corrected, never emptied — the drafts live in `useMediaSelection` and are still there when the edit is cancelled. An edit is text-only, and `canSend` refuses to arm on a tray the mode cannot send. */}
            {editingId === null && (
              <MediaTray
                className="mx-md mt-xs mb-2xs"
                drafts={selection.drafts}
                isReading={selection.isReading}
                onEdit={editing.open}
                onRemove={selection.remove}
              />
            )}
            {/* WARN: REQUIREMENTS.md § 13.6. Absolute so it adds nothing to the wrapper this hook measures — in flow it would grow the clearance and shove the history up under a preview that is glass and meant to float over it. */}
            {/* WARN: § 13.6. wants the preview above the open panel, but the panel is half the shell — `bottom-full` alone puts it behind the floating header on a short viewport and off the top of the screen below ~604px, which is the panel not appearing to stage at all. The `min()` stops it at the header and lets it overlap the panel's top rows instead, which only happens where something has to give. */}
            {/* INFO: § 13.8. The search tab used to be where it gave the most — the keyboard takes the viewport down far enough that the second arm won by more than half this box, so the staged emoticon was covered rather than merely crowded. `isComposerYielded` buys that back out of the composer's own row instead. */}
            {/* WARN: REQUIREMENTS.md § 8.13. Withheld while correcting, for the reason the tray above is — it is still staged and it returns on cancel. */}
            {stagedEmoticon && editingId === null && (
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
                // WARN: The underscores are the spaces `calc()` requires around `+`. Written closed up the declaration is invalid, and the strip resolves to `0px` — the panel opens to nothing and no cell can be tapped.
                // INFO: § 13.8. The search tab is drawn shorter, so the strip that clips it has to be told which of the two heights it is holding.
                isEmoticonPanelOpen && isEmoticonSearchTab
                  ? "h-[calc(var(--emoticon-search-panel-height)_+_var(--spacing-xs)_+_var(--spacing-2xs))]"
                  : isEmoticonPanelOpen
                    ? "h-[calc(var(--emoticon-panel-height)_+_var(--spacing-xs)_+_var(--spacing-2xs))]"
                    : "h-0",
              )}
              // WARN: The panel stays mounted through the collapse so it has something to animate, which leaves its tab stops in the document until this takes them back out.
              inert={!isEmoticonPanelOpen}
              onTransitionEnd={settleAfterPanelTransition}
            >
              {hasMountedEmoticonPanel && (
                // INFO: § 13.6. `mt-xs` matches the composer's own top padding, so the panel clears the history by what the bar alone clears it by. The height above is this panel plus both margins.
                // WARN: `shrink-0` or the collapsing strip compresses the panel instead of clipping it, and § 13.6.'s own `flex-1` scroller is what gives — the panel then reads as stretching open rather than rising.
                // INFO: § 13.6. Promoted to its own layer so the strip's growing clip is a compositor crop — unpromoted, every frame of the 200ms repaints a grid of animated images against a moving clip rect, which is what the open stutters on.
                <EmoticonPicker
                  className="mx-md mt-xs mb-2xs shrink-0 will-change-transform"
                  isOpen={isEmoticonPanelOpen}
                  focusRequest={pickerFocusRequest}
                  searchRequest={emoticonSearch}
                  revealRequest={emoticonReveal}
                  onSearchTabChange={reportEmoticonSearchTab}
                  onSelect={stageEmoticon}
                  onQuickSend={sendStagedEmoticon}
                />
              )}
            </div>
            {/* WARN: § 13.6. `hidden`, never a conditional subtree, for the reason the search's own hide above carries — the draft lives in this component's state and unmounting it discards a typed message along with its `useUnsentWork` hold. `display: none` is also the half that does the work: it takes the composer out of the wrapper `useComposerClearance` measures, which is what lowers the stack and hands the preview its room back. */}
            <MessageComposer
              className={cn(isComposerYielded && "hidden")}
              hasAttachments={selection.drafts.length > 0 || stagedEmoticon !== null}
              isEmoticonPickerOpen={isEmoticonPanelOpen}
              keywordConsumeToken={keywordConsumeToken}
              seededDraft={seededDraft}
              isEditing={editingId !== null}
              focusRequest={composerFocusRequest}
              fieldRef={composerFieldRef}
              // WARN: Toggled against what is on screen, not the flag behind it. The flag can be true while the keyboard suppresses the panel (§ 13.6.), and inverting it there closes a panel the user is asking to open.
              onToggleEmoticons={openEmoticonPanel}
              onAttach={() => setIsPickerOpen(true)}
              onEdit={signalEdit}
              onKeywordTap={openEmoticonSearch}
              onFieldFocus={closeEmoticonPanel}
              // TODO: Carry `inlineEmoticonItemIds` into the send, which needs `useSendMessage` and `POST /api/messages` to take them first. Nothing can stage one yet, so the drop is unreachable rather than silent.
              onSend={(content) => submit(content.text)}
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
    // INFO: REQUIREMENTS.md § 13.6. The preview autoplays the animation, and the sound is the other half of the same playback.
    playEmoticonSound(emoticon);
  }

  /**
   * INFO: REQUIREMENTS.md § 13.6. A double tap in the picker skips the preview. The first tap already staged it, so this only takes it back off the composer and sends.
   */
  function sendStagedEmoticon(emoticon: Emoticon) {
    void goLiveForSend();
    setStagedEmoticon(null);
    // WARN: REQUIREMENTS.md § 13.6. Synchronously inside the tap, like `submit` — iOS grants audio to this call stack alone.
    playEmoticonSound(emoticon);
    rememberEmoticon(emoticon.id);
    sendEmoticon(emoticon, replyTarget);
    // INFO: § 13.8. This path never goes through `submit`, so the field is still holding the word that found this emoticon — the composer clears it if that is all it holds.
    setKeywordConsumeToken((token) => token + 1);
    // WARN: § 13.8. The word is spent, the search is not. `emoticonSearch` deliberately stands, so the panel is still on the results this emoticon came from — sending one of a row of related pictures is the reason to have searched at all, and dropping back to the remembered pack means finding the word again for every one after the first.
    searchedWordRef.current = null;
    setReplyTarget(null);
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

    sendMedia([toVoiceDraft(recording)], replyTarget);
    setReplyTarget(null);
  }

  /**
   * INFO: The emoticon and the attachments go first, then the text, so a caption reads under what it belongs to rather than above it.
   *
   * WARN: The order survives because `useSendMessage` delivers on one promise chain. Firing these in parallel would let the text win the race for `messages.id` and land above them on every other client and every reload.
   */
  function submit(text: string) {
    // WARN: REQUIREMENTS.md § 8.13. Ahead of everything below, and it returns. A correction sends nothing — the staged quote, the tray and the emoticon all belong to a message that is not being composed, and falling through would post them beside the edit.
    if (editingId !== null) {
      void applyEdit(editingId, text);

      return;
    }

    void goLiveForSend();

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

    // WARN: REQUIREMENTS.md § 13.8. A draft that is nothing but the word the emoticon was found by was a search term, not a message — sending it would put 고민 in the conversation beside the picture it was only ever used to reach. Anything else keeps § 13.6.'s second bubble.
    if (text.trim() && !isConsumedByEmoticonSearch(text)) {
      send(text, take());
    }

    // WARN: § 13.8. The word is spent here, and the search is left standing — see `sendStagedEmoticon`.
    searchedWordRef.current = null;
    setReplyTarget(null);
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
  function closeEmoticonPanel() {
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
      closeEmoticonPanel();

      return;
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
   *
   * WARN: § 13.6.'s yield is the same invariant on a timer, and it is why the request
   * is held rather than dropped. The composer is `display: none` for the length of the
   * keyboard's retraction, `focus()` on that is the same silent no-op, and the token
   * behind it is one-shot — `MessageComposer` acts on a change and nothing re-bumps it
   * when the row comes back. Escape closing the panel and asking for the caret in one
   * handler is exactly that render, so the caret would be lost on the one route
   * REQUIREMENTS.md § 8.14. promises it on.
   */
  function focusComposer() {
    if (isSearching) {
      return;
    }

    if (isComposerYielded) {
      isComposerFocusHeldRef.current = true;

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

    composerFieldRef.current?.focus();
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

    field.focus();

    return document.execCommand("insertText", false, text);
  }

  /**
   * Whether a keystroke may reach the composer's field at all — the invariant
   * `focusComposer` refuses on, asked of the two routes that hold the node rather than
   * the token.
   *
   * INFO: § 13.6.'s yield is in it although the pointer test all but answers for it: a
   * fine pointer and a virtual keyboard is a tablet with a keyboard case, and the field
   * is `display: none` there for the same 250ms it is on a phone.
   */
  function reachesComposer(): boolean {
    return isFinePointer && !isSearching && !isComposerYielded;
  }

  /**
   * REQUIREMENTS.md § 8.14. `Escape` — one layer off the composer's stack, and the
   * caret back in the field either way.
   *
   * INFO: The panel first and the staged emoticon second, because that is the order
   * they were put there in. One press undoes one thing, which is the only reading of
   * `Escape` that stays predictable once a screen has more than one layer.
   *
   * WARN: § 13.6. This is not a route `Enter` may share, although both end with the
   * caret in the field. Someone pressing `Enter` wants to start typing, and would lose
   * the emoticon they had just staged to say it.
   */
  function peelComposerStack() {
    if (isSearching) {
      return;
    }

    if (isEmoticonPanelOpen) {
      closeEmoticonPanel();
    } else if (stagedEmoticon) {
      setStagedEmoticon(null);
    }

    // WARN: Through `focusComposer` and never a bump of its own. Closing the panel is the one exit that leaves § 13.6.'s yield standing for the length of the retraction, so this is the caller that most needs the request held — a bump here reaches a `display: none` field and is spent on it.
    focusComposer();
  }

  /**
   * REQUIREMENTS.md § 8.14. `⌘E` — REQUIREMENTS.md § 13.6.'s panel, on the tab it was
   * last left on, and focus moved into it so the arrows have something to move.
   *
   * WARN: § 13.6. The blur is the same one the toggle button makes and for the same
   * reason: the panel is gated on the keyboard being down, and iOS lowers it for a blur
   * alone — a key press is not one, so without this the flag flips and the panel never
   * gets to act on it.
   */
  function toggleEmoticonPanel() {
    if (isSearching || editingId !== null) {
      return;
    }

    if (isEmoticonPanelOpen) {
      peelComposerStack();

      return;
    }

    if (document.activeElement instanceof HTMLElement) {
      document.activeElement.blur();
    }

    setIsEmoticonPickerOpen(true);
    requestPickerFocus(true);
  }

  /**
   * REQUIREMENTS.md § 8.14. `⌘⇧E` — § 13.8.'s search, or away again if it is what is
   * already on screen.
   *
   * WARN: The toggle is here rather than in the panel, and that is why the panel no
   * longer answers this key at all. Whether 검색 is the tab on screen is this room's
   * state, so a copy inside `EmoticonPicker` could only ever open and never close.
   *
   * INFO: § 8.6. No word to seed it with — the composer owns the draft and is not what
   * is focused when this fallback is reached.
   *
   * WARN: § 8.13. The correction guard is `toggleEmoticonPanel`'s and it is needed
   * **here too**, for a reason that is easy to miss: the composer refuses this key
   * while editing and therefore does not `preventDefault` it, so the press falls
   * straight through to this fallback — and the hook's own `isCovered` is about the
   * *attachment* editor, not a message being corrected. Without it the panel opened
   * mid-edit and staged an emoticon the correction has no row to send, invisibly,
   * since § 8.13. hides the tray that would have shown it.
   */
  function toggleEmoticonSearch() {
    if (isSearching || editingId !== null) {
      return;
    }

    if (isEmoticonPanelOpen && isEmoticonSearchTab) {
      peelComposerStack();

      return;
    }

    openEmoticonSearch("");
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
   * WARN: § 8.14. `⌘E` reaches this with an empty query where no word is underlined,
   * and an empty `searchedWordRef` is not a word the send may spend — `""` is what a
   * cleared draft trims to, so the next quick send would swallow whatever had been
   * typed since.
   */
  function openEmoticonSearch(query: string) {
    setEmoticonSearch({ query, token: Date.now() });
    searchedWordRef.current = query === "" ? null : query;
    // WARN: Set here as well as reported back by the picker's own effect. The gate above reads it in the same commit the panel is asked to open in, and waiting for the effect leaves one frame where the panel is open, the keyboard is still retracting and the exemption is not in yet — which closes it again.
    setIsEmoticonSearchTab(true);
    setIsEmoticonPickerOpen(true);
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
            onFollowEmoticon={toFollowEmoticon(row.pending.emoticon)}
            onRetry={() => retry(row.pending.clientMsgId)}
            onCancel={() => cancel(row.pending.clientMsgId)}
          />
        );
      }
      case "message": {
        // WARN: REQUIREMENTS.md § 8.13. A withdrawn message is a tombstone and nothing else — no payload to draw, no quote to follow, and not one of the affordances below. It is deliberately an early return rather than a pile of conditions on the row that follows.
        if (row.message.isDeleted) {
          return (
            <MessageRow
              text={null}
              createdAt={row.message.createdAt}
              sender={participantById.get(row.message.senderId)}
              isMine={row.isMine}
              isFirstOfGroup={row.isFirstOfGroup}
              isLastOfGroup={row.isLastOfGroup}
              isDeleted
              isHighlighted={row.message.id === highlightedId}
              status="sent"
            />
          );
        }

        const cells = toCellsFromMedia(row.message.media);
        // INFO: REQUIREMENTS.md § 8.13. A withdrawn parent is still reachable — it keeps its place as a tombstone, so the jump lands on where the message was instead of failing.
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
            unreadCount={countUnreadReaders(row.message)}
            isEdited={row.message.editedAt !== null}
            isHighlighted={row.message.id === highlightedId}
            searchQuery={searchQuery}
            status="sent"
            onShare={
              canShareMessage(row.message) ? () => void shareMessage(row.message) : undefined
            }
            onOpenMedia={(index, origin) =>
              openAttachment(cells, index, row.message.id, row.message.senderId, origin)
            }
            onOpenReply={quoted ? () => void jumpToMessage(quoted.id, { flash: true }) : undefined}
            onFollowEmoticon={toFollowEmoticon(row.message.emoticon)}
            onLongPress={() => setActionTarget(row.message)}
            onReply={() => stageReply(row.message)}
          />
        );
      }
    }
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
    router.push(
      `${ARCHIVE_GALLERY_ROUTE}?${new URLSearchParams({ [ARCHIVE_TARGET_PARAM]: cell.id })}`,
    );
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
    const emoticon = target.emoticon;

    // INFO: REQUIREMENTS.md § 13.9. The same action the bubble's own tap performs, offered here because a mouse reaches this sheet by right-click (`DESIGN.md § 3.2.`) — and because a tap that also replays a sound is not the only way anyone should have to ask for it.
    if (emoticon) {
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
    setReplyTarget({
      senderId: message.senderId,
      kind: message.type,
      text: message.text?.slice(0, REPLY_PREVIEW_MAX_LENGTH) ?? null,
      // INFO: REQUIREMENTS.md § 8.10. The same call `listReplyPreviews` makes on the server, so the optimistic quote and the echoed one cannot disagree about whether the row has a tile.
      thumbnail: message.isDeleted ? null : toQuoteThumbnail(message.emoticon, message.media),
      // WARN: REQUIREMENTS.md § 8.13. A withdrawn parent surrenders its payload here too. Nothing routes 답장 onto a tombstone today, but that is the row it is rendered on rather than a property of this function — and `listReplyPreviews` nulls all four, so staging them live would be the optimistic/echo disagreement `toQuoteThumbnail` exists to rule out.
      mediaKind: message.isDeleted ? null : toMediaNoun(message.media),
      mediaCount: message.isDeleted ? 0 : message.media.length,
      isDeleted: message.isDeleted,
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
  async function jumpToMessage(id: MessageId, { flash }: { flash: boolean }) {
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

      settleJumpScroll(index);

      // WARN: DESIGN.md § 6.10. A property of the jump, never of whether a search happens to be open. The flash is for a jump with nothing else to point at — a quote, whose parent need not contain the query, so keying this on the search being open leaves such a jump marked by nothing at all.
      if (flash) {
        // WARN: `flushSync`, and after the bail-out above. A CSS animation restarts only when the class is applied, so a second jump to the row already flashing has to commit its removal *before* re-adding it — batched, the two updates collapse into a render whose state never changed and the wash never plays again. A jump that found no row keeps the flash it has rather than clearing one it cannot replace.
        flushSync(() => setHighlightedId(null));
        setHighlightedId(id);
      }
    });
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
    assert();

    function assert() {
      // WARN: Not `behavior: "smooth"`. A jump crosses an arbitrary distance, so smooth animates through history the user did not ask to see, and the window it is animating over was replaced a frame ago — and a re-assert would then be measuring a scroll still in flight.
      virtualizer.scrollToIndex(index, { align: "center" });

      // WARN: The offset the row *resolves* to, never the scroller's own. Before WebKit's first `ResizeObserver` delivery two asserts land on the identical `scrollTop` — nothing has been measured yet — and a loop that reads settling off that exits one frame before the corrections it exists to absorb.
      const offset = virtualizer.getOffsetForIndex(index, "center")?.[0] ?? Number.NaN;

      remaining -= 1;

      if (offset === previous || remaining <= 0) {
        return;
      }

      previous = offset;
      jumpFrameRef.current = requestAnimationFrame(assert);
    }
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
    seedDraft(message.text ?? "");
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
  async function applyEdit(id: MessageId, text: string) {
    const current = messages.find((entry) => entry.id === id);
    const edited = text.trim();

    setEditingId(null);

    // INFO: REQUIREMENTS.md § 8.13. Reopening the field and submitting it untouched is not a correction — stamping `edited_at` for it would put 수정됨 on a message nobody changed.
    if (edited === current?.text) {
      return;
    }

    try {
      await requestMessageEdit(id, edited);

      if (current) {
        replaceMessage({ ...current, text: edited, editedAt: new Date().toISOString() });
      }
    } catch {
      toast.error("메시지를 수정하지 못했어요");
      // WARN: The composer clears the field on submit, so a failure has to hand the correction back — otherwise the user's rewrite is gone and the only recovery is to type it again.
      setEditingId(id);
      seedDraft(edited);
    }
  }

  // WARN: The token is what makes a repeat an instruction. Two cancels both seed `""`, and a bare value would make the second one no change at all.
  function seedDraft(text: string) {
    seedTokenRef.current += 1;
    setSeededDraft({ text, token: seedTokenRef.current });
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
  if (message.senderId !== currentUserId || message.isDeleted) {
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
        {/* INFO: Anchored to the bottom, so it holds one position on screen while the slot opens under it rather than travelling with the clip. */}
        {/* WARN: REQUIREMENTS.md § 8.12. It fades in *after* the slot has finished opening, and the delay is what makes the reveal readable. The strip clips, so a row drawn during the growth is a horizontal cut travelling down through the avatar and the bubble — held at zero for those 200ms the reader sees the conversation pushed up by an empty gap, and the row appears in a slot that is already its own size. */}
        {typist && (
          <TypingIndicator
            className="absolute inset-x-0 bottom-0 animate-in delay-200 duration-150 fill-mode-both fade-in"
            typist={typist}
          />
        )}
      </div>
      <div className="h-(--chat-bottom-gap)" />
    </>
  );
}
