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
    <div className={cn("flex items-end gap-2xs px-md py-2xs", className)} aria-live="polite">
      <span className="sr-only">{typist.name}님이 입력 중이에요</span>
      {/* WARN: DESIGN.md § 6.7.1. `canEnlarge` stays off — this circle stands in for a bubble that does not exist yet, and enlarging it would offer a photo the row is not really showing. */}
      <span className="shrink-0" aria-hidden>
        <Avatar name={typist.name} mediaId={typist.avatarMediaId} />
      </span>
      {/* INFO: DESIGN.md § 6.2. The incoming bubble exactly — same radius, same fill, same hairline — because this is where that bubble is about to appear. */}
      <span
        className="inline-flex items-center gap-2xs rounded-bubble rounded-tl-xs border border-hairline bg-bubble-theirs px-sm py-sm"
        aria-hidden
      >
        {DOT_DELAYS.map((delay) => (
          <span key={delay} className={cn("size-1.5 animate-bounce rounded-full bg-meta", delay)} />
        ))}
      </span>
    </div>
  );
}
