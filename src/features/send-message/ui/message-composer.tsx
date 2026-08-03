"use client";

import { MAX_MESSAGE_LENGTH } from "@/shared/config";
import { cn, useIsCoarsePointer } from "@/shared/lib";
import { IconButton, Textarea } from "@/shared/ui";
import { ArrowUp, Plus, Smile } from "lucide-react";
import { useState, type KeyboardEvent } from "react";

export type MessageComposerProps = {
  className?: string;
  fieldClassName?: string;
  onSend: (text: string) => void;
};

// INFO: DESIGN.md § 6.6. Static inside the shell column, not `fixed` — the virtualizer needs a bounded list box above it, and `interactiveWidget: "resizes-content"` moves the whole column with the keyboard.
export function MessageComposer({ className, fieldClassName, onSend }: MessageComposerProps) {
  const [text, setText] = useState("");
  const isCoarsePointer = useIsCoarsePointer();
  const canSend = text.trim().length > 0;

  return (
    <div
      className={cn("flex items-end gap-2xs border-t border-hairline bg-canvas p-xs", className)}
    >
      {/* TODO: Attaching images is step 6 of REQUIREMENTS.md § 17. */}
      <IconButton Icon={Plus} disabled aria-label="사진 보내기" />
      <Textarea
        className={cn(
          "max-h-34 min-h-11 resize-none rounded-full border-transparent bg-surface-soft px-3.5 py-xs hover:border-transparent focus-visible:border-transparent focus-visible:bg-canvas focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-inset",
          fieldClassName,
        )}
        maxLength={MAX_MESSAGE_LENGTH}
        rows={1}
        value={text}
        aria-label="메시지 입력"
        onChange={(event) => setText(event.target.value)}
        onKeyDown={handleKeyDown}
      />
      {canSend ? (
        <button
          className="group inline-flex size-11 shrink-0 cursor-pointer items-center justify-center rounded-full outline-none focus-visible:ring-2 focus-visible:ring-primary"
          type="button"
          aria-label="보내기"
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
  );

  function submit() {
    if (!canSend) {
      return;
    }

    onSend(text);
    setText("");
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
