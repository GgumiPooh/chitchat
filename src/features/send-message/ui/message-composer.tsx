"use client";

import {
  findKeywordMatch,
  MAX_EMOTICON_ID_LOOKUP,
  MAX_MESSAGE_LENGTH,
  OBJECT_PLACEHOLDER,
  toEmoticonAssetUrl,
  toPlaceholderIndex,
  type KeywordMatch,
  type NotifyMode,
} from "@/shared/config";
import {
  A_SECOND,
  cn,
  focusWithoutPan,
  isCommandKey,
  isDigitKey,
  isLetterKey,
  isMenuKey,
  takeFocusWithoutPan,
  toCommandKeyLabel,
  useIsCoarsePointer,
  useIsFinePointer,
  useUnsentWork,
  type EmoticonItemId,
  type Nullable,
} from "@/shared/lib";
import { OFFLINE_MESSAGES, useOfflineGate } from "@/shared/offline-ux";
import {
  EditableField,
  HapticTarget,
  IconButton,
  InlineEmoticon,
  Textarea,
  type EditableObject,
} from "@/shared/ui";
import { useQuery } from "@tanstack/react-query";
import { ArrowUp, BellOff, Lock, Plus, Smile, Sparkles } from "lucide-react";
import {
  Fragment,
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type ChangeEvent,
  type KeyboardEvent,
  type PointerEvent,
  type ReactNode,
  type Ref,
  type RefObject,
  type SyntheticEvent,
  type TransitionEvent,
} from "react";
import { findKeywordTypo, isOneJamoEdit } from "../model/find-keyword-typo";
import { toEmoticonKeywordsQuery } from "../model/keywords-query";
import { useEmoticonSearch } from "../model/use-emoticon-search";
import { warmEmoticonUrls } from "../model/warm-emoticon-images";

/**
 * The box the field and its keyword layer must both be drawn in.
 *
 * WARN: REQUIREMENTS.md § 13.8. Shared between the two on purpose. The layer paints
 * an underline that has to land under a word the *textarea* laid out, so any
 * padding, font or wrapping rule that reaches one and not the other slides the mark
 * off the word it belongs to.
 */
// WARN: DESIGN.md § 6.6. The vertical padding is what makes the field's *natural* height exactly the `min-h-11` beside it — 10.75+22.5+10.75 = 44. Nothing here can centre its text, so any height `min-height` adds over the intrinsic one is slack that lands entirely under the line, and the single line the composer opens on then sits above the discs it shares the pill with.
// WARN: DESIGN.md § 4.2.3. `break-all` is this field's departure from the app-wide `keep-all`, and it is stated here so it cannot reach the field without the layer.
const FIELD_BOX = "px-2xs py-[10.75px] text-body-md leading-normal break-all";

// WARN: Hoisted so the pending query answers one array identity — an inline `= []` re-runs the match on every render of a field being typed into.
const NO_KEYWORDS: string[] = [];

// INFO: DESIGN.md § 6.6. The sparks the AI toggle throws as it leaves — a four-point star, small enough that the shape reads as a glint rather than a polygon.
const SPARKLE_SHAPE =
  "[clip-path:polygon(50%_0%,61%_39%,100%_50%,61%_61%,50%_100%,39%_61%,0%_50%,39%_39%)]";

// INFO: DESIGN.md § 6.6. Each spark's own vector, spin and stagger — written out rather than randomised, so the burst is one authored gesture instead of a different accident every time the field is typed into.
const AI_SPARKLES = [
  { size: "size-1.5", x: "-22px", y: "18px", spin: "160deg", delay: "0ms" },
  { size: "size-1", x: "-6px", y: "26px", spin: "-140deg", delay: "60ms" },
  { size: "size-2", x: "14px", y: "12px", spin: "120deg", delay: "40ms" },
  { size: "size-1", x: "20px", y: "28px", spin: "-180deg", delay: "120ms" },
  { size: "size-1.5", x: "0px", y: "-16px", spin: "200deg", delay: "90ms" },
];

// WARN: DESIGN.md § 6.6. The toggle's *return* is held this long: a virtual-keyboard Hangul IME re-composes a syllable by emptying the field and refilling it, outside the composition it ended first, so "닭" left four empty frames behind and threw the burst once per jamo.
const AI_TOGGLE_RETURN_DELAY = A_SECOND / 5;

// INFO: § 13.8. Only the toggle's preview *disappearing* waits this out — a hit is shown the moment it decodes, but losing one mid-word (still typing past it, or the debounce chasing a faster hand) reverts to 스마일 and back on almost every keystroke without it.
const TOGGLE_PREVIEW_HIDE_DEBOUNCE = A_SECOND / 3;

/** An emoticon the draft can hold inside its text — REQUIREMENTS.md § 6.'s `OBJECT_PLACEHOLDER`, with what it takes to draw one. */
export type ComposerEmoticon = {
  /** REQUIREMENTS.md § 13.4. `updated_at` in milliseconds, which is what an edited item's asset URL is told apart by. */
  version: number;
  /** The asset's own pixels; the box is one line tall and takes only their ratio. */
  width: number;
  height: number;
  hasAudio: boolean;
  name?: Nullable<string>;
  id: EmoticonItemId;
};

// WARN: The key is the draft's own, never the item id — the same emoticon twice is two placeholders, and a deletion has to say which of them went.
type StagedEmoticon = ComposerEmoticon & { key: string };

// INFO: One state and not two. The text and the emoticons standing in it are read as a pair (`isMessageContentPaired`), so nothing may re-render holding one of them from before an edit.
type Draft = { text: string; emoticons: StagedEmoticon[] };

/** What a send hands over: the text with its placeholders, and what each one stands for. */
export type ComposedMessage = { text: string; emoticons: ComposerEmoticon[] };

const EMPTY_DRAFT: Draft = { text: "", emoticons: [] };

export type MessageComposerProps = {
  className?: string;
  fieldClassName?: string;
  /** Attachments and a staged emoticon both sit above the composer, so send stays available on an empty field. */
  hasAttachments?: boolean;
  /** REQUIREMENTS.md § 9.1. Files still being decoded into the tray — the send is held until they land, never sent around them. */
  isStaging?: boolean;
  isEmoticonPickerOpen?: boolean;
  /**
   * REQUIREMENTS.md § 8.5. AI 질문 모드 — the field composes a question for the
   * room's selected context rather than an ordinary message. A staged emoticon or
   * attachment tray still rides along with the send, ahead of the question text.
   */
  isAiMode?: boolean;
  /**
   * REQUIREMENTS.md § 13.8. Bumped by the room when an emoticon found this way is
   * sent, which is the moment the searched word leaves the field.
   *
   * WARN: A token rather than a boolean — two sends of the same query are two
   * instructions, and a boolean's second one would be no change at all.
   */
  keywordConsumeToken?: number;
  /**
   * REQUIREMENTS.md § 8.13. Text pushed into the field from outside — the room
   * handing over a message the user asked to correct.
   *
   * WARN: A token beside the text, for the reason `keywordConsumeToken` carries
   * one. Correcting the same message twice is two instructions, and comparing the
   * text alone would make the second one no change at all.
   */
  seededDraft?: { text: string; emoticons?: readonly ComposerEmoticon[]; token: number };
  /**
   * REQUIREMENTS.md § 13.6. An emoticon the picker chose, put into the draft.
   *
   * WARN: A token beside it, for the reason `seededDraft` carries one: the same
   * emoticon chosen twice is two instructions, and comparing the item alone would make
   * the second one no change at all.
   *
   * INFO: § 8.14. Put in at the caret the field last held, with no branch on whether
   * that caret is live — § 13.6.'s panel blurs the field to open, and `EditableField`
   * remembers the position across that. The field then leaves the caret past what was
   * inserted, so a run of them goes in in order.
   */
  insertedEmoticon?: { emoticon: ComposerEmoticon; token: number };
  /**
   * REQUIREMENTS.md § 13. 미니's own 지우기 button, asking for the same Backspace the
   * field's own key would take — one placeholder and its emoticon together, or one
   * grapheme cluster of plain text.
   *
   * WARN: A token, for `insertedEmoticon`'s reason — two presses are two instructions,
   * and there is nothing about the second for a boolean to report.
   */
  deleteRequest?: { token: number };
  /** REQUIREMENTS.md § 8.13. The field is correcting a message rather than composing one, so the controls that stage a *new* payload have nothing to act on. */
  isEditing?: boolean;
  /** REQUIREMENTS.md § 16.1. 조용히 보내기 / 나에게만 보내기 — a one-line notice above `header`, coexisting with it rather than taking its slot. */
  notifyMode?: NotifyMode;
  /**
   * DESIGN.md § 6.10. The staged quote — or § 6.10.1.'s correction notice — as the
   * pill's own first row, above the field it is the header of.
   *
   * WARN: A slot rather than the preview itself. Both bars are the room's, and a
   * feature may not reach into a widget for them.
   */
  header?: ReactNode;
  /**
   * REQUIREMENTS.md § 8.14. Bumped by the room to put the caret back in this field —
   * `Escape` from anywhere in the conversation.
   *
   * WARN: A token rather than a ref handed down, for the reason `seededDraft` carries
   * one: two returns to the field are two instructions, and there is nothing about the
   * second one for a boolean to report. `0` is the resting value and asks for nothing,
   * so a mounting composer does not steal focus from the screen it mounted with.
   */
  focusRequest?: number;
  /**
   * REQUIREMENTS.md § 8.14. The field itself, for the one caller `focusRequest` cannot
   * serve.
   *
   * WARN: A ref beside the token rather than in place of it, because the two are
   * asked for at different moments. A token is answered an effect later, which is
   * everything Escape and § 8.13.'s correction want and is exactly what a keystroke
   * with nothing focused cannot use: the character is inserted by the default action
   * of the very `keydown` that asked, so the focus has to have moved before that
   * handler returns or it is typed into nothing and lost.
   */
  fieldRef?: RefObject<Nullable<HTMLDivElement | HTMLTextAreaElement>>;
  onToggleAiMode?: () => void;
  onAttach: () => void;
  /** REQUIREMENTS.md § 13.6. Reaching for the field is a request for the keyboard, which the picker would then be buried under. */
  onFieldFocus?: () => void;
  /** REQUIREMENTS.md § 8.12. Each edit, carrying whether the field still holds anything — `false` is the end of composing, not a quieter form of it. */
  onEdit?: (isComposing: boolean) => void;
  onToggleEmoticons?: () => void;
  /** REQUIREMENTS.md § 13.8. A tap on the underlined word, carrying what was typed rather than the keyword it hit. */
  onKeywordTap?: (query: string) => void;
  /** REQUIREMENTS.md § 13.8. A tap on the toggle while it stands in for the matched word's top hit. */
  onPreviewTap?: (query: string) => void;
  /** REQUIREMENTS.md § 13.8. The current keyword suggestion, kept by the room so a later manual move to 검색 can seed its field. */
  onSuggestedSearchQueryChange?: (query: string) => void;
  // INFO: REQUIREMENTS.md § 13. The emoticons whole rather than their ids alone — the optimistic bubble has to reserve the box the echoed row will, and only these carry it.
  onSend: (message: ComposedMessage) => void;
};

// INFO: DESIGN.md § 6.6. A floating bar over the message column, not a flow child — the messages are meant to pass under it, which is also what gives the glass something to blur.
export function MessageComposer({
  className,
  fieldClassName,
  hasAttachments = false,
  isStaging = false,
  isEmoticonPickerOpen = false,
  isAiMode = false,
  keywordConsumeToken,
  seededDraft,
  insertedEmoticon,
  deleteRequest,
  isEditing = false,
  notifyMode = "notify",
  header,
  focusRequest = 0,
  fieldRef: exposedFieldRef,
  onToggleAiMode,
  onAttach,
  onFieldFocus,
  onEdit,
  onToggleEmoticons,
  onKeywordTap,
  onPreviewTap,
  onSuggestedSearchQueryChange,
  onSend,
}: MessageComposerProps) {
  const fieldRef = useRef<Nullable<HTMLDivElement | HTMLTextAreaElement>>(null);
  const headerRef = useRef<Nullable<HTMLDivElement>>(null);
  const [headerHeight, setHeaderHeight] = useState(0);
  // INFO: DESIGN.md § 6.10. Held so the collapse animates over the row that is leaving rather than over an empty clip; a fresh header replaces it on the render it arrives.
  const [retainedHeader, setRetainedHeader] = useState<ReactNode>(null);
  const notifyRef = useRef<Nullable<HTMLDivElement>>(null);
  const [notifyHeight, setNotifyHeight] = useState(0);
  // INFO: REQUIREMENTS.md § 16.1. Held through the collapse animation when returning to "notify" mode.
  const [retainedNotifyMode, setRetainedNotifyMode] = useState<NotifyMode>(notifyMode);

  if (header && header !== retainedHeader) {
    setRetainedHeader(header);
  }

  if (notifyMode !== "notify" && notifyMode !== retainedNotifyMode) {
    setRetainedNotifyMode(notifyMode);
  }

  /**
   * Both refs off one callback. The field is this component's to drive; the room only
   * ever reads the node, to reach it inside the event that needs it.
   *
   * WARN: Memoized, and the room is why. An inline callback is a new ref on every
   * render — and this component re-renders on every keystroke — so React would detach
   * it with `null` and reattach it on each of those commits. The room reads this node
   * from inside a `keydown`, where a ref that is momentarily `null` is a character
   * typed into nothing.
   */
  const takeField = useCallback(
    (node: Nullable<HTMLDivElement | HTMLTextAreaElement>) => {
      fieldRef.current = node;

      if (exposedFieldRef) {
        exposedFieldRef.current = node;
      }
    },
    [exposedFieldRef],
  );
  const layerRef = useRef<Nullable<HTMLDivElement>>(null);
  // INFO: § 8.14. Where the field last held its caret, which is where an emoticon from the picker goes in. Written by the field itself; null until it has held one.
  const caretOffsetRef = useRef<Nullable<number>>(null);
  const [draft, setDraft] = useState(EMPTY_DRAFT);
  /**
   * Whether the field is a plain `Textarea` (`false`) or an `EditableField` (`true`).
   * Mobile Safari mispaints the contenteditable caret after a newline, so a draft with
   * nothing to hold between its characters stays on `Textarea`; the moment a mini
   * emoticon enters — or is still there in a seeded correction — the field has to be
   * the one element that can draw one.
   */
  const isElevated = draft.emoticons.length > 0;
  // INFO: What the effect below saw `isElevated` as last time it ran, so it can tell a demotion apart from every other render.
  const wasElevatedRef = useRef(isElevated);
  /**
   * Whether the field held focus at the moment its last edit was reported, so the
   * effect below knows a demotion is one to chase with focus rather than leave alone.
   *
   * WARN: A Backspace that empties the object list is never mid-IME-composition —
   * `EditableField.report` only reaches the object-deletion path outside a
   * composition — so a demotion always lands between keystrokes and this effect
   * always has a settled DOM to hand focus back into.
   */
  const pendingRefocusRef = useRef(false);
  // INFO: REQUIREMENTS.md § 8.13. The last seed this component has taken, so the render-phase adjustment below fires once per instruction rather than on every render.
  const [seenSeedToken, setSeenSeedToken] = useState(seededDraft?.token);
  // INFO: § 13.6. The last emoticon taken from the picker, for the reason the seed keeps a token — the adjustment below is the same one.
  const [seenInsertToken, setSeenInsertToken] = useState(insertedEmoticon?.token);
  // INFO: § 13. 미니's 지우기, for the reason `seenInsertToken` keeps one — the adjustment below is the same shape, run in reverse.
  const [seenDeleteToken, setSeenDeleteToken] = useState(deleteRequest?.token);
  // INFO: § 13.8. What the last tap searched for, so a send can tell whether the field still holds only that.
  const tappedQueryRef = useRef<Nullable<string>>(null);
  const isCoarsePointer = useIsCoarsePointer();
  const attachGate = useOfflineGate(OFFLINE_MESSAGES.upload);
  // INFO: REQUIREMENTS.md § 8.14. The shortcuts appear nowhere else on screen, so the one field every reader already looks at carries the one key that lists the rest.
  const isFinePointer = useIsFinePointer();
  const hasDraft = draft.text.trim().length > 0;
  // INFO: `AI_TOGGLE_RETURN_DELAY`. Taken the instant the field has text and given back only once it has stayed empty, so no gap an IME opens inside a syllable reaches the toggle.
  const [isDraftLatched, setIsDraftLatched] = useState(hasDraft);
  // INFO: REQUIREMENTS.md § 8.5., DESIGN.md § 6.6. The toggle gives its width to the field the moment there is a draft — but never while AI 질문 is on, where it is the only way back out of the mode.
  const isAiToggleCollapsed = !isEditing && !isAiMode && (hasDraft || isDraftLatched);

  // INFO: Taken during render, as `sparkle` below is — an effect would give the collapse a frame the burst is keyed off, and the release is the only half that may wait.
  if (hasDraft && !isDraftLatched) {
    setIsDraftLatched(true);
  }

  // INFO: DESIGN.md § 6.6. The burst is keyed rather than toggled: a CSS animation restarts on a remount, and nothing else in this row may remount (see the send button's own WARN).
  // INFO: React's "adjust state during render", as `ActionSheet` does — the token is seeded from the first render's own state, so a room re-entered with a draft already in the field opens without throwing sparks at nobody.
  const [sparkle, setSparkle] = useState({
    isCollapsed: isAiToggleCollapsed,
    isAiMode,
    collapseToken: 0,
    modeToken: 0,
  });
  if (sparkle.isCollapsed !== isAiToggleCollapsed || sparkle.isAiMode !== isAiMode) {
    setSparkle({
      isCollapsed: isAiToggleCollapsed,
      isAiMode,
      collapseToken: isAiToggleCollapsed ? sparkle.collapseToken + 1 : sparkle.collapseToken,
      // INFO: DESIGN.md § 6.6. Counted both ways, where the collapse counts one — entering and leaving AI 질문 are each a deliberate press on this button, and the collapse's return is only the field going quiet.
      modeToken: sparkle.isAiMode !== isAiMode ? sparkle.modeToken + 1 : sparkle.modeToken,
    });
  }
  // WARN: The sum, so each glyph can still gate its own pop on the half that moves it — the burst is thrown by both, and keyed on one counter it would be dropped whenever the two changed in the same render.
  const sparkleToken = sparkle.collapseToken + sparkle.modeToken;
  const collapseToken = sparkle.collapseToken;
  const modeToken = sparkle.modeToken;
  useEffect(() => {
    if (hasDraft) {
      return;
    }

    const timer = setTimeout(() => setIsDraftLatched(false), AI_TOGGLE_RETURN_DELAY);

    return () => clearTimeout(timer);
  }, [hasDraft]);
  // INFO: REQUIREMENTS.md § 8.13. An edit sends text and only text, so a tray left staged behind the mode cannot arm the button — emptying the field has to disable it, or the correction would submit nothing.
  // WARN: Held while a pick is still decoding, the way 보관함's own 대화에 보내기 is (`useShelfStaging`'s `isHeld`). Sent around them, `takeAll` empties a tray the remaining decodes then refill — the sender gets four of nine photos out and five back in the composer.
  // INFO: REQUIREMENTS.md § 8.5. A staged tray or emoticon rides along with an AI question, but never alone — attachments are not a question, so only text arms the button.
  const canSend = isAiMode
    ? hasDraft && !isStaging
    : (hasDraft || (hasAttachments && !isEditing)) && !isStaging;
  // INFO: § 13.8. Hidden packs count here, exactly as they do in the panel's search — the underline offers a word the search can answer, and the search looks across the whole library.
  // INFO: § 13.8. Deduplicated by the `DISTINCT` that produced it, so there is no `Set` to build — `findKeywordMatch` only ever iterates what it is given.
  // WARN: § 13.6. A cache read and never a fetch. This component mounts with the room, so an enabled query put `?keywords=1` on every room entry — the path `useEmoticonPreload` was written to keep clear; that hook warms this same descriptor from its idle callback and the underline appears when it lands.
  const {
    data: keywords = NO_KEYWORDS,
    refetch: refetchKeywords,
    isFetched: hasFetchedKeywords,
  } = useQuery({
    ...toEmoticonKeywordsQuery(),
    enabled: false,
  });

  useEffect(() => {
    if (draft.text.trim() !== "" && !hasFetchedKeywords) {
      void refetchKeywords();
    }
  }, [draft.text, hasFetchedKeywords, refetchKeywords]);

  const match = useMemo(() => findKeywordMatch(draft.text, keywords), [draft.text, keywords]);
  const typoKeywordQuery = useMemo(
    () => (match ? null : findKeywordTypo(draft.text, keywords)),
    [draft.text, keywords, match],
  );
  // INFO: § 13.8. A completed word can turn into an IME slip as its final consonant settles (`어디` → `어딩`), so the toggle keeps the last answer while the reader is still adding to that word. A deletion starts a new search instead.
  const [fallbackKeywordQuery, setFallbackKeywordQuery] = useState<Nullable<string>>(null);
  const discoveredKeywordQuery = match?.query ?? typoKeywordQuery;
  const keywordQuery = discoveredKeywordQuery ?? fallbackKeywordQuery ?? "";

  useEffect(() => {
    onSuggestedSearchQueryChange?.(keywordQuery);
  }, [keywordQuery, onSuggestedSearchQueryChange]);

  // INFO: § 13.8. The toggle's own preview — the underlined word's top hit, decoded before it is ever drawn (`warmEmoticonUrls(decodes: true)`), so the swap never shows a skeleton in the button's place.
  const { results: previewResults, isPending: isPreviewSearchPending } = useEmoticonSearch(
    keywordQuery,
    !isEditing,
    false,
  );
  const previewResult = previewResults[0] ?? null;

  // WARN: Adjusted during render rather than by an effect. A query can settle in the same commit as the IME turns `어디` into `어딩`; an effect would leave the fallback unset for that one render and drop the toggle's preview.
  if (
    discoveredKeywordQuery &&
    !isPreviewSearchPending &&
    previewResults.length > 0 &&
    fallbackKeywordQuery !== discoveredKeywordQuery
  ) {
    setFallbackKeywordQuery(discoveredKeywordQuery);
  }
  const [decodedPreview, setDecodedPreview] =
    useState<Nullable<{ version: number; url: string; id: EmoticonItemId }>>(null);

  useEffect(() => {
    if (!previewResult) {
      return;
    }

    let cancelled = false;
    // INFO: § 13.8. Read off the item's own flags rather than always asking `still-image` — asking the slot it does not carry is exactly what `toSlotAsset` marks `isFallback` and shortens the cache for (`get-emoticon-asset.ts`), and every item here carries one or the other.
    const slot = previewResult.hasStill ? "still-image" : "animated-image";
    const url = toEmoticonAssetUrl(previewResult.id, slot, previewResult.version);

    void warmEmoticonUrls([url], () => cancelled, true).then(() => {
      if (!cancelled) {
        setDecodedPreview({ id: previewResult.id, version: previewResult.version, url });
      }
    });

    return () => {
      cancelled = true;
    };
  }, [previewResult]);

  // INFO: Derived rather than cleared from the effect above — a result that disappears (the field emptied, or the debounce moved on) must drop the button's preview on the very render it does, not a tick later through a second `setState`.
  const previewUrl =
    previewResult &&
    decodedPreview?.id === previewResult.id &&
    decodedPreview.version === previewResult.version
      ? decodedPreview.url
      : null;
  const [displayedPreviewUrl, setDisplayedPreviewUrl] = useState<Nullable<string>>(null);
  const prevPreviewUrlRef = useRef(previewUrl);

  // WARN: § 13.8. Adjusted during render rather than in an effect, for `seededDraft`'s reason above — a hit has to swap in on the very render it decodes, and an effect lands a frame later.
  if (previewUrl !== prevPreviewUrlRef.current) {
    prevPreviewUrlRef.current = previewUrl;

    if (previewUrl) {
      setDisplayedPreviewUrl(previewUrl);
    }
  }

  // WARN: § 13.8. Only the *disappearing* half goes through a timer, and only here — a delay is a side effect, where the render-phase swap above is instant on purpose.
  useEffect(() => {
    if (previewUrl) {
      return;
    }

    const timer = setTimeout(() => setDisplayedPreviewUrl(null), TOGGLE_PREVIEW_HIDE_DEBOUNCE);

    return () => clearTimeout(timer);
  }, [previewUrl]);

  // INFO: § 13.6. Held back while the panel is open — the panel this button now closes is what the sticker's own tab already shows, so the toggle reads by its usual glyph rather than repeating the pack behind it.
  const showsPreview = displayedPreviewUrl !== null && !isEmoticonPickerOpen;
  // INFO: The emoticons as the field draws them, one per placeholder in `draft.text` and in that order.
  const objects = useMemo<EditableObject[]>(
    () =>
      draft.emoticons.map(({ key, version, width, height, name, id }) => ({
        key,
        node: (
          <InlineEmoticon itemId={id} version={version} width={width} height={height} name={name} />
        ),
      })),
    [draft.emoticons],
  );

  /**
   * REQUIREMENTS.md § 8.14. A Backspace that empties the object list demotes the field
   * to `Textarea` on the very render it triggers — this is what picks focus back up on
   * the node that replaces it, so typing carries on rather than landing on nothing.
   *
   * WARN: A layout effect and not an effect, so the swap settles before the browser
   * paints the frame — iOS Safari reads a focus change that straddles a paint as the
   * keyboard going down and back up, which is the flicker `Textarea` was chosen to
   * avoid causing in the first place.
   *
   * INFO: Never fires for the opposite direction. § 13.6.'s picker is the only way an
   * emoticon enters the draft, and it blurs the field to open — `EditableField`'s own
   * mount effect already restores that caret once focus returns, with nothing here to add.
   */
  useLayoutEffect(() => {
    const wasElevated = wasElevatedRef.current;

    wasElevatedRef.current = isElevated;

    if (wasElevated && !isElevated && pendingRefocusRef.current) {
      pendingRefocusRef.current = false;

      const field = fieldRef.current;

      if (field instanceof HTMLTextAreaElement) {
        const caret = Math.min(caretOffsetRef.current ?? field.value.length, field.value.length);

        focusWithoutPan(field);
        field.setSelectionRange(caret, caret);
      }
    }
  }, [isElevated]);

  // INFO: REQUIREMENTS.md § 15.1. Declared here rather than lifted to the screen — the draft never leaves this component, and a forced refresh must not discard it.
  useUnsentWork(hasDraft);

  // WARN: § 13.8. The word goes only when it was the whole draft. `오늘 고민 많다` keeps its sentence and sends as § 13.6.'s second message; `고민` alone was a search term and leaves with the emoticon it found.
  useEffect(() => {
    if (keywordConsumeToken === undefined) {
      return;
    }

    const tapped = tappedQueryRef.current ?? (keywordQuery !== "" ? keywordQuery : null);

    // WARN: Spent on use, and that is what stops it deleting a message nobody searched for. The room bumps this token on **every** quick send, so a ref left holding `고민` from a search minutes ago would silently swallow a later draft that happened to read `고민` — typed as an actual message — the next time any emoticon was double-tapped.
    tappedQueryRef.current = null;

    if (tapped === null) {
      return;
    }

    // WARN: Read outside the updater. A `setDraft` callback must be pure, and StrictMode double-invokes it — the § 8.12. retraction fired twice per consume from in there.
    setDraft((current) => (current.text.trim() === tapped ? EMPTY_DRAFT : current));
    setFallbackKeywordQuery(null);

    if (draft.text.trim() === tapped) {
      // WARN: The clear never goes through `onChange`, so the § 8.12. broadcast has to be retracted by hand or 입력 중 outlives the send.
      onEdit?.(false);
    }
    // WARN: Keyed on the token alone. Adding `onEdit` or `draft` re-runs the clear whenever the room re-renders it, which wipes a draft typed after the send.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [keywordConsumeToken]);

  /**
   * REQUIREMENTS.md § 8.13. The room seeding the field with a message being
   * corrected, and clearing it again when that correction ends.
   *
   * WARN: Adjusted during render, not in an effect — React's own "adjusting state
   * when a prop changes". In an effect it is a second pass, and the field paints
   * the previous draft for the frame in between.
   *
   * WARN: Compared on the token alone. Comparing the text would re-seed the
   * original wording over every keystroke typed since, which is the correction
   * being undone as it is made.
   */
  if (seededDraft !== undefined && seededDraft.token !== seenSeedToken) {
    setSeenSeedToken(seededDraft.token);
    setDraft(toSeededDraft(seededDraft));
  }

  /**
   * REQUIREMENTS.md § 13.6. The picker's emoticon, standing in the draft.
   *
   * WARN: Adjusted during render and keyed on the token, for the seed's reasons above.
   * The key is minted from the token rather than from a counter, so the adjustment
   * stays pure and StrictMode's second pass appends the same emoticon rather than a
   * second one.
   */
  if (insertedEmoticon !== undefined && insertedEmoticon.token !== seenInsertToken) {
    setSeenInsertToken(insertedEmoticon.token);

    // WARN: Read outside the updater, which must stay pure — this is the field's own DOM position rather than anything derivable from the draft.
    // INFO: `handleTextareaSelect` keeps this the same ref's job while the field is not yet elevated, so this read never has to branch on which element wrote it.
    const caret = caretOffsetRef.current;

    setDraft((current) =>
      hasRoomForEmoticon(current) ? toInsertedDraft(current, insertedEmoticon, caret) : current,
    );
  }

  /**
   * REQUIREMENTS.md § 13. 미니's own 지우기 button — the same Backspace the field's own
   * key would take, applied for `insertedEmoticon`'s reasons: during render, keyed on
   * the token.
   */
  if (deleteRequest !== undefined && deleteRequest.token !== seenDeleteToken) {
    setSeenDeleteToken(deleteRequest.token);

    const caret = caretOffsetRef.current;

    setDraft((current) => toDeletedDraft(current, caret));
  }

  /**
   * WARN: REQUIREMENTS.md § 8.12. The seed never goes through `onChange`, so the
   * broadcast has to be raised — and retracted on the empty seed that ends an edit
   * — by hand, exactly as the send below does it.
   *
   * WARN: The focus only survives because `ActionSheet` suppresses Radix's
   * restore-on-close for a chosen row. Without that the drawer unmounts at the end
   * of its exit animation and hands focus back to the opener, blurring this field —
   * on every platform, not only iOS.
   *
   * INFO: The keyboard is still best effort. iOS re-opens it only for a `focus()` a
   * user activation covers, and the sheet's close animation has outlived this one.
   */
  useEffect(() => {
    if (seededDraft === undefined) {
      return;
    }

    onEdit?.(seededDraft.text.trim().length > 0);
    focusWithoutPan(fieldRef.current);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [seededDraft?.token]);

  // WARN: § 8.12. The insertion above never goes through `onChange` either, and an emoticon put into the draft is composing — without this 입력 중 only starts at the next keystroke, and never for a message that is nothing but emoticons.
  useEffect(() => {
    if (insertedEmoticon !== undefined) {
      onEdit?.(true);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [insertedEmoticon?.token]);

  // WARN: § 8.12. The deletion above never goes through `onChange` either. Read here rather than closed over above — this runs after the render-phase adjustment has committed, so `draft` is the one it left behind, and a 지우기 that empties the field reports `false` exactly as the last Backspace on the field itself would.
  useEffect(() => {
    if (deleteRequest !== undefined) {
      onEdit?.(draft.text.trim().length > 0);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [deleteRequest?.token]);

  // INFO: Measured rather than summed from the tokens — a § 6.10. quote and § 6.10.1.'s notice are different heights, and the quote's own copy decides it.
  useEffect(() => {
    const node = headerRef.current;

    if (!node) {
      return;
    }

    // WARN: A zero is never published. The stack is `display: none` for the length of a search (REQUIREMENTS.md § 8.6.) and the row leaving unmounts below, and either one landing in the target would leave the next open with nothing to ease towards.
    const observer = new ResizeObserver(() => {
      if (node.offsetHeight > 0) {
        setHeaderHeight(node.offsetHeight);
      }
    });

    observer.observe(node);

    return () => observer.disconnect();
  }, []);

  // INFO: REQUIREMENTS.md § 16.1. Measures the notify mode notice row so its entrance and exit can animate smoothly over `--duration-state`.
  useEffect(() => {
    const node = notifyRef.current;

    if (!node) {
      return;
    }

    const observer = new ResizeObserver(() => {
      if (node.offsetHeight > 0) {
        setNotifyHeight(node.offsetHeight);
      }
    });

    observer.observe(node);

    return () => observer.disconnect();
  }, []);

  /**
   * REQUIREMENTS.md § 8.14. The room asking for the caret back.
   *
   * WARN: The resting `0` is skipped rather than compared against a remembered token.
   * Anything that fires on mount would take focus off whatever the screen opened on —
   * and on iOS raise the keyboard over a conversation nobody has touched yet.
   */
  useEffect(() => {
    if (focusRequest > 0) {
      focusWithoutPan(fieldRef.current);
    }
  }, [focusRequest]);

  return (
    // WARN: DESIGN.md § 3.5. Transparent to the pointer so the messages underneath stay tappable; only the pill itself takes taps.
    <div className={cn("pointer-events-none px-md pt-xs pb-xs", className)}>
      {/* INFO: DESIGN.md § 6.6. The tab bar's floating surface (§ 7.3.). A column so § 6.10.'s staged quote can be a header row inside the pill. */}
      <div className="pointer-events-auto flex flex-col rounded-[calc(var(--tab-bar-height)/2)] border border-hairline glass p-2xs shadow-floating">
        {/* INFO: REQUIREMENTS.md § 16.1. Its own row, above `header`'s slot rather than inside it — the two coexist, unlike the quote/edit-bar/AI-selection alternatives that share that one slot. */}
        {/* INFO: DESIGN.md § 6.10. The notice arrives and collapses as the pill growing/shrinking over `--duration-state` ease-out. */}
        <div
          className={cn(
            "shrink-0 overflow-hidden transition-[height] duration-(--duration-state) ease-out motion-reduce:transition-none",
            notifyMode !== "notify" ? "h-(--composer-notify-height)" : "h-0",
          )}
          inert={notifyMode === "notify"}
          style={{
            ["--composer-notify-height" as string]:
              notifyHeight > 0 ? `${notifyHeight}px` : "max-content",
          }}
          onTransitionEnd={releaseCollapsedNotify}
        >
          <div
            ref={notifyRef}
            className="flex items-center gap-2xs px-sm pt-xs text-caption text-meta"
          >
            {(notifyMode !== "notify" ? notifyMode : retainedNotifyMode) === "onlyMe" ? (
              <>
                <Lock className="size-3.5 shrink-0" strokeWidth={1.75} />
                나에게만 보내기
              </>
            ) : (
              <>
                <BellOff className="size-3.5 shrink-0" strokeWidth={1.75} />
                조용히 보내기
              </>
            )}
          </div>
        </div>
        {/* INFO: DESIGN.md § 6.10. The staged quote arrives as the pill growing into it, over `--duration-state`, so the history it pushes up rides the same move — `useComposerClearance` observes this wrapper every frame of it. */}
        {/* WARN: The last header stays mounted inside the collapsed clip, or the exit has nothing to draw; `inert` is what takes its `X` back out of the tab order. */}
        <div
          className={cn(
            "shrink-0 overflow-hidden transition-[height] duration-(--duration-state) ease-out motion-reduce:transition-none",
            header ? "h-(--composer-header-height)" : "h-0",
          )}
          style={{ ["--composer-header-height" as string]: `${headerHeight}px` }}
          inert={!header}
          onTransitionEnd={releaseCollapsedHeader}
        >
          {/* INFO: DESIGN.md § 6.6. The pill's column carries no gap of its own — this clip is mounted at rest too, and a flex gap would hold `2xs` open above the field forever. It rides inside the measured height instead. */}
          <div ref={headerRef} className="pb-2xs">
            {header ?? retainedHeader}
          </div>
        </div>
        {/* INFO: DESIGN.md § 6.6. One row, bottom-aligned — the field grows upward and the controls stay on the last line. */}
        {/* INFO: DESIGN.md § 6.6. With the leading control withheld the field would stand at the pill's own `2xs`, inside the corner's curve and 8px left of the header above it — this puts its text on the same column the `+` glyph holds it to. */}
        <div className={cn("flex items-end gap-2xs", isEditing && "pl-xs")}>
          {/* INFO: REQUIREMENTS.md § 8.13. Both staging controls go while a message is being corrected — `messages_edited_is_text_check` makes an edit text-only, so an attachment or an emoticon staged here would have nowhere to land. */}
          {/* INFO: § 9. An attachment needs a presigned PUT for bytes held in memory, so it is the one send the outbox cannot promise — the text beside it queues instead (§ 8.5.). */}
          {!isEditing && (
            <IconButton
              Icon={Plus}
              haptic
              aria-label="첨부"
              {...attachGate.blockedProps}
              onClick={attachGate.guard(onAttach)}
            />
          )}
          {/* INFO: § 13.8. The field and its keyword layer are one stacking context, so the mark can be positioned against the field's own box rather than the pill's. */}
          {/* WARN: `min-w-0` is what keeps the round controls round. A flex item's default `min-width: auto` refuses to shrink below its content, so the field pushes and the 44×44 buttons absorb the overflow as ovals. */}
          {isElevated ? (
            <EditableField
              ref={takeField}
              className="min-w-0 flex-1"
              // INFO: DESIGN.md § 6.6. No shape of its own — the pill is the field's surface, so no border, no radius, and no focus ring.
              fieldClassName={cn(
                "scrollbar-hidden max-h-34 min-h-11 w-full overflow-y-auto",
                FIELD_BOX,
                fieldClassName,
              )}
              placeholderClassName={cn("text-meta-soft", FIELD_BOX)}
              // INFO: An emoticon costs one character of it, because it is one character of the `messages.text` this limit guards (REQUIREMENTS.md § 6.).
              maxLength={MAX_MESSAGE_LENGTH}
              value={draft.text}
              objects={objects}
              caretOffsetRef={caretOffsetRef}
              aria-label="메시지 입력"
              // INFO: § 8.14. The pointer decides it and nothing else: a mouse means a keyboard is there to press, and whether the app is installed says nothing about that. The hint alone, since `aria-label` below already names the field.
              placeholder={
                isAiMode
                  ? "AI에게 질문"
                  : isFinePointer
                    ? `${toCommandKeyLabel()} + / 로 단축키 보기`
                    : "메시지 입력"
              }
              // WARN: REQUIREMENTS.md § 8.12. Deletions are edits too, but deleting the *last* character is not — it reports `false` and ends the broadcast, or emptying the field would renew 입력 중 at the moment the user finished saying they were done.
              // WARN: The keys are what say *which* emoticons a deletion took — the text only says one of them is gone, and a Backspace in the middle of a draft would otherwise drop the last.
              onChange={(next, keys) => {
                if (
                  next.length < draft.text.length ||
                  (!next.startsWith(draft.text) && !isOneJamoEdit(draft.text, next))
                ) {
                  setFallbackKeywordQuery(null);
                }

                setDraft((current) => ({
                  text: next,
                  emoticons: toSurviving(current.emoticons, keys),
                }));
                // INFO: § 8.14. Read here rather than in the effect above — by the time that runs, the node this checks against may already be gone.
                pendingRefocusRef.current = document.activeElement === fieldRef.current;
                // WARN: § 13.8. Any edit ends the search the tap started. The tap blurs the field, so nothing is typed between it and the send it belongs to — a keystroke after it means the draft is a message now, and consuming it would delete what the user wrote.
                tappedQueryRef.current = null;
                onEdit?.(next.trim().length > 0);
              }}
              onClick={handleFieldClick}
              onFocus={onFieldFocus}
              onKeyDown={handleKeyDown}
              onScroll={syncKeywordLayer}
            >
              {/* WARN: REQUIREMENTS.md § 8.13. Withheld while correcting, like the two staging controls. The tap opens § 13.8.'s picker, whose staging clears the attachment tray this mode deliberately preserved and arms a quick-send that would post a **new** emoticon message beside the pending correction — and the emoticon it staged is invisible and unsendable here anyway. A correction is very likely to contain the keyword, since it is the text the user already typed. */}
              {match && onKeywordTap && !isEditing && !isAiMode && (
                <KeywordLayer
                  ref={layerRef}
                  text={draft.text}
                  emoticons={draft.emoticons}
                  match={match}
                />
              )}
            </EditableField>
          ) : (
            // INFO: No mini emoticon has entered this draft yet, so a plain `<textarea>` stands in — mobile Safari paints its caret correctly, where `EditableField`'s contenteditable caret can drift after a newline. The first insertion promotes the field above.
            <div className="relative min-w-0 flex-1">
              <Textarea
                ref={takeField}
                // INFO: DESIGN.md § 6.6. No shape of its own, for the reason `EditableField` carries it — the pill is the field's surface.
                className={cn(
                  "scrollbar-hidden max-h-34 min-h-11 w-full resize-none overflow-y-auto rounded-none border-none bg-transparent shadow-none outline-none focus-visible:ring-0",
                  FIELD_BOX,
                  fieldClassName,
                )}
                maxLength={MAX_MESSAGE_LENGTH}
                value={draft.text}
                aria-label="메시지 입력"
                placeholder={
                  isFinePointer ? `${toCommandKeyLabel()} + / 로 단축키 보기` : "메시지 입력"
                }
                onChange={handlePlainChange}
                onPointerDown={takeFocusWithoutPan}
                onClick={handleFieldClick}
                onFocus={onFieldFocus}
                onKeyDown={handleKeyDown}
                onScroll={syncKeywordLayer}
                onSelect={handleTextareaSelect}
              />
              {match && onKeywordTap && !isEditing && !isAiMode && (
                <KeywordLayer
                  ref={layerRef}
                  text={draft.text}
                  emoticons={draft.emoticons}
                  match={match}
                />
              )}
            </div>
          )}
          {/* INFO: REQUIREMENTS.md § 8.5. AI 질문 모드's own toggle, immediately beside the emoticon one — pressing it hands the room the field rather than staging anything here. */}
          {!isEditing && (
            // WARN: DESIGN.md § 6.6. The box collapses and the button inside it does not move: it is `absolute` on the edge the emoticon toggle holds, so the glyph pops where it stood while the field grows into its 44. No `overflow-hidden` — the sparks have to leave this box, which is what `glyph-pop-out`'s `forwards` fill then pays for.
            <div
              className={cn(
                "relative h-11 shrink-0 transition-[width,margin] duration-(--duration-state) ease-press motion-reduce:transition-none",
                // WARN: `pointer-events-none` alongside `inert`, which takes the tab order but leaves a 44px box hit-testing over the field it has just made room in.
                isAiToggleCollapsed ? "pointer-events-none -ml-2xs w-0" : "w-11",
              )}
              inert={isAiToggleCollapsed}
            >
              {sparkleToken > 0 && (
                <span
                  key={sparkleToken}
                  className="pointer-events-none absolute right-0 bottom-0 size-11"
                  aria-hidden
                >
                  {AI_SPARKLES.map((sparkle) => (
                    // WARN: `opacity-0` is the resting state the flight returns to — the animation carries no forwards fill, so without it five stars stay lit beside the field.
                    <span
                      key={sparkle.delay + sparkle.x}
                      className={cn(
                        "absolute top-1/2 left-1/2 ai-sparkle bg-ai opacity-0",
                        SPARKLE_SHAPE,
                        sparkle.size,
                      )}
                      style={{
                        ["--sparkle-x" as string]: sparkle.x,
                        ["--sparkle-y" as string]: sparkle.y,
                        ["--sparkle-spin" as string]: sparkle.spin,
                        ["--sparkle-delay" as string]: sparkle.delay,
                      }}
                    />
                  ))}
                </span>
              )}
              <IconButton
                className="absolute right-0 bottom-0"
                // INFO: DESIGN.md § 4.1.3. Coloured at rest, which is why `ai` is its own token — the pressed state is the tint behind it rather than the glyph changing colour.
                buttonClassName={cn("text-ai hover:text-ai", isAiMode && "bg-ai-tint")}
                iconClassName={cn(
                  isAiToggleCollapsed ? "glyph-pop-out" : collapseToken > 0 && "glyph-pop-in",
                )}
                Icon={Sparkles}
                haptic
                // WARN: `keepsFocus` for the send disc's reason (DESIGN.md § 6.6.) — the overlay takes the tap, and without it the field blurs with the keys up, so the chat screen eases out to its resting height and back while `focusRequest` takes the caret again.
                keepsFocus
                aria-label="AI에게 질문"
                aria-pressed={isAiMode}
                onClick={onToggleAiMode}
              />
            </div>
          )}
          {/* INFO: DESIGN.md § 6.6. The toggle stays put once text is typed — an emoticon is staged beside a line of text now (REQUIREMENTS.md § 13.6.), so replacing it with send would put the panel out of reach exactly when it is wanted. */}
          {!isEditing && (
            // INFO: DESIGN.md § 6.6. A question to 쨈미니 sends text and only text (REQUIREMENTS.md § 8.15.), so the picker has nothing to stage into it and the field takes the 44 — the same box the AI toggle collapses through, for the same reason and on the same easing.
            <div
              className={cn(
                "relative h-11 shrink-0 transition-[width,margin] duration-(--duration-state) ease-press motion-reduce:transition-none",
                isAiMode ? "pointer-events-none -ml-2xs w-0" : "w-11",
              )}
              inert={isAiMode}
            >
              <IconButton
                className="absolute right-0 bottom-0"
                buttonClassName={cn(
                  // WARN: On the disc rather than on `iconClassName`, which the AI toggle can use because its glyph is always an `Icon` — § 13.8.'s preview arrives through `icon` instead, and that branch takes no icon class at all.
                  isAiMode ? "glyph-pop-out" : modeToken > 0 && "glyph-pop-in",
                  isEmoticonPickerOpen && "bg-primary-tint text-primary",
                  // INFO: A sticker standing free rather than a glyph on a control — the round hover/press fill this button always carries would otherwise show through past the picture's own edges.
                  showsPreview &&
                    "rounded-none group-active:bg-transparent hover:bg-transparent active:bg-transparent",
                )}
                Icon={showsPreview ? undefined : Smile}
                haptic
                aria-label="이모티콘"
                aria-pressed={isEmoticonPickerOpen}
                icon={
                  showsPreview ? (
                    // eslint-disable-next-line @next/next/no-img-element -- The exact `Image` warmEmoticonUrls decoded, so the browser's decode cache paints it with nothing for `next/image` to wait on.
                    <img
                      className="pointer-events-none size-11 object-contain"
                      src={displayedPreviewUrl ?? undefined}
                      alt=""
                      draggable={false}
                    />
                  ) : undefined
                }
                onClick={showsPreview ? handlePreviewTap : toggleEmoticons}
              />
            </div>
          )}
          {/* WARN: `keepsFocus` repeats `keepFieldFocused` on the overlay. It takes the tap the button would have taken, so without it the textarea blurs and iOS drops the keyboard on every send. */}
          <HapticTarget className="inline-flex shrink-0" isTicking={canSend} keepsFocus>
            {/* WARN: Disabled rather than unmounted when there is nothing to send — WebKit leaves a control inserted into this row unpainted until a hover forces the invalidation, and staging an emoticon touches nothing else inside the pill that would have forced one. */}
            <button
              className="group inline-flex size-11 shrink-0 cursor-pointer items-center justify-center rounded-full outline-none focus-visible:ring-2 focus-visible:ring-primary disabled:cursor-not-allowed"
              type="button"
              disabled={!canSend}
              aria-label={isEditing ? "수정 완료" : "보내기"}
              onPointerDown={keepFieldFocused}
              onClick={submit}
            >
              <span
                className={cn(
                  // INFO: DESIGN.md § 4.7.2. The same bloom the round `IconButton`s carry, on the disc rather than the 44 target so the swell reads against the pill it sits in.
                  // WARN: The bloom stays on both branches. Sending clears the field in the same click, so `canSend` flips while the release is still running — dropping the class there takes the resting `scale: 1` with it and the disc snaps instead of settling.
                  "inline-flex size-9 press-bloom items-center justify-center rounded-full text-on-primary",
                  canSend
                    ? "bg-primary group-hover:bg-primary-hover group-active:bg-primary-pressed"
                    : "bg-primary-disabled",
                )}
              >
                <ArrowUp className="size-5" strokeWidth={2} />
              </span>
            </button>
          </HapticTarget>
        </div>
      </div>
    </div>
  );

  // INFO: The row is held only for the collapse to draw over; once that has run there is nothing to keep an emoticon thumbnail decoding inside a zero-height clip for. Under reduced motion no transition ends and it simply stays, unseen.
  function releaseCollapsedHeader(event: TransitionEvent<HTMLDivElement>) {
    if (event.target !== event.currentTarget || event.propertyName !== "height" || header) {
      return;
    }

    setRetainedHeader(null);
  }

  // INFO: REQUIREMENTS.md § 16.1. Releases the retained notify mode once the collapse transition finishes.
  function releaseCollapsedNotify(event: TransitionEvent<HTMLDivElement>) {
    if (
      event.target !== event.currentTarget ||
      event.propertyName !== "height" ||
      notifyMode !== "notify"
    ) {
      return;
    }

    setRetainedNotifyMode("notify");
  }

  function submit() {
    if (!canSend) {
      return;
    }

    onSend({ text: draft.text, emoticons: draft.emoticons });
    setDraft(EMPTY_DRAFT);
    setFallbackKeywordQuery(null);
    // WARN: REQUIREMENTS.md § 8.12. The send is the end of composing, and it clears the field without going through `onChange` — so nothing else here would ever retract the broadcast, and 입력 중 would sit under the message that had just arrived.
    onEdit?.(false);

    // WARN: REQUIREMENTS.md § 13.6. The picker survives a send, and focusing the field here would raise the keyboard it can never share the screen with.
    if (isEmoticonPickerOpen) {
      return;
    }

    // INFO: Runs inside the click gesture on purpose — iOS only re-opens the keyboard for a `focus()` a user activation still covers.
    focusWithoutPan(fieldRef.current);
  }

  /**
   * WARN: REQUIREMENTS.md § 13.6. The panel is gated on the keyboard being down,
   * and iOS lowers it for a blur alone — a tap on this button is not one, so
   * without this the toggle flips a flag the panel never gets to act on and the
   * press reads as doing nothing at all.
   */
  // WARN: § 13.6. A close hands the caret to the field from inside the click, and never through the room's `focusRequest` — WebKit raises the keyboard only for a `focus()` the user activation still covers. The focus itself closes the panel (`onFieldFocus`), so the toggle below is the same close repeated.
  function toggleEmoticons() {
    if (isEmoticonPickerOpen) {
      focusWithoutPan(fieldRef.current);
    } else {
      fieldRef.current?.blur();
    }

    if (keywordQuery !== "") {
      tappedQueryRef.current = keywordQuery;
    }

    onToggleEmoticons?.();
  }

  /** WARN: § 13.6. Blurs for the same reason the toggle does — the panel this opens cannot share the screen with the keyboard. */
  function handleKeywordTap() {
    if (!match) {
      return;
    }

    // WARN: § 13.6. Before the request and not after, which is the order this has always been in — the blur is what lowers the keyboard, and the panel is asked to open against a viewport that is already on its way back.
    fieldRef.current?.blur();
    openEmoticonSearch(match.query);
  }

  /**
   * WARN: REQUIREMENTS.md § 13.8. Taps on the underlined word are caught via selection
   * on the field rather than on the overlay span, so `KeywordLayer` remains completely
   * `pointer-events-none` and never confuses iOS WebKit's caret positioning / spacebar trackpad.
   */
  function handleFieldClick() {
    if (!match || isEditing || isAiMode) {
      return;
    }

    const field = fieldRef.current;

    if (!field) {
      return;
    }

    const caret =
      field instanceof HTMLTextAreaElement
        ? field.selectionStart === field.selectionEnd
          ? field.selectionStart
          : null
        : caretOffsetRef.current;

    if (caret !== null && caret >= match.start && caret <= match.end) {
      handleKeywordTap();
    }
  }

  /** WARN: § 13.8. The toggle's own tap, kept apart from `handleKeywordTap` so the room can tell the two open requests apart. */
  function handlePreviewTap() {
    if (keywordQuery === "") {
      return;
    }

    fieldRef.current?.blur();
    tappedQueryRef.current = keywordQuery;
    onPreviewTap?.(keywordQuery);
  }

  /**
   * REQUIREMENTS.md § 8.14. `⌃1` — `Alt+1` off an Apple platform — is the underlined
   * word's tap, for a keyboard: the same key that reaches 검색 from anywhere else,
   * carrying the draft's word where the room has none. It works with no word underlined
   * too, opening § 13.8.'s search on an empty field.
   *
   * INFO: § 8.14. The modifier is what makes this claim possible at all. `⌥1` types `¡`
   * on macOS, so the key could not be pressed in the very field this handler is on.
   *
   * INFO: Unconditional on purpose. Offered only where a word happens to match, the
   * shortcut answers on one draft in ten and reads as broken on the rest, so there is
   * nothing to learn from it; the word is a *seed* it carries when there is one.
   *
   * WARN: No `blur()`, unlike the tap above. That exists so iOS lowers the keyboard
   * the panel may not share the screen with (§ 13.6.), and a hardware keyboard raises
   * none — blurring here would only take the caret off the field a frame before
   * § 13.8.'s own pane claims it.
   */
  function openEmoticonSearch(query: Nullable<string>) {
    // WARN: § 13.8. Only a real word is armed for the send to spend. Left set to `""`, a draft the user then typed would be matched by the empty string this shortcut opened with.
    tappedQueryRef.current = query;
    onKeywordTap?.(query ?? "");
  }

  /**
   * WARN: § 13.8. The field scrolls internally past five lines and the layer is
   * positioned against the field's box, not its content — without this the mark
   * stays where the word used to be as soon as the draft is taller than the field.
   */
  function syncKeywordLayer() {
    const layer = layerRef.current;

    if (layer && fieldRef.current) {
      layer.scrollTop = fieldRef.current.scrollTop;
    }
  }

  // WARN: Cancelling `pointerdown` is what stops the tap from blurring the field; `click` still fires, so `submit` is untouched.
  function keepFieldFocused(event: PointerEvent<HTMLButtonElement>) {
    event.preventDefault();
  }

  // INFO: The un-elevated `Textarea`'s own `onChange`, mirroring `EditableField`'s but with no placeholders or objects to carry — this draft has never held one.
  function handlePlainChange(event: ChangeEvent<HTMLTextAreaElement>) {
    const field = event.target;
    const next = field.value;
    const isComposing =
      typeof InputEvent !== "undefined" &&
      event.nativeEvent instanceof InputEvent &&
      event.nativeEvent.isComposing;

    if (
      next.length < draft.text.length ||
      (!isComposing && !next.startsWith(draft.text) && !isOneJamoEdit(draft.text, next))
    ) {
      setFallbackKeywordQuery(null);
    }

    setDraft({ text: next, emoticons: [] });
    tappedQueryRef.current = null;
    onEdit?.(next.trim().length > 0);

    /**
     * WARN: `field-sizing: content` (`Textarea`'s own base style) is what grows the box
     * to fit its lines up to `max-h-34`, and Chromium/WebKit do not carry the caret into
     * view once that growth caps out and the box starts scrolling instead — typing past
     * the visible lines leaves the caret under the fold with nothing to bring it back.
     * Scrolled here by hand, and only while the caret sits at the very end: a value
     * changed by an edit further back must not yank the view down to text the reader
     * is not looking at.
     */
    if (field.selectionStart === next.length) {
      field.scrollTop = field.scrollHeight;
    }
  }

  // INFO: § 8.14. `EditableField` keeps `caretOffsetRef` current off its own `selectionchange` listener; a plain `Textarea` has no such element to listen on, so this stands in for as long as the field is not yet elevated.
  function handleTextareaSelect(event: SyntheticEvent<HTMLTextAreaElement>) {
    caretOffsetRef.current = event.currentTarget.selectionStart;
  }

  function handleKeyDown(event: KeyboardEvent<HTMLDivElement | HTMLTextAreaElement>) {
    // WARN: § 8.14. First, and it covers every branch below. A Hangul IME fires `keydown` for the keystrokes that settle a syllable — including the Enter that closes a composition, which is the trap `KeywordField` records.
    if (event.nativeEvent.isComposing) {
      return;
    }

    // WARN: REQUIREMENTS.md § 8.14. Withheld while correcting, exactly as the underline is — the panel this opens stages a payload § 8.13.'s edit has no row for.
    // WARN: § 8.14. And withheld while the panel is up, so the room's copy answers instead. Seeding a search from here is only ever the way *in*; there is nothing about a panel already on screen for this field to say.
    if (
      isMenuKey(event) &&
      isDigitKey(event, 1) &&
      !isEditing &&
      !isAiMode &&
      !isEmoticonPickerOpen
    ) {
      event.preventDefault();
      openEmoticonSearch(keywordQuery || null);

      return;
    }

    // WARN: § 8.14. `⌃E` opens on 검색 rather than 이모티콘 where the draft already has a word underlined — claimed here, ahead of the room's own toggle, only for that one case; the room still owns opening on 이모티콘 and closing.
    if (
      (isMenuKey(event) || isCommandKey(event)) &&
      isLetterKey(event, "e") &&
      !isEditing &&
      !isAiMode &&
      !isEmoticonPickerOpen &&
      match
    ) {
      event.preventDefault();
      openEmoticonSearch(match.query);

      return;
    }

    // INFO: AGENTS.md § 4.2. A hardware keyboard sends on Enter; on touch the same key has to stay a newline, since the iOS keyboard offers no send key.
    if (isCoarsePointer || event.key !== "Enter" || event.shiftKey) {
      return;
    }

    event.preventDefault();
    submit();
  }
}

type KeywordLayerProps = {
  ref?: Ref<HTMLDivElement>;
  className?: string;
  text: string;
  emoticons: StagedEmoticon[];
  match: KeywordMatch;
};

/**
 * REQUIREMENTS.md § 13.8. The underline under the word that has emoticons behind
 * it, and the only part of the field that answers a tap with something other than a
 * caret.
 *
 * WARN: A mirror of the textarea rather than anything inside it — a `<textarea>`
 * renders no elements, so there is nowhere to hang a mark or a tap target. It is
 * laid out with the field's own box (`FIELD_BOX`) and wraps by the same rules, so
 * the runs measure identically and the mark lands on the word.
 *
 * WARN: Every character is transparent and only the decoration is painted. The real
 * text belongs to the textarea *underneath*; drawing it here too would double every
 * glyph at one pixel of anti-aliasing offset.
 *
 * WARN: `pointer-events-none` across the entire layer so it never intercepts hit-testing
 * or causes iOS WebKit's caret to jump when dragging selection or using spacebar trackpad.
 */
function KeywordLayer({ ref, className, text, emoticons, match }: KeywordLayerProps) {
  return (
    <div
      ref={ref}
      className={cn(
        "pointer-events-none absolute inset-0 overflow-hidden text-transparent select-none",
        // WARN: The field's own whitespace rule, beside the word-break `FIELD_BOX` carries. Anything else re-flows the runs and the mark drifts a word further off with every line.
        "whitespace-pre-wrap",
        FIELD_BOX,
        className,
      )}
      aria-hidden
    >
      {toLayerRuns(text.slice(0, match.start), emoticons, 0)}
      {/* INFO: DESIGN.md § 3.2. A pointer affordance on a span that is not a control by shape — the underline is what says it can be pressed. */}
      <span className="underline decoration-primary decoration-2 underline-offset-4">
        {toLayerRuns(
          text.slice(match.start, match.end),
          emoticons,
          toPlaceholderIndex(text, match.start),
        )}
      </span>
      {toLayerRuns(text.slice(match.end), emoticons, toPlaceholderIndex(text, match.end))}
    </div>
  );
}

/**
 * WARN: § 13.8. The emoticons are drawn into the layer as well, invisible. A
 * placeholder left as text is a glyph the width of whatever the font has for it, where
 * the field draws a box a line tall — and the layer wraps by the field's rules only
 * while the two hold the same boxes, so every mark past the first emoticon would sit
 * further off its word.
 *
 * INFO: `InlineEmoticon` itself rather than a spacer built to match it, so there is one
 * statement of the box. The picture is already loaded and answers from the cache.
 */
function toLayerRuns(text: string, emoticons: StagedEmoticon[], from: number): ReactNode[] {
  const runs = text.split(OBJECT_PLACEHOLDER);

  return runs.map((run, index) => {
    const emoticon = index < runs.length - 1 ? emoticons[from + index] : undefined;

    return (
      <Fragment key={index}>
        {run}
        {emoticon && (
          <InlineEmoticon
            className="invisible"
            itemId={emoticon.id}
            version={emoticon.version}
            width={emoticon.width}
            height={emoticon.height}
          />
        )}
      </Fragment>
    );
  });
}

/**
 * The staged emoticons the field still holds, in its order.
 *
 * WARN: Keyed rather than sliced. A deletion can take any of them — and the same
 * emoticon may be staged twice — so the surviving keys are the only account of which
 * ones are left that a repeated id cannot confuse.
 */
function toSurviving(emoticons: StagedEmoticon[], keys: string[]): StagedEmoticon[] {
  // INFO: The identity is kept where nothing changed, which is every keystroke — a new array would rebuild the field's objects and re-render the layer on each of them.
  if (
    keys.length === emoticons.length &&
    keys.every((key, index) => emoticons[index]?.key === key)
  ) {
    return emoticons;
  }

  const byKey = new Map(emoticons.map((emoticon) => [emoticon.key, emoticon]));

  return keys
    .map((key) => byKey.get(key))
    .filter((emoticon): emoticon is StagedEmoticon => emoticon !== undefined);
}

/**
 * Whether one more emoticon still fits, on both counts the send is refused past.
 *
 * WARN: REQUIREMENTS.md § 13. A placeholder is a character of `messages.text` (§ 6.), and
 * one written in through `value` passes neither of `EditableField`'s length guards — so
 * the length half is refused here, or the route answers 400 and the bubble stays failed.
 */
function hasRoomForEmoticon({ text, emoticons }: Draft): boolean {
  return emoticons.length < MAX_EMOTICON_ID_LOOKUP && text.length < MAX_MESSAGE_LENGTH;
}

/**
 * REQUIREMENTS.md § 8.14. The draft with an emoticon written into it at `caret`, and at
 * its end for a field that has never held one.
 *
 * WARN: Spliced into `emoticons` rather than pushed onto it. REQUIREMENTS.md § 6. pairs
 * the Nth placeholder with the Nth id, so an emoticon inserted mid-draft and appended to
 * the array renames every emoticon after it — the picture the reader put in the middle
 * lands at the end of their sentence, and every other one shifts by one.
 *
 * WARN: The caret is clamped rather than trusted. It is a position in the draft the
 * field last reported, and the send that empties this one goes nowhere near it.
 */
function toInsertedDraft(
  current: Draft,
  { emoticon, token }: NonNullable<MessageComposerProps["insertedEmoticon"]>,
  caret: Nullable<number>,
): Draft {
  const at = Math.min(caret ?? current.text.length, current.text.length);
  const index = toPlaceholderIndex(current.text, at);

  return {
    text: `${current.text.slice(0, at)}${OBJECT_PLACEHOLDER}${current.text.slice(at)}`,
    emoticons: [
      ...current.emoticons.slice(0, index),
      { ...emoticon, key: `${token}` },
      ...current.emoticons.slice(index),
    ],
  };
}

/**
 * REQUIREMENTS.md § 13. The draft with one unit taken off its end, or off `caret` when
 * the field last held one — a placeholder and the emoticon it stands for together, or
 * one grapheme cluster of plain text.
 *
 * WARN: A code unit is not a character and a code point is not a grapheme — `slice(0,
 * -1)` cuts a surrogate pair in half, and even a full code point splits a flag or a
 * ZWJ family emoji into pieces neither side can render. `GRAPHEME_SEGMENTER` is what
 * finds the boundary a single Backspace is meant to clear in one press.
 */
function toDeletedDraft(current: Draft, caret: Nullable<number>): Draft {
  const at = Math.min(caret ?? current.text.length, current.text.length);

  if (at === 0) {
    return current;
  }

  if (current.text[at - 1] === OBJECT_PLACEHOLDER) {
    const index = toPlaceholderIndex(current.text, at) - 1;

    return {
      text: `${current.text.slice(0, at - 1)}${current.text.slice(at)}`,
      emoticons: [...current.emoticons.slice(0, index), ...current.emoticons.slice(index + 1)],
    };
  }

  const start = toGraphemeStart(current.text, at);

  return {
    text: `${current.text.slice(0, start)}${current.text.slice(at)}`,
    emoticons: current.emoticons,
  };
}

// WARN: Hoisted — a fresh `Intl.Segmenter` per keystroke of 지우기 rebuilds its Unicode tables for nothing they change between presses.
const GRAPHEME_SEGMENTER = new Intl.Segmenter(undefined, { granularity: "grapheme" });

/** The start of the grapheme cluster ending at `at`, so a deletion takes a whole emoji or combining sequence rather than one UTF-16 code unit off it. */
function toGraphemeStart(text: string, at: number): number {
  let start = 0;

  for (const { index } of GRAPHEME_SEGMENTER.segment(text.slice(0, at))) {
    start = index;
  }

  return start;
}

// INFO: REQUIREMENTS.md § 8.13. The seed's own token keys the emoticons it brings, so a re-seed of the same message is not two drafts holding one set of keys.
function toSeededDraft({
  text,
  emoticons = [],
  token,
}: NonNullable<MessageComposerProps["seededDraft"]>): Draft {
  return {
    text,
    emoticons: emoticons.map((emoticon, index) => ({ ...emoticon, key: `${token}:${index}` })),
  };
}
