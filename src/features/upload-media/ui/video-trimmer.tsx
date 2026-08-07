"use client";

import type { MediaDraft } from "@/entities/media";
import { A_SECOND, cn, type Nullable } from "@/shared/lib";
import { Button, IconButton, PreloadVideo, ShellOverlay, toast } from "@/shared/ui";
import { X } from "lucide-react";
import { useEffect, useRef, useState, type ChangeEvent, type SyntheticEvent } from "react";
import { toDefaultTrimRange, trimVideo, type TrimRange } from "../model/trim-video";

export type VideoTrimmerProps = {
  className?: string;
  draft: MediaDraft;
  /**
   * REQUIREMENTS.md § 12.1. The window the result must fit inside, in milliseconds.
   *
   * INFO: Given, the window is a fixed width and the user chooses only where it
   * sits — a second handle would offer a length that is already decided. Omitted
   * (§ 9.'s chat and gallery attachments, which have no length cap), both ends
   * move and trimming is an edit rather than a requirement.
   */
  maxDurationMs?: number;
  onCancel: () => void;
  /** Given the trimmed file, for the caller to re-read into a draft of its own. */
  onDone: (file: File) => void;
};

// INFO: Short enough that a handle cannot produce a clip with no frames in it. AGENTS.md § 8.1. — a duration is milliseconds here and converted at the call site like every other one.
const MIN_TRIM_DURATION = A_SECOND / 2;

/**
 * Cuts a video down, over the app shell — the § 12.1. background's 30s window, or
 * a free range for an attachment.
 *
 * WARN: `absolute`, never `fixed` — AGENTS.md § 4.4. keeps the app shell as the one
 * fixed element. `ShellOverlay` is what makes the shell the box this fills, exactly
 * as `MediaEditor` does.
 */
export function VideoTrimmer({
  className,
  draft,
  maxDurationMs,
  onCancel,
  onDone,
}: VideoTrimmerProps) {
  const videoRef = useRef<Nullable<HTMLVideoElement>>(null);
  const [sourceUrl, setSourceUrl] = useState("");
  const [isTrimming, setIsTrimming] = useState(false);
  // WARN: The element's own duration, not only the draft's. `toVideoDraft` reports `null` for a fragmented MP4 and some `.mov`, and a free-range trim that fell back to a literal would have cut every such clip down to that literal — data loss with no message. The element resolves it for real at `loadedmetadata`, and until then the handles are pinned to the cap.
  const [measuredMs, setMeasuredMs] = useState<Nullable<number>>(draft.durationMs);
  const durationMs = measuredMs ?? maxDurationMs ?? A_SECOND;
  const isMeasured = measuredMs !== null;
  const minTrimSeconds = MIN_TRIM_DURATION / A_SECOND;
  const durationSeconds = durationMs / A_SECOND;
  const isFixedWindow = maxDurationMs !== undefined;
  const windowSeconds = isFixedWindow
    ? Math.min(durationMs, maxDurationMs) / A_SECOND
    : durationSeconds;
  const latestStart = isFixedWindow
    ? Math.max(0, (durationMs - maxDurationMs) / A_SECOND)
    : Math.max(0, durationSeconds - MIN_TRIM_DURATION / A_SECOND);
  const [start, setStart] = useState(
    () => toDefaultTrimRange(durationMs, maxDurationMs ?? durationMs).start,
  );
  const [end, setEnd] = useState(durationSeconds);
  // INFO: The end handle follows a duration that only resolved at `loadedmetadata`; before that it is sitting on the placeholder and would cut the clip to it.
  const resolvedFreeEnd = isMeasured ? end : durationSeconds;
  // INFO: The fixed window follows its start; a free range is whatever the two handles say.
  const resolvedEnd = isFixedWindow
    ? Math.min(start + windowSeconds, durationSeconds)
    : resolvedFreeEnd;

  // WARN: Created and revoked inside one effect, never from a `useState` initializer — `MediaEditor` carries the argument: StrictMode's setup → cleanup → setup would revoke a URL that state kept, leaving the element on a dead blob.
  useEffect(() => {
    const url = URL.createObjectURL(draft.file);

    // eslint-disable-next-line react-hooks/set-state-in-effect -- The object URL is external state; minting it and handing it to React is this effect's whole purpose.
    setSourceUrl(url);

    return () => URL.revokeObjectURL(url);
  }, [draft.file]);

  return (
    <ShellOverlay>
      <div className={cn("absolute inset-0 z-50 flex flex-col bg-scrim", className)}>
        <div className="flex items-center justify-between p-sm pt-[max(var(--spacing-sm),env(safe-area-inset-top))]">
          <IconButton
            className="text-on-primary hover:bg-canvas/15 hover:text-on-primary"
            Icon={X}
            aria-label="자르기 취소"
            onClick={onCancel}
          />
          <span className="text-caption text-on-primary">
            {isFixedWindow ? `${Math.round(windowSeconds)}초만 쓸 수 있어요` : "영상 자르기"}
          </span>
          <Button
            className="w-auto"
            buttonClassName="h-9 min-h-9 w-auto px-sm"
            disabled={isTrimming || !isMeasured}
            haptic
            onClick={() => void submit()}
          >
            {isTrimming ? "자르는 중" : "완료"}
          </Button>
        </div>
        <div className="flex min-h-0 flex-1 items-center justify-center px-md">
          {/* INFO: `muted` and `playsInline` so scrubbing previews on iOS without the element demanding fullscreen; there is no audio in the result either way. */}
          {/* INFO: The poster stands in until the first frame decodes — an unwrapped element paints black for the length of the load, which over a `scrim` backdrop reads as nothing having opened. */}
          {/* WARN: Mounted only once the object URL exists. An element that loads its source after mount is never re-judged for playback and its seeks before that point are dropped, so it would sit on a frame the handles do not agree with. */}
          {sourceUrl && (
            <PreloadVideo
              ref={videoRef}
              className="max-h-full max-w-full"
              videoClassName="max-h-full max-w-full"
              placeholderClassName="rounded-md"
              src={sourceUrl}
              poster={draft.previewUrl ?? undefined}
              muted
              playsInline
              preload="metadata"
              onLoadedMetadata={handleMetadata}
            />
          )}
        </div>
        <div className="space-y-xs p-md pb-[max(var(--spacing-md),env(safe-area-inset-bottom))]">
          <label className="block text-body-sm text-on-primary" htmlFor="trim-start">
            {isFixedWindow ? "시작 지점" : "시작"}
          </label>
          {/* INFO: Range inputs rather than a filmstrip. Decoding a strip of thumbnails is a second pass over the file for an affordance the handles already give, and the preview above already shows the frame under the one being dragged. */}
          <input
            className="w-full accent-primary"
            type="range"
            min={0}
            max={latestStart}
            step={0.1}
            value={start}
            disabled={isTrimming || latestStart <= 0}
            id="trim-start"
            onChange={handleStartScrub}
          />
          {!isFixedWindow && (
            <>
              <label className="block text-body-sm text-on-primary" htmlFor="trim-end">
                끝
              </label>
              <input
                className="w-full accent-primary"
                type="range"
                min={0}
                max={durationSeconds}
                step={0.1}
                value={end}
                disabled={isTrimming}
                id="trim-end"
                onChange={handleEndScrub}
              />
            </>
          )}
          <p className="text-center text-caption text-on-primary/80">
            {`${formatSeconds(start)} ~ ${formatSeconds(resolvedEnd)} · ${formatSeconds(resolvedEnd - start)}`}
          </p>
        </div>
      </div>
    </ShellOverlay>
  );

  /**
   * WARN: The duration is taken from the element, because `toVideoDraft` reports
   * `null` for containers whose header does not carry one. Without this a free-range
   * trim of such a clip cut it down to the placeholder length and said nothing.
   *
   * INFO: The element also opens on the frame the start handle names, which for a
   * clip past the cap is not frame 0.
   */
  function handleMetadata(event: SyntheticEvent<HTMLVideoElement>) {
    const video = event.currentTarget;

    if (Number.isFinite(video.duration) && video.duration > 0) {
      const resolved = Math.round(video.duration * A_SECOND);

      setMeasuredMs(resolved);
      setEnd((current) => (isMeasured ? current : resolved / A_SECOND));
    }

    video.currentTime = start;
  }

  // INFO: The preview seeks with whichever handle moved, so the frame on screen is the cut the user is aiming.
  function handleStartScrub(event: ChangeEvent<HTMLInputElement>) {
    const next = Number(event.target.value);

    setStart(next);
    // WARN: The end is pushed rather than clamped on submit. Left behind the start, the range inverts and `mediabunny` is handed a negative window.
    setEnd((current) => Math.min(durationSeconds, Math.max(current, next + minTrimSeconds)));
    seek(next);
  }

  function handleEndScrub(event: ChangeEvent<HTMLInputElement>) {
    const next = Number(event.target.value);

    setEnd(next);
    // WARN: Clamped at zero. Dragging the end to the very start would otherwise push this negative, handing `mediabunny` a range that begins before the file does — and leaving the `min={0}` input showing 0 while state held something else.
    setStart((current) => Math.max(0, Math.min(current, next - minTrimSeconds)));
    seek(next);
  }

  function seek(seconds: number) {
    if (videoRef.current) {
      videoRef.current.currentTime = seconds;
    }
  }

  async function submit() {
    setIsTrimming(true);

    try {
      const range: TrimRange = { start, end: resolvedEnd };

      onDone(await trimVideo(draft.file, range));
    } catch {
      // INFO: The one failure the user can act on is a codec this browser cannot decode; everything else here is a bug. Both read the same from the outside, so the copy names neither.
      toast.error("영상을 자르지 못했어요");
    } finally {
      setIsTrimming(false);
    }
  }
}

function formatSeconds(value: number): string {
  const total = Math.round(value);

  return `${Math.floor(total / 60)}:${String(total % 60).padStart(2, "0")}`;
}
