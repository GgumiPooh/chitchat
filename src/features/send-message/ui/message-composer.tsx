"use client";

import { MAX_MESSAGE_LENGTH } from "@/shared/config";
import { cn, useIsCoarsePointer, type Nullable } from "@/shared/lib";
import { IconButton, Textarea } from "@/shared/ui";
import { ArrowUp, Plus, Smile } from "lucide-react";
import { useRef, useState, type KeyboardEvent, type PointerEvent } from "react";

export type MessageComposerProps = {
  className?: string;
  fieldClassName?: string;
  onSend: (text: string) => void;
};

// INFO: DESIGN.md § 6.6. A floating bar over the message column, not a flow child — the messages are meant to pass under it, which is also what gives the glass something to blur.
export function MessageComposer({ className, fieldClassName, onSend }: MessageComposerProps) {
  const fieldRef = useRef<Nullable<HTMLTextAreaElement>>(null);
  const [text, setText] = useState("");
  const isCoarsePointer = useIsCoarsePointer();
  const canSend = text.trim().length > 0;

  return (
    // WARN: DESIGN.md § 3.5. Transparent to the pointer so the messages underneath stay tappable; only the pill itself takes taps.
    <div className={cn("pointer-events-none px-md pt-xs pb-xs", className)}>
      {/* INFO: DESIGN.md § 6.6. The tab bar's floating surface (§ 7.3.). One row, bottom-aligned — the field grows upward and the controls stay on the last line. */}
      <div className="pointer-events-auto flex items-end gap-2xs rounded-[calc(var(--tab-bar-height)/2)] border border-hairline glass p-2xs shadow-floating">
        {/* TODO: Attaching images is step 6 of REQUIREMENTS.md § 17. */}
        <IconButton Icon={Plus} disabled aria-label="사진 보내기" />
        <Textarea
          ref={fieldRef}
          className={cn(
            // INFO: DESIGN.md § 6.6. No shape of its own — the pill is the field's surface, so no border, no radius, and no focus ring.
            "max-h-34 min-h-11 resize-none rounded-none border-transparent bg-transparent px-2xs py-xs hover:border-transparent focus-visible:border-transparent focus-visible:ring-0",
            fieldClassName,
          )}
          maxLength={MAX_MESSAGE_LENGTH}
          rows={1}
          value={text}
          placeholder="메시지 입력"
          aria-label="메시지 입력"
          onChange={(event) => setText(event.target.value)}
          onKeyDown={handleKeyDown}
        />
        {canSend ? (
          <button
            className="group inline-flex size-11 shrink-0 cursor-pointer items-center justify-center rounded-full outline-none focus-visible:ring-2 focus-visible:ring-primary"
            type="button"
            aria-label="보내기"
            onPointerDown={keepFieldFocused}
            onClick={submit}
          >
            <span className="inline-flex size-9 items-center justify-center rounded-full bg-primary text-on-primary transition-colors group-hover:bg-primary-hover group-active:bg-primary-pressed">
              <ArrowUp className="size-5" strokeWidth={2} />
            </span>
          </button>
        ) : (
          // TODO: The emoticon picker is step 8 of REQUIREMENTS.md § 17.
          <IconButton Icon={Smile} disabled aria-label="이모티콘" />
        )}
      </div>
    </div>
  );

  function submit() {
    if (!canSend) {
      return;
    }

    onSend(text);
    setText("");
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
