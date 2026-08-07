"use client";

import { cn } from "@/shared/lib";
import { Pause, Play } from "lucide-react";

export type AudioPlayButtonProps = {
  className?: string;
  isPlaying: boolean;
  onToggle: () => void;
};

/**
 * REQUIREMENTS.md § 9.1. Plays an **attached** audio file where it sits in the 파일
 * shelf, so listening to one no longer means saving it first.
 *
 * WARN: A sibling of the row, never a control inside it. `FileCard` is a `<button>`
 * and the row's own tap is still 저장, so nesting this would be invalid markup and
 * would make one of the two taps unreachable — the 음성 list solved the same problem
 * the same way with its selection mark (DESIGN.md § 7.10.1.).
 *
 * WARN: This draws no waveform, and that is the whole reason an attached audio file
 * stays a **file** rather than moving to the 음성 shelf. Peaks are extracted by
 * decoding the clip in the browser (§ 9.3.), which is affordable only because a
 * recording is capped at `MAX_VOICE_DURATION`; an attachment has no cap at all.
 */
export function AudioPlayButton({ className, isPlaying, onToggle }: AudioPlayButtonProps) {
  return (
    // INFO: DESIGN.md § 3.2., § 6.6. A 36 disc inside a 44 target, as `VoicePlayer`'s transport is — the two controls do the same thing and must not be drawn at two sizes.
    <button
      className={cn(
        "group inline-flex size-11 shrink-0 cursor-pointer items-center justify-center rounded-full outline-none focus-visible:ring-2 focus-visible:ring-primary",
        className,
      )}
      type="button"
      aria-label={isPlaying ? "일시정지" : "재생"}
      onClick={onToggle}
    >
      <span className="inline-flex size-9 press-bloom items-center justify-center rounded-full bg-primary text-on-primary group-hover:bg-primary-hover group-active:bg-primary-pressed">
        {/* INFO: DESIGN.md § 4.6. Filled rather than outlined, for the reason `VoicePlayer` gives — a 16px lucide triangle on a coloured disc reads as a chevron. */}
        {isPlaying ? (
          <Pause className="size-4 fill-current" strokeWidth={1.75} />
        ) : (
          <Play className="size-4 translate-x-px fill-current" strokeWidth={1.75} />
        )}
      </span>
    </button>
  );
}
