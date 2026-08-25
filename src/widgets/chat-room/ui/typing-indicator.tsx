import type { Participant } from "@/entities/user";
import { cn } from "@/shared/lib";
import { Avatar } from "@/shared/ui";

export type TypingIndicatorProps = {
  className?: string;
  typist: Participant;
};

const DOT_DELAYS = ["[animation-delay:0ms]", "[animation-delay:150ms]", "[animation-delay:300ms]"];

/**
 * REQUIREMENTS.md § 8.12. 입력 중, rendered as the last thing in the conversation —
 * the typist's avatar and a bubble of moving dots, laid out as the incoming row it
 * is standing in for (DESIGN.md § 6.7.1.).
 *
 * WARN: Mounted and unmounted rather than faded in place. It occupies real height
 * at the tail of the list, so a copy kept around at `opacity-0` would hold a gap
 * open under the newest message for as long as nobody was typing.
 */
export function TypingIndicator({ className, typist }: TypingIndicatorProps) {
  return (
    // INFO: Announced politely — it is ambient status, and it changes often enough that an assertive region would interrupt a screen reader mid-message.
    // WARN: DESIGN.md § 6.7.1. `py-xs`, and `--typing-indicator-height` is computed from the same token — they are one measurement written twice, so changing the padding here without the token crops the row against the slot that holds it.
    // INFO: AGENTS.md § 4.1. Capped and centred like `contentRef`'s column — `ListFooter` sits outside it, so without this the row hugs the scroller's left edge on a wide pane.
    <div
      className={cn(
        "mx-auto flex max-w-(--content-max-width) items-end gap-2xs px-md py-xs",
        className,
      )}
      aria-live="polite"
    >
      <span className="sr-only">{typist.name}님이 입력 중이에요</span>
      {/* WARN: DESIGN.md § 6.7.1. `canEnlarge` stays off — this circle stands in for a bubble that does not exist yet, and enlarging it would offer a photo the row is not really showing. */}
      <span className="shrink-0" aria-hidden>
        <Avatar name={typist.name} mediaId={typist.avatarMediaId} />
      </span>
      {/* INFO: DESIGN.md § 6.2. The incoming bubble exactly — same radius, same fill, same hairline, same `px-sm py-xs` — because this is where that bubble is about to appear. */}
      <span
        className="inline-flex items-center rounded-bubble rounded-tl-xs border border-hairline bg-bubble-theirs px-sm py-xs"
        aria-hidden
      >
        <TypingDots />
      </span>
    </div>
  );
}

export type TypingDotsProps = {
  className?: string;
  dotClassName?: string;
};

/** The bouncing-dot content of the § 6.7.1. bubble — also what a queued or not-yet-answering AI generation draws before its first token arrives. */
export function TypingDots({ className, dotClassName }: TypingDotsProps) {
  return (
    // WARN: DESIGN.md § 6.7.1. Exactly one line of `chat-body`, from the same two tokens the text it stands in for would use — so the bubble is the height of a one-line message, not of three 6px dots.
    <span
      className={cn(
        "flex h-[calc(var(--text-chat-body)*var(--text-chat-body--line-height))] items-center gap-2xs",
        className,
      )}
    >
      {DOT_DELAYS.map((delay) => (
        <span
          key={delay}
          className={cn("size-1.5 animate-bounce rounded-full bg-meta", delay, dotClassName)}
        />
      ))}
    </span>
  );
}
