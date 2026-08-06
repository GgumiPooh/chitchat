import type { Participant } from "@/entities/user";
import { cn, type Nullable } from "@/shared/lib";
import { Avatar } from "@/shared/ui";

export type TypingIndicatorProps = {
  className?: string;
  /** Held through the fade-out, so the avatar does not vanish a frame before the bubble does. */
  typist: Nullable<Participant>;
  isVisible: boolean;
};

const DOT_DELAYS = ["[animation-delay:0ms]", "[animation-delay:150ms]", "[animation-delay:300ms]"];

/**
 * REQUIREMENTS.md § 8.12. 입력 중, above the composer — the sender's avatar and a
 * bubble of moving dots, on the incoming side (DESIGN.md § 6.7.1.).
 *
 * WARN: An overlay in the composer's absolute wrapper, never a row in the
 * virtualized list. A tail item that appears and disappears every few seconds
 * re-measures the list and drags the scroll position with it (§ 8.3.), which
 * reads as the conversation twitching while the other person types.
 */
export function TypingIndicator({ className, typist, isVisible }: TypingIndicatorProps) {
  return (
    // WARN: DESIGN.md § 6.7.1. The live region is never itself hidden and never itself removed. A region inside an `aria-hidden` subtree is not watched at all, and one that is unmounted takes its own announcement with it.
    <div
      className={cn(
        "pointer-events-none flex items-end gap-2xs transition-all duration-150",
        isVisible ? "translate-y-0 opacity-100" : "translate-y-1 opacity-0",
        className,
      )}
      // INFO: Announced politely rather than assertively — it is ambient status, and it changes often enough that an assertive live region would interrupt a screen reader mid-message.
      aria-live="polite"
    >
      {/* WARN: The sentence is mounted by the transition, not merely revealed by it. A live region announces a *mutation* of its contents, so text that is always present and only styled away is announced exactly never. */}
      {isVisible && typist && <span className="sr-only">{typist.name}님이 입력 중이에요</span>}
      {/* WARN: DESIGN.md § 6.7.1. `canEnlarge` stays off. The § 7.10. viewer would open behind the composer over a wrapper that is `pointer-events-none` anyway, and this avatar is a status glyph rather than the person's photo to be inspected. */}
      {/* INFO: The circle is wrapped rather than given `aria-hidden` of its own — `AvatarProps` is an explicit prop list (`AGENTS.md § 1.1.`) and takes no ARIA passthrough. */}
      <span className="shrink-0" aria-hidden>
        <Avatar name={typist?.name ?? ""} mediaId={typist?.avatarMediaId} />
      </span>
      <span
        className="inline-flex items-center gap-2xs rounded-bubble border border-hairline glass px-sm py-xs shadow-floating"
        aria-hidden
      >
        {DOT_DELAYS.map((delay) => (
          <span key={delay} className={cn("size-1.5 animate-bounce rounded-full bg-meta", delay)} />
        ))}
      </span>
    </div>
  );
}
