"use client";

import { findKeywordMatch, MAX_MESSAGE_LENGTH, type KeywordMatch } from "@/shared/config";
import {
  cn,
  isCommandShiftKey,
  isLetterKey,
  toCommandKeyLabel,
  useIsCoarsePointer,
  useIsFinePointer,
  useUnsentWork,
  type Nullable,
} from "@/shared/lib";
import { HapticTarget, IconButton, Textarea } from "@/shared/ui";
import { useQuery } from "@tanstack/react-query";
import { ArrowUp, Plus, Smile } from "lucide-react";
import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type KeyboardEvent,
  type PointerEvent,
  type Ref,
} from "react";
import { toEmoticonKeywordsQuery } from "../model/keywords-query";

/**
 * The box the field and its keyword layer must both be drawn in.
 *
 * WARN: REQUIREMENTS.md § 13.8. Shared between the two on purpose. The layer paints
 * an underline that has to land under a word the *textarea* laid out, so any
 * padding, font or wrapping rule that reaches one and not the other slides the mark
 * off the word it belongs to.
 */
const FIELD_BOX = "px-2xs py-xs text-body-md leading-normal";

// WARN: Hoisted so the pending query answers one array identity — an inline `= []` re-runs the match on every render of a field being typed into.
const NO_KEYWORDS: string[] = [];

export type MessageComposerProps = {
  className?: string;
  fieldClassName?: string;
  /** Attachments and a staged emoticon both sit above the composer, so send stays available on an empty field. */
  hasAttachments?: boolean;
  isEmoticonPickerOpen?: boolean;
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
  seededDraft?: { text: string; token: number };
  /** REQUIREMENTS.md § 8.13. The field is correcting a message rather than composing one, so the controls that stage a *new* payload have nothing to act on. */
  isEditing?: boolean;
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
  onAttach: () => void;
  /** REQUIREMENTS.md § 13.6. Reaching for the field is a request for the keyboard, which the picker would then be buried under. */
  onFieldFocus?: () => void;
  /** REQUIREMENTS.md § 8.12. Each edit, carrying whether the field still holds anything — `false` is the end of composing, not a quieter form of it. */
  onEdit?: (isComposing: boolean) => void;
  onToggleEmoticons?: () => void;
  /** REQUIREMENTS.md § 13.8. A tap on the underlined word, carrying what was typed rather than the keyword it hit. */
  onKeywordTap?: (query: string) => void;
  onSend: (text: string) => void;
};

// INFO: DESIGN.md § 6.6. A floating bar over the message column, not a flow child — the messages are meant to pass under it, which is also what gives the glass something to blur.
export function MessageComposer({
  className,
  fieldClassName,
  hasAttachments = false,
  isEmoticonPickerOpen = false,
  keywordConsumeToken,
  seededDraft,
  isEditing = false,
  focusRequest = 0,
  onAttach,
  onFieldFocus,
  onEdit,
  onToggleEmoticons,
  onKeywordTap,
  onSend,
}: MessageComposerProps) {
  const fieldRef = useRef<Nullable<HTMLTextAreaElement>>(null);
  const layerRef = useRef<Nullable<HTMLDivElement>>(null);
  const [text, setText] = useState("");
  // INFO: REQUIREMENTS.md § 8.13. The last seed this component has taken, so the render-phase adjustment below fires once per instruction rather than on every render.
  const [seenSeedToken, setSeenSeedToken] = useState(seededDraft?.token);
  // INFO: § 13.8. What the last tap searched for, so a send can tell whether the field still holds only that.
  const tappedQueryRef = useRef<Nullable<string>>(null);
  const isCoarsePointer = useIsCoarsePointer();
  // INFO: REQUIREMENTS.md § 8.14. The shortcuts appear nowhere else on screen, so the one field every reader already looks at carries the one key that lists the rest.
  const isFinePointer = useIsFinePointer();
  const hasDraft = text.trim().length > 0;
  // INFO: REQUIREMENTS.md § 8.13. An edit sends text and only text, so a tray left staged behind the mode cannot arm the button — emptying the field has to disable it, or the correction would submit nothing.
  const canSend = hasDraft || (hasAttachments && !isEditing);
  // INFO: § 13.8. Hidden packs count here, exactly as they do in the panel's search — the underline offers a word the search can answer, and the search looks across the whole library.
  // INFO: § 13.8. Deduplicated by the `DISTINCT` that produced it, so there is no `Set` to build — `findKeywordMatch` only ever iterates what it is given.
  // WARN: § 13.6. A cache read and never a fetch. This component mounts with the room, so an enabled query put `?keywords=1` on every room entry — the path `useEmoticonPreload` was written to keep clear; that hook warms this same descriptor from its idle callback and the underline appears when it lands.
  const { data: keywords = NO_KEYWORDS } = useQuery({
    ...toEmoticonKeywordsQuery(),
    enabled: false,
  });
  const match = useMemo(() => findKeywordMatch(text, keywords), [text, keywords]);

  // INFO: REQUIREMENTS.md § 15.1. Declared here rather than lifted to the screen — the draft never leaves this component, and a forced refresh must not discard it.
  useUnsentWork(hasDraft);

  // WARN: § 13.8. The word goes only when it was the whole draft. `오늘 고민 많다` keeps its sentence and sends as § 13.6.'s second message; `고민` alone was a search term and leaves with the emoticon it found.
  useEffect(() => {
    if (keywordConsumeToken === undefined) {
      return;
    }

    const tapped = tappedQueryRef.current;

    // WARN: Spent on use, and that is what stops it deleting a message nobody searched for. The room bumps this token on **every** quick send, so a ref left holding `고민` from a search minutes ago would silently swallow a later draft that happened to read `고민` — typed as an actual message — the next time any emoticon was double-tapped.
    tappedQueryRef.current = null;

    if (tapped === null) {
      return;
    }

    // WARN: Read outside the updater. A `setText` callback must be pure, and StrictMode double-invokes it — the § 8.12. retraction fired twice per consume from in there.
    setText((current) => (current.trim() === tapped ? "" : current));

    if (text.trim() === tapped) {
      // WARN: The clear never goes through `onChange`, so the § 8.12. broadcast has to be retracted by hand or 입력 중 outlives the send.
      onEdit?.(false);
    }
    // WARN: Keyed on the token alone. Adding `onEdit` or `text` re-runs the clear whenever the room re-renders it, which wipes a draft typed after the send.
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
    setText(seededDraft.text);
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
    fieldRef.current?.focus();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [seededDraft?.token]);

  /**
   * REQUIREMENTS.md § 8.14. The room asking for the caret back.
   *
   * WARN: The resting `0` is skipped rather than compared against a remembered token.
   * Anything that fires on mount would take focus off whatever the screen opened on —
   * and on iOS raise the keyboard over a conversation nobody has touched yet.
   */
  useEffect(() => {
    if (focusRequest > 0) {
      fieldRef.current?.focus();
    }
  }, [focusRequest]);

  return (
    // WARN: DESIGN.md § 3.5. Transparent to the pointer so the messages underneath stay tappable; only the pill itself takes taps.
    <div className={cn("pointer-events-none px-md pt-xs pb-xs", className)}>
      {/* INFO: DESIGN.md § 6.6. The tab bar's floating surface (§ 7.3.). One row, bottom-aligned — the field grows upward and the controls stay on the last line. */}
      <div className="pointer-events-auto flex items-end gap-2xs rounded-[calc(var(--tab-bar-height)/2)] border border-hairline glass p-2xs shadow-floating">
        {/* INFO: REQUIREMENTS.md § 8.13. Both staging controls go while a message is being corrected — `messages_edited_is_text_check` makes an edit text-only, so an attachment or an emoticon staged here would have nowhere to land. */}
        {!isEditing && <IconButton Icon={Plus} haptic aria-label="첨부" onClick={onAttach} />}
        {/* INFO: § 13.8. The field and its keyword layer are one stacking context, so the mark can be positioned against the field's own box rather than the pill's. */}
        <div className="relative min-w-0 flex-1">
          <Textarea
            ref={fieldRef}
            className={cn(
              // INFO: DESIGN.md § 6.6. No shape of its own — the pill is the field's surface, so no border, no radius, and no focus ring.
              // WARN: `min-w-0` is what keeps the round controls round. A flex item's default `min-width: auto` refuses to shrink below its content, so on a browser without `field-sizing-content` (WebKit) the field pushes and the 44×44 buttons absorb the overflow as ovals.
              "max-h-34 min-h-11 w-full min-w-0 resize-none rounded-none border-transparent bg-transparent hover:border-transparent focus-visible:border-transparent focus-visible:ring-0",
              FIELD_BOX,
              fieldClassName,
            )}
            maxLength={MAX_MESSAGE_LENGTH}
            rows={1}
            value={text}
            aria-label="메시지 입력"
            // INFO: § 8.14. Only where a mouse is driving, since a phone has no key to press — and the ternary is also what keeps `toCommandKeyLabel` out of the server's HTML, where its answer would be a guess at a platform it cannot see.
            placeholder={
              isFinePointer ? `메시지 입력 · ${toCommandKeyLabel()}/ 단축키 보기` : "메시지 입력"
            }
            // WARN: REQUIREMENTS.md § 8.12. Deletions are edits too, but deleting the *last* character is not — it reports `false` and ends the broadcast, or emptying the field would renew 입력 중 at the moment the user finished saying they were done.
            onChange={(event) => {
              setText(event.target.value);
              // WARN: § 13.8. Any edit ends the search the tap started. The tap blurs the field, so nothing is typed between it and the send it belongs to — a keystroke after it means the draft is a message now, and consuming it would delete what the user wrote.
              tappedQueryRef.current = null;
              onEdit?.(event.target.value.trim().length > 0);
            }}
            onFocus={onFieldFocus}
            onKeyDown={handleKeyDown}
            onScroll={syncKeywordLayer}
          />
          {/* WARN: REQUIREMENTS.md § 8.13. Withheld while correcting, like the two staging controls. The tap opens § 13.8.'s picker, whose staging clears the attachment tray this mode deliberately preserved and arms a quick-send that would post a **new** emoticon message beside the pending correction — and the emoticon it staged is invisible and unsendable here anyway. A correction is very likely to contain the keyword, since it is the text the user already typed. */}
          {match && onKeywordTap && !isEditing && (
            <KeywordLayer ref={layerRef} text={text} match={match} onTap={handleKeywordTap} />
          )}
        </div>
        {/* INFO: DESIGN.md § 6.6. The toggle stays put once text is typed — an emoticon is staged beside a line of text now (REQUIREMENTS.md § 13.6.), so replacing it with send would put the panel out of reach exactly when it is wanted. */}
        {!isEditing && (
          <IconButton
            buttonClassName={cn(isEmoticonPickerOpen && "bg-primary-tint text-primary")}
            Icon={Smile}
            haptic
            aria-label="이모티콘"
            aria-pressed={isEmoticonPickerOpen}
            onClick={toggleEmoticons}
          />
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
  );

  function submit() {
    if (!canSend) {
      return;
    }

    onSend(text);
    setText("");
    // WARN: REQUIREMENTS.md § 8.12. The send is the end of composing, and it clears the field without going through `onChange` — so nothing else here would ever retract the broadcast, and 입력 중 would sit under the message that had just arrived.
    onEdit?.(false);

    // WARN: REQUIREMENTS.md § 13.6. The picker survives a send, and focusing the field here would raise the keyboard it can never share the screen with.
    if (isEmoticonPickerOpen) {
      return;
    }

    // INFO: Runs inside the click gesture on purpose — iOS only re-opens the keyboard for a `focus()` a user activation still covers.
    fieldRef.current?.focus();
  }

  /**
   * WARN: REQUIREMENTS.md § 13.6. The panel is gated on the keyboard being down,
   * and iOS lowers it for a blur alone — a tap on this button is not one, so
   * without this the toggle flips a flag the panel never gets to act on and the
   * press reads as doing nothing at all.
   */
  function toggleEmoticons() {
    fieldRef.current?.blur();
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
   * REQUIREMENTS.md § 8.14. ⌘⇧E is the underlined word's tap, for a keyboard — and it
   * works with no word underlined too, opening § 13.8.'s search on an empty field.
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

  function handleKeyDown(event: KeyboardEvent<HTMLTextAreaElement>) {
    // WARN: § 8.14. First, and it covers every branch below. A Hangul IME fires `keydown` for the keystrokes that settle a syllable — including the Enter that closes a composition, which is the trap `KeywordField` records.
    if (event.nativeEvent.isComposing) {
      return;
    }

    // WARN: REQUIREMENTS.md § 8.14. Withheld while correcting, exactly as the underline is — the panel this opens stages a payload § 8.13.'s edit has no row for.
    // WARN: § 8.14. And withheld while the panel is up, so the room's copy answers instead and the key **closes**. Seeding a search from here is only ever the way *in*; there is nothing about a panel already on screen for this field to say.
    if (
      isCommandShiftKey(event) &&
      isLetterKey(event, "e") &&
      !isEditing &&
      !isEmoticonPickerOpen
    ) {
      event.preventDefault();
      openEmoticonSearch(match?.query ?? null);

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
  match: KeywordMatch;
  onTap: () => void;
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
 * WARN: `pointer-events-none` on the layer and `auto` on the one span. Inverted, the
 * layer would swallow every tap meant to place a caret and the field would stop
 * being editable.
 */
function KeywordLayer({ ref, className, text, match, onTap }: KeywordLayerProps) {
  return (
    <div
      ref={ref}
      className={cn(
        "pointer-events-none absolute inset-0 overflow-hidden text-transparent select-none",
        // WARN: `whitespace-pre-wrap break-words` is the textarea's own wrapping. Anything else re-flows the runs and the mark drifts a word further off with every line.
        "break-words whitespace-pre-wrap",
        FIELD_BOX,
        className,
      )}
      aria-hidden
    >
      {text.slice(0, match.start)}
      {/* INFO: DESIGN.md § 3.2. A pointer affordance on a span that is not a control by shape — the underline is what says it can be pressed. */}
      <span
        className="pointer-events-auto cursor-pointer underline decoration-primary decoration-2 underline-offset-4"
        role="button"
        tabIndex={-1}
        onClick={onTap}
      >
        {text.slice(match.start, match.end)}
      </span>
      {text.slice(match.end)}
    </div>
  );
}
