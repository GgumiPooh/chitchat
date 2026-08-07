"use client";

import { MAX_VOICE_DURATION, VOICE_LEVEL_WINDOW, VOICE_PEAK_SCALE } from "@/shared/config";
import { cn, formatDuration, useUnsentWork } from "@/shared/lib";
import { HapticTarget, IconButton } from "@/shared/ui";
import { Check, X } from "lucide-react";
import { useEffect, useLayoutEffect, useRef } from "react";
import {
  useVoiceRecorder,
  type VoiceRecorderState,
  type VoiceRecording,
} from "../model/use-voice-recorder";

export type VoiceRecorderBarProps = {
  className?: string;
  levelClassName?: string;
  /** REQUIREMENTS.md § 9.3. The finished recording. A press too short to be one never arrives here. */
  onDone: (recording: VoiceRecording) => void;
  /** Every way the bar leaves: 취소, a recording dropped for being too short, and a refused microphone alike. */
  onClose: () => void;
};

// INFO: The strip's bar heights, as a percentage of its own box. A silent microphone still shows the floor, so the strip reads as present rather than broken.
const LEVEL_FLOOR = 12;

/**
 * The strip that stands in the composer stack while a voice message is being
 * recorded (REQUIREMENTS.md § 9.3., DESIGN.md § 6.6.1.).
 *
 * WARN: It starts the microphone from its own mount, so it may only be mounted
 * inside the gesture that asked for it — `getUserMedia` is gated on a transient
 * activation and iOS additionally refuses a call stack no tap covers.
 */
export function VoiceRecorderBar({
  className,
  levelClassName,
  onDone,
  onClose,
}: VoiceRecorderBarProps) {
  // INFO: Whether the microphone was ever actually open. The bar mounts on `idle` too, and that first frame must not read as the recorder having finished.
  const hasStartedRef = useRef(false);
  const { state, elapsedMs, levels, start, stop, cancel } = useVoiceRecorder({
    onDone: (recording) => {
      onDone(recording);
      onClose();
    },
  });

  // INFO: REQUIREMENTS.md § 15.1. A running microphone is unsent work — a forced refresh mid-sentence loses a recording with no draft to resume from.
  useUnsentWork(state !== "idle");

  // WARN: The mount is the gesture. Deferring the start to a control inside the bar would spend the tap that opened it and ask for a second one.
  // WARN: A layout effect, never a passive one. React schedules passive effects onto a task of their own that runs after paint, which is off the discrete event's call stack — WebKit gates `getUserMedia` on that stack and refuses the first recording on iOS as `NotAllowedError` without ever asking.
  useLayoutEffect(() => {
    void start().then((didBegin) => {
      // WARN: An engine with no `MediaRecorder` refuses before `requesting`, so the state gate below never sees a change — without this the bar stands in the stack over a clock that will never move.
      if (!didBegin) {
        onClose();
      }
    });
    // WARN: `start` alone, and it is stable. Re-running this would open a second stream against a session the first still holds.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // INFO: The recorder returns to `idle` on its own for a refused microphone and for a press too short to keep — neither reaches `onDone`, so this is the only thing that takes the bar back down.
  useEffect(() => {
    if (state !== "idle") {
      hasStartedRef.current = true;
      return;
    }

    if (hasStartedRef.current) {
      onClose();
    }
  }, [onClose, state]);

  return (
    <div
      className={cn(
        "pointer-events-auto flex items-center gap-xs rounded-full border border-hairline glass py-2xs pr-2xs pl-xs shadow-floating",
        className,
      )}
    >
      {/* INFO: DESIGN.md § 6.6.1. The one place `semantic-error` is not an error — it is the recording indicator every OS draws in that colour, and it pulses so a stalled microphone reads as stalled. */}
      <span
        className="size-2 shrink-0 animate-pulse rounded-full bg-semantic-error"
        aria-hidden="true"
      />
      <span className="shrink-0 text-chat-time text-meta tabular-nums">
        {formatDuration(elapsedMs)}
      </span>
      {/* INFO: `aria-hidden` — the elapsed time beside it already says the recording is running, and a live region ticking at the sample rate would talk over everything else. */}
      <div
        className={cn("flex h-6 min-w-0 flex-1 items-center gap-px", levelClassName)}
        aria-hidden="true"
      >
        {Array.from({ length: VOICE_LEVEL_WINDOW }, (_, index) => (
          <span
            key={index}
            className="flex-1 rounded-full bg-primary/70 transition-[height] duration-75 ease-out"
            style={{
              height: `${toBarHeight(levels[levels.length - VOICE_LEVEL_WINDOW + index])}%`,
            }}
          />
        ))}
      </div>
      <IconButton Icon={X} haptic aria-label="녹음 취소" onClick={handleCancel} />
      {/* WARN: `keepsFocus` for the same reason the send button carries it (DESIGN.md § 6.6.) — the overlay takes the tap, and without it the composer's field blurs and iOS drops the keyboard behind the bar. */}
      <HapticTarget className="inline-flex shrink-0" keepsFocus>
        <button
          className="group inline-flex size-11 shrink-0 cursor-pointer items-center justify-center rounded-full outline-none focus-visible:ring-2 focus-visible:ring-primary"
          type="button"
          aria-label="녹음 완료"
          onClick={stop}
        >
          {/* INFO: DESIGN.md § 4.7.2. The composer's own send disc, so the control that finishes a recording is the control that sends everything else. */}
          <span className="inline-flex size-9 press-bloom items-center justify-center rounded-full bg-primary text-on-primary group-hover:bg-primary-hover group-active:bg-primary-pressed">
            <Check className="size-5" strokeWidth={2} />
          </span>
        </button>
      </HapticTarget>
      {/* INFO: The only spoken copy here. The clock and the meter are decoration to a screen reader, and this is what says the state changed. */}
      <span className="sr-only" aria-live="polite">
        {toStatusLabel(state, elapsedMs)}
      </span>
    </div>
  );

  function handleCancel() {
    cancel();
    onClose();
  }
}

// INFO: The stored peaks are integers against `VOICE_PEAK_SCALE`; the live level is the raw `0`–`1` RMS, which never approaches 1 for speech — the multiplier is what makes an ordinary voice fill the strip.
function toBarHeight(level = 0): number {
  return Math.min(LEVEL_FLOOR + level * VOICE_PEAK_SCALE * 2, 100);
}

function toStatusLabel(state: VoiceRecorderState, elapsedMs: number): string {
  if (state === "requesting") {
    return "마이크를 준비하고 있어요";
  }

  return state === "recording"
    ? `녹음 중 ${formatDuration(elapsedMs)} / 최대 ${formatDuration(MAX_VOICE_DURATION)}`
    : "";
}
