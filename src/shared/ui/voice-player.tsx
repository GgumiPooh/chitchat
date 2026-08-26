"use client";

import { cn, formatDuration, useVoicePlayback, type Nullable } from "@/shared/lib";
import { OFFLINE_MESSAGES, useOfflineGate } from "@/shared/offline-ux";
import { Pause, Play } from "lucide-react";
import { useMemo, type KeyboardEvent, type PointerEvent, type ReactNode } from "react";

export type VoicePlayerProps = {
  className?: string;
  /** The waveform's own box, for a caller that has to cap or stretch it. */
  waveformClassName?: string;
  /** The audio to play. On an optimistic bubble this is the recorder's local blob URL, not a stored object (REQUIREMENTS.md § 9.3.). */
  src: Nullable<string>;
  durationMs: number;
  /** The waveform, `0`–`1` and of a fixed length — `toChatMedia` converts from the column's integer scale. */
  peaks: number[];
  /** Which side of the conversation this bubble is on; the only input that chooses its fill. */
  isMine: boolean;
  /** REQUIREMENTS.md § 16.1. 나에게만 보내기 — a ring rather than a fill swap, since the card already reserves the fixed `h-14` § 8.3.'s estimate depends on and a ring (`box-shadow`) cannot change it. */
  isOnlyMe?: boolean;
  /** Still uploading. Dims to 60% (`DESIGN.md § 6.5.`) but stays playable, since the local blob is already a source. */
  isPending?: boolean;
};

// INFO: A silent sample still has to be a bar — at zero the row reads as a gap in the recording rather than as quiet.
const MIN_PEAK = 0.08;

// INFO: How far an arrow key walks the playhead, as a fraction of the whole. The keyboard has no notion of the 220px the waveform is drawn at, so the step is in the clip's own terms.
const KEY_STEP = 0.05;

/**
 * REQUIREMENTS.md § 9.3. One voice message, played through the shared element.
 *
 * INFO: The component draws its own fill rather than sitting inside a § 6.2. bubble, because `isMine` is the only thing that picks between the two and nothing above it knows the shape a voice row wants. The notch corner still comes from the row, through `className`.
 */
export function VoicePlayer({
  className,
  waveformClassName,
  src,
  durationMs,
  peaks,
  isMine,
  isOnlyMe = false,
  isPending = false,
}: VoicePlayerProps) {
  const { isActive, isPlaying, positionMs, progress, toggle, seekToRatio } = useVoicePlayback(
    src,
    durationMs,
  );
  // INFO: Two copies of one bar row, the upper clipped to the playhead — the alternative recolours every bar on every frame, and a row inside the virtualizer cannot afford that.
  const bars = useMemo(() => renderBars(peaks), [peaks]);
  // INFO: A pending bubble is still playable — REQUIREMENTS.md § 9.3. hands a recording its local blob as `originalUrl`, so the one clip in the app that has a source before it has an object is this one. What is missing is a source, never a landed upload.
  const isInert = src === null;
  // INFO: A stored clip is bytes behind § 9.'s expiring presigned redirect; the local blob the line above describes is already here, so it is one of the two sources this gate leaves alone.
  // WARN: `!isActive` is the other, and it is what keeps this a hint rather than a gate on a capability (`AGENTS.md § 4.2.`). Once the shared element is parked on this clip it holds the bytes, so pause, resume and scrub are local — a reader who walks into a tunnel mid-sentence has to be able to stop it. Only *starting* a clip nothing has fetched needs the network.
  const { isBlocked, blockedProps, guard } = useOfflineGate(
    OFFLINE_MESSAGES.play,
    src !== null && !src.startsWith("blob:") && !isActive,
  );

  return (
    <div
      className={cn(
        // INFO: DESIGN.md § 6.5. `w-55` is the 220px attachment width, so a voice note lines up in the column with a photo, a grid and a file card.
        // INFO: DESIGN.md § 6.5. `h-14` is fixed for the same reason the file card is: REQUIREMENTS.md § 8.3.'s estimate has to be exact for a bubble whose contents it cannot measure, and a waveform has no height of its own to derive one from.
        "flex h-14 w-55 shrink-0 items-center gap-xs rounded-bubble px-sm",
        // INFO: REQUIREMENTS.md § 16.1. 나에게만 보내기 — the same `bubble-*-private` fill swap `MessageRow`'s own text bubble reads, since this card already owns a fill of its own the way an emoticon or a photo does not. Checked ahead of `isMine`, not nested under it — 보관함's own row (`isMine={false}` always) still owns a private answer through the `theirs` half of the pair.
        isOnlyMe
          ? isMine
            ? "bg-bubble-mine-private"
            : "border border-transparent bg-bubble-theirs-private"
          : isMine
            ? "bg-bubble-mine"
            : "border border-hairline bg-bubble-theirs",
        // INFO: DESIGN.md § 6.5. An optimistic bubble dims rather than spinning.
        isPending && "opacity-60",
        className,
      )}
      role="group"
      // INFO: DESIGN.md § 6.5. dims an optimistic bubble, and a dim reaches nobody using a screen reader — this is the same fact said out loud.
      aria-label={isPending ? "음성 메시지, 전송 중이에요" : "음성 메시지"}
    >
      {/* INFO: DESIGN.md § 3.2., § 6.6. A 36 disc inside a 44 target, exactly as the composer's send button is — the glyph stays the size it should be drawn at and the hit area is padded around it. */}
      <button
        className="group inline-flex size-11 shrink-0 cursor-pointer items-center justify-center rounded-full outline-none focus-visible:ring-2 focus-visible:ring-primary disabled:cursor-not-allowed"
        type="button"
        disabled={isInert}
        aria-label={isPlaying ? "일시정지" : "재생"}
        {...blockedProps}
        onClick={guard(toggle)}
      >
        <span
          className={cn(
            // INFO: DESIGN.md § 4.7.2. The bloom sits on the disc rather than the 44 target, so the swell reads against the bubble around it.
            "inline-flex size-9 press-bloom items-center justify-center rounded-full text-on-primary",
            isInert || isBlocked
              ? "bg-primary-disabled"
              : "bg-primary group-hover:bg-primary-hover group-active:bg-primary-pressed",
          )}
        >
          {/* INFO: DESIGN.md § 4.6. Filled rather than outlined — a 16px lucide triangle at `1.75` on a coloured disc reads as a chevron, and the transport glyph is the one place the outline set has no answer. */}
          {isPlaying ? (
            <Pause className="size-4 fill-current" strokeWidth={1.75} />
          ) : (
            <Play className="size-4 translate-x-px fill-current" strokeWidth={1.75} />
          )}
        </span>
      </button>
      <div className="flex min-w-0 flex-1 flex-col gap-2xs">
        <div
          className={cn(
            // INFO: DESIGN.md § 3.2. The box is 32 tall against 24 of drawn waveform — the card is `h-14` and carries a clock, so this is as much hit area as there is to give, and it is padding rather than a taller graph.
            "relative h-8 w-full rounded-xs text-meta-soft transition-colors outline-none focus-visible:ring-2 focus-visible:ring-primary",
            isInert || isBlocked
              ? "cursor-default"
              : "cursor-pointer hover:text-meta active:text-ink",
            waveformClassName,
          )}
          role="slider"
          tabIndex={isInert || isBlocked ? -1 : 0}
          aria-label="재생 위치"
          aria-valuemin={0}
          aria-valuemax={Math.round(durationMs)}
          aria-valuenow={Math.round(isActive ? positionMs : 0)}
          aria-valuetext={formatDuration(isActive ? positionMs : 0)}
          aria-disabled={isInert || isBlocked}
          aria-describedby={blockedProps["aria-describedby"]}
          onPointerDown={handlePointerDown}
          onKeyDown={handleKeyDown}
        >
          {bars}
          <div
            className="absolute inset-0 text-primary"
            style={{ clipPath: `inset(0 ${(1 - progress) * 100}% 0 0)` }}
            aria-hidden
          >
            {bars}
          </div>
        </div>
        {/* INFO: DESIGN.md § 2.1. Elapsed over total, the way the reference app reads it — before playback the total stands alone, so the length of a note is known without committing to it. */}
        <span className="truncate text-chat-time text-chat-meta tabular-nums">
          {isActive
            ? `${formatDuration(positionMs)} / ${formatDuration(durationMs)}`
            : formatDuration(durationMs)}
        </span>
      </div>
    </div>
  );

  /**
   * DESIGN.md § 6.10. A tap, never a drag: the row this sits in is pulled sideways
   * to reply, and a scrub would have to take that gesture away from a 220px box
   * where it buys almost no precision.
   */
  function handlePointerDown(event: PointerEvent<HTMLDivElement>) {
    if (isInert || isBlocked || !event.isPrimary) {
      return;
    }

    const { left, width } = event.currentTarget.getBoundingClientRect();

    if (width > 0) {
      seekToRatio((event.clientX - left) / width);
    }
  }

  function handleKeyDown(event: KeyboardEvent<HTMLDivElement>) {
    if (isInert || isBlocked) {
      return;
    }

    // INFO: DESIGN.md § 3.2. The pointer affordance is the tap; these are what a slider owes a keyboard, since there is no x to read off a key press.
    const step =
      event.key === "ArrowRight" ? KEY_STEP : event.key === "ArrowLeft" ? -KEY_STEP : null;

    if (step === null) {
      return;
    }

    event.preventDefault();
    seekToRatio(progress + step);
  }
}

// INFO: `bg-current` on every bar, so one memoized row serves both the unplayed track and the clipped fill over it — the two differ by a `text-*` class on their wrapper and nothing else.
function renderBars(peaks: number[]): ReactNode {
  return (
    <div
      className="pointer-events-none absolute inset-x-0 inset-y-1 flex items-center gap-px"
      aria-hidden
    >
      {/* INFO: A clip whose peaks never arrived still has to draw a track for the fill to run along, or the row loses its playhead entirely. */}
      {peaks.length === 0 ? (
        <span className="h-0.5 w-full rounded-full bg-current" />
      ) : (
        peaks.map((peak, index) => (
          <span
            key={index}
            className="min-h-0.5 min-w-0 flex-1 rounded-full bg-current"
            style={{ height: `${Math.min(Math.max(peak, MIN_PEAK), 1) * 100}%` }}
          />
        ))
      )}
    </div>
  );
}
