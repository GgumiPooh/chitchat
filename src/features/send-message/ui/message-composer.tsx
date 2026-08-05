"use client";

import { MAX_MESSAGE_LENGTH } from "@/shared/config";
import { cn, useIsCoarsePointer, useUnsentWork, type Nullable } from "@/shared/lib";
import { IconButton, Textarea } from "@/shared/ui";
import { ArrowUp, Plus, Smile } from "lucide-react";
import { useRef, useState, type KeyboardEvent, type PointerEvent } from "react";

export type MessageComposerProps = {
  className?: string;
  fieldClassName?: string;
  /** Attachments and a staged emoticon both sit above the composer, so send stays available on an empty field. */
  hasAttachments?: boolean;
  isEmoticonPickerOpen?: boolean;
  onAttach: () => void;
  /** REQUIREMENTS.md § 13.6. Reaching for the field is a request for the keyboard, which the picker would then be buried under. */
  onFieldFocus?: () => void;
  onToggleEmoticons?: () => void;
  onSend: (text: string) => void;
};

// INFO: DESIGN.md § 6.6. A floating bar over the message column, not a flow child — the messages are meant to pass under it, which is also what gives the glass something to blur.
export function MessageComposer({
  className,
  fieldClassName,
  hasAttachments = false,
  isEmoticonPickerOpen = false,
  onAttach,
  onFieldFocus,
  onToggleEmoticons,
  onSend,
}: MessageComposerProps) {
  const fieldRef = useRef<Nullable<HTMLTextAreaElement>>(null);
  const [text, setText] = useState("");
  const isCoarsePointer = useIsCoarsePointer();
  const canSend = text.trim().length > 0 || hasAttachments;

  // INFO: REQUIREMENTS.md § 15.1. Declared here rather than lifted to the screen — the draft never leaves this component, and a forced refresh must not discard it.
  useUnsentWork(text.trim().length > 0);

  return (
    // WARN: DESIGN.md § 3.5. Transparent to the pointer so the messages underneath stay tappable; only the pill itself takes taps.
    <div className={cn("pointer-events-none px-md pt-xs pb-xs", className)}>
      {/* INFO: DESIGN.md § 6.6. The tab bar's floating surface (§ 7.3.). One row, bottom-aligned — the field grows upward and the controls stay on the last line. */}
      <div className="pointer-events-auto flex items-end gap-2xs rounded-[calc(var(--tab-bar-height)/2)] border border-hairline glass p-2xs shadow-floating">
        <IconButton Icon={Plus} aria-label="첨부" onClick={onAttach} />
        <Textarea
          ref={fieldRef}
          className={cn(
            // INFO: DESIGN.md § 6.6. No shape of its own — the pill is the field's surface, so no border, no radius, and no focus ring.
            // WARN: `min-w-0` is what keeps the round controls round. A flex item's default `min-width: auto` refuses to shrink below its content, so on a browser without `field-sizing-content` (WebKit) the field pushes and the 44×44 buttons absorb the overflow as ovals.
            "max-h-34 min-h-11 min-w-0 resize-none rounded-none border-transparent bg-transparent px-2xs py-xs hover:border-transparent focus-visible:border-transparent focus-visible:ring-0",
            fieldClassName,
          )}
          maxLength={MAX_MESSAGE_LENGTH}
          rows={1}
          value={text}
          placeholder="메시지 입력"
          aria-label="메시지 입력"
          onChange={(event) => setText(event.target.value)}
          onFocus={onFieldFocus}
          onKeyDown={handleKeyDown}
        />
        {/* INFO: DESIGN.md § 6.6. The toggle stays put once text is typed — an emoticon is staged beside a line of text now (REQUIREMENTS.md § 13.6.), so replacing it with send would put the panel out of reach exactly when it is wanted. */}
        <IconButton
          className={cn(isEmoticonPickerOpen && "bg-primary-tint text-primary")}
          Icon={Smile}
          aria-label="이모티콘"
          aria-pressed={isEmoticonPickerOpen}
          onClick={onToggleEmoticons}
        />
        {/* WARN: Disabled rather than unmounted when there is nothing to send — WebKit leaves a control inserted into this row unpainted until a hover forces the invalidation, and staging an emoticon touches nothing else inside the pill that would have forced one. */}
        <button
          className="group inline-flex size-11 shrink-0 cursor-pointer items-center justify-center rounded-full outline-none focus-visible:ring-2 focus-visible:ring-primary disabled:cursor-not-allowed"
          type="button"
          disabled={!canSend}
          aria-label="보내기"
          onPointerDown={keepFieldFocused}
          onClick={submit}
        >
          <span
            className={cn(
              "inline-flex size-9 items-center justify-center rounded-full text-on-primary transition-colors",
              canSend
                ? "bg-primary group-hover:bg-primary-hover group-active:bg-primary-pressed"
                : "bg-primary-disabled",
            )}
          >
            <ArrowUp className="size-5" strokeWidth={2} />
          </span>
        </button>
      </div>
    </div>
  );

  function submit() {
    if (!canSend) {
      return;
    }

    onSend(text);
    setText("");

    // WARN: REQUIREMENTS.md § 13.6. The picker survives a send, and focusing the field here would raise the keyboard it can never share the screen with.
    if (isEmoticonPickerOpen) {
      return;
    }

    // INFO: Runs inside the click gesture on purpose — iOS only re-opens the keyboard for a `focus()` a user activation still covers.
    fieldRef.current?.focus();
  }

  // WARN: Cancelling `pointerdown` is what stops the tap from blurring the field; `click` still fires, so `submit` is untouched.
  function keepFieldFocused(event: PointerEvent<HTMLButtonElement>) {
    event.preventDefault();
  }

  // INFO: AGENTS.md § 4.2. A hardware keyboard sends on Enter; on touch the same key has to stay a newline, since the iOS keyboard offers no send key.
  function handleKeyDown(event: KeyboardEvent<HTMLTextAreaElement>) {
    if (
      isCoarsePointer ||
      event.key !== "Enter" ||
      event.shiftKey ||
      event.nativeEvent.isComposing
    ) {
      return;
    }

    event.preventDefault();
    submit();
  }
}
