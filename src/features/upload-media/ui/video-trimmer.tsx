"use client";

import type { MediaDraft } from "@/entities/media";
import { A_SECOND, cn, type Nullable, type Optional } from "@/shared/lib";
import { Button, IconButton, PreloadVideo, ShellOverlay, Slider, toast } from "@/shared/ui";
import { ArrowRight, Pause, Play, X } from "lucide-react";
import { useEffect, useRef, useState, type SyntheticEvent } from "react";
import { releaseSource } from "../model/read-draft";
import { trimVideo, type TrimRange } from "../model/trim-video";

/**
 * How long the result may be.
 *
 * INFO: A `window` is a fixed width and the user chooses only where it sits, since
 * a second handle would offer a length that is already decided (§ 12.1.'s
 * background, which loops). A `ceiling` moves both handles and only refuses to let
 * them spread past `durationMs` — § 13.4.1.'s emoticon, where the length is part of
 * the gesture.
 */
export type TrimLimit = {
  kind: "window" | "ceiling";
  durationMs: number;
};

export type VideoTrimmerProps = {
  className?: string;
  draft: MediaDraft;
  /** REQUIREMENTS.md § 12.1. Omitted (§ 9.'s chat and library attachments, which have no length cap), both ends move freely and trimming is an edit rather than a requirement. */
  limit?: TrimLimit;
  /** REQUIREMENTS.md § 13.4.1. Carries the source's sound into the cut, for a caller whose next screen plays it — a background is stored silent. */
  keepsAudio?: boolean;
  /** The cut this screen opens on, for a flow stepping back into it — the handles are where they were left rather than at the ends of the clip. */
  initialRange?: TrimRange;
  /** REQUIREMENTS.md § 13.4.1. Whether a screen follows this one — the cut is then a step rather than the end of an edit, and the bar says so with → instead of 완료. */
  hasNextStep?: boolean;
  onCancel: () => void;
  /** Given the trimmed file and the range it was cut at, for the caller to re-read into a draft of its own. */
  onDone: (file: File, range: TrimRange) => void;
};

// INFO: Short enough that a handle cannot produce a clip with no frames in it. AGENTS.md § 8.1. — a duration is milliseconds here and converted at the call site like every other one.
const MIN_TRIM_DURATION = A_SECOND / 2;

// INFO: Seconds. Fine enough to land on a frame at any sane frame rate, coarse enough that a thumb dragged across a long clip does not re-seek every pixel.
const SCRUB_STEP = 0.1;

/**
 * Cuts a video down, over the app shell — the § 12.1. background's 30s window, or
 * a free range for an attachment.
 *
 * WARN: `absolute`, never `fixed` — `ShellOverlay` owns the viewport-sized box this
 * fills (DESIGN.md § 3.3.), exactly as `MediaEditor` does.
 */
export function VideoTrimmer({
  className,
  draft,
  limit,
  keepsAudio,
  initialRange,
  hasNextStep,
  onCancel,
  onDone,
}: VideoTrimmerProps) {
  const videoRef = useRef<Nullable<HTMLVideoElement>>(null);
  const [sourceUrl, setSourceUrl] = useState("");
  const [isTrimming, setIsTrimming] = useState(false);
  const [hasFailed, setHasFailed] = useState(false);
  const [isPlaying, setIsPlaying] = useState(false);
  // WARN: The element's own duration, not only the draft's. `toVideoDraft` reports `null` for a fragmented MP4 and some `.mov`, and a free-range trim that fell back to a literal would have cut every such clip down to that literal — data loss with no message. The element resolves it for real at `loadedmetadata`, and until then the handles are pinned to the cap.
  const [measuredMs, setMeasuredMs] = useState<Nullable<number>>(draft.durationMs);
  const durationMs = measuredMs ?? limit?.durationMs ?? A_SECOND;
  const isMeasured = measuredMs !== null;
  const minTrimSeconds = MIN_TRIM_DURATION / A_SECOND;
  const durationSeconds = durationMs / A_SECOND;
  const isFixedWindow = limit?.kind === "window";
  // INFO: The whole clip where there is no ceiling, so every clamp below is a no-op for a free range rather than a branch.
  const ceilingSeconds = limit?.kind === "ceiling" ? limit.durationMs / A_SECOND : durationSeconds;
  const windowSeconds =
    isFixedWindow && limit ? Math.min(durationMs, limit.durationMs) / A_SECOND : durationSeconds;
  const latestStart =
    isFixedWindow && limit
      ? Math.max(0, (durationMs - limit.durationMs) / A_SECOND)
      : Math.max(0, durationSeconds - minTrimSeconds);
  const [start, setStart] = useState(initialRange?.start ?? 0);
  const [end, setEnd] = useState(initialRange?.end ?? durationSeconds);
  // INFO: The end handle follows a duration that only resolved at `loadedmetadata`; before that it is sitting on the placeholder and would cut the clip to it.
  const resolvedFreeEnd = isMeasured ? Math.min(end, start + ceilingSeconds) : durationSeconds;
  // INFO: The fixed window follows its start; a free or ceiling-bound range is whatever the two handles say.
  const resolvedEnd = isFixedWindow
    ? Math.min(start + windowSeconds, durationSeconds)
    : resolvedFreeEnd;

  // WARN: Created and revoked inside one effect, never from a `useState` initializer — `MediaEditor` carries the argument: StrictMode's setup → cleanup → setup would revoke a URL that state kept, leaving the element on a dead blob.
  useEffect(() => {
    const url = URL.createObjectURL(draft.file);

    // eslint-disable-next-line react-hooks/set-state-in-effect -- The object URL is external state; minting it and handing it to React is this effect's whole purpose.
    setSourceUrl(url);

    // WARN: Detached before the revoke, and not left to GC — iOS keeps a removed element's decoder buffers until the next collection, which § 13.4.2.'s crop step reached the memory limit waiting for.
    return () => {
      releaseSource(videoRef.current);
      URL.revokeObjectURL(url);
    };
  }, [draft.file]);

  return (
    <ShellOverlay>
      <div
        className={cn(
          "pointer-events-auto absolute inset-0 z-50 flex flex-col bg-scrim",
          className,
        )}
      >
        <div className="relative flex items-center justify-between p-sm pt-[max(var(--spacing-sm),env(safe-area-inset-top))]">
          <IconButton
            className="text-on-scrim hover:bg-on-scrim/15 hover:text-on-scrim"
            Icon={X}
            aria-label="자르기 취소"
            onClick={onCancel}
          />
          {/* WARN: Centred against the bar itself, not between its two sides — 완료 changes width while it works, and a title laid out between them slid across the header every time it did. */}
          <span className="pointer-events-none absolute left-1/2 max-w-[calc(100%-14rem)] -translate-x-1/2 truncate text-caption text-on-scrim">
            {isTrimming ? "자르는 중이에요" : toHeaderLabel(limit, windowSeconds)}
          </span>
          {/* WARN: `hasFailed` closes this as well as the preview. A draft that carried its own duration leaves `isMeasured` true, so without it the screen says the clip is unplayable while the button that cuts it stays live — and `trimVideo` decodes through `mediabunny` rather than the element, so it answers with a second, different reason. */}
          {/* INFO: The wait moves to the title where the control is a glyph, exactly as `VideoCropper` reports its re-encode. */}
          {hasNextStep ? (
            <IconButton
              className="text-on-scrim hover:bg-on-scrim/15 hover:text-on-scrim"
              Icon={ArrowRight}
              disabled={isTrimming || !isMeasured || hasFailed}
              aria-label="다음"
              onClick={() => void submit()}
            />
          ) : (
            <Button
              className="w-auto"
              buttonClassName="h-9 min-h-9 w-auto px-sm"
              disabled={isTrimming || !isMeasured || hasFailed}
              haptic
              onClick={() => void submit()}
            >
              {isTrimming ? "자르는 중" : "완료"}
            </Button>
          )}
        </div>
        <div className="flex min-h-0 flex-1 items-center justify-center px-md">
          {/* INFO: The one failure the user can act on, named rather than drawn — `PreloadVideo`'s glyph says a load ended and this says the pick is unusable, which is what 취소 is the answer to. The § 7.10. viewer carries the same sentence. */}
          {sourceUrl && hasFailed && (
            <p className="text-center text-body-md text-on-scrim">
              이 기기에서는 재생할 수 없는 형식이에요
            </p>
          )}
          {/* INFO: `playsInline` so the preview plays in place on iOS instead of the element demanding fullscreen. */}
          {/* WARN: Not `muted` — § 13.4.1.'s emoticon keeps the clip's sound, so the range has to be auditioned with it. Playback only ever starts from ▶, which is the gesture WebKit grants unmuted audio to. */}
          {/* INFO: The poster stands in until the first frame decodes — an unwrapped element paints black for the length of the load, which over a `scrim` backdrop reads as nothing having opened. */}
          {/* WARN: The box is reserved from the draft, and the overlay is `bg-scrim` — an unsized frame renders the skeleton and the failure glyph at 0×0, so a clip that never decodes was a black screen with nothing on it at all. */}
          {/* WARN: Mounted only once the object URL exists. An element that loads its source after mount is never re-judged for playback and its seeks before that point are dropped, so it would sit on a frame the handles do not agree with. */}
          {sourceUrl && !hasFailed && (
            <PreloadVideo
              ref={videoRef}
              className="max-h-full w-full"
              videoClassName="size-full object-contain"
              placeholderClassName="rounded-md"
              style={{ aspectRatio: toAspectRatio(draft.width, draft.height) }}
              src={sourceUrl}
              poster={draft.previewUrl ?? undefined}
              playsInline
              preload="metadata"
              onLoadedMetadata={handleMetadata}
              onTimeUpdate={handleTimeUpdate}
              onPause={() => setIsPlaying(false)}
              onPlay={() => setIsPlaying(true)}
              onError={handleError}
            />
          )}
        </div>
        <div className="space-y-xs p-md pb-[max(var(--spacing-md),env(safe-area-inset-bottom))]">
          {/* INFO: One track for the whole span rather than a range input per end — a native range carries exactly one thumb, which is what used to make this two stacked controls under a label each. */}
          {/* INFO: No filmstrip. Decoding a strip of thumbnails is a second pass over the file for an affordance the thumbs already give, and the preview above already shows the frame under the one being dragged. */}
          <Slider
            trackClassName="bg-on-scrim/25"
            thumbClassName="focus-visible:ring-offset-scrim"
            min={0}
            max={isFixedWindow ? latestStart : durationSeconds}
            step={SCRUB_STEP}
            minStepsBetweenThumbs={MIN_TRIM_DURATION / A_SECOND / SCRUB_STEP}
            value={isFixedWindow ? [start] : [start, resolvedEnd]}
            disabled={isTrimming || hasFailed || (isFixedWindow && latestStart <= 0)}
            thumbLabels={isFixedWindow ? ["시작 지점"] : ["시작", "끝"]}
            onValueChange={handleScrub}
          />
          {/* INFO: The range is auditioned rather than only scrubbed — the cut is a length and a sound, and neither of those is a frame. */}
          <div className="flex items-center justify-center gap-2xs">
            <IconButton
              className="text-on-scrim hover:bg-on-scrim/15 hover:text-on-scrim"
              buttonClassName="size-9 min-h-9"
              Icon={isPlaying ? Pause : Play}
              disabled={isTrimming || !isMeasured || hasFailed}
              aria-label={isPlaying ? "미리보기 멈추기" : "고른 구간 들어보기"}
              onClick={togglePlayback}
            />
            <p className="text-caption text-on-scrim/80">
              {`${formatSeconds(start)} ~ ${formatSeconds(resolvedEnd)} · ${formatSeconds(resolvedEnd - start)}`}
            </p>
          </div>
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
  /**
   * WARN: Only a container this engine cannot play, never every `error`. A load
   * iOS aborted under memory pressure reports `MEDIA_ERR_ABORTED`, and treating
   * that as an unsupported format tells the user a decodable clip is unusable with
   * no way back — the sentence has no retry and `hasFailed` has no reset.
   */
  function handleError(event: SyntheticEvent<HTMLVideoElement>) {
    const code = event.currentTarget.error?.code;

    if (code === MediaError.MEDIA_ERR_DECODE || code === MediaError.MEDIA_ERR_SRC_NOT_SUPPORTED) {
      setHasFailed(true);
    }
  }

  function handleMetadata(event: SyntheticEvent<HTMLVideoElement>) {
    const video = event.currentTarget;

    if (Number.isFinite(video.duration) && video.duration > 0) {
      const resolved = Math.round(video.duration * A_SECOND);

      setMeasuredMs(resolved);
      // WARN: A restored range is a measurement of its own — it was chosen against a duration this element is only now reporting, so the end handle must not be pushed back out to it.
      setEnd((current) => (isMeasured || initialRange ? current : resolved / A_SECOND));
    }

    video.currentTime = start;
  }

  // INFO: The preview seeks with whichever thumb moved, so the frame on screen is the cut the user is aiming.
  function handleScrub([nextStart, nextEnd]: number[]) {
    if (nextEnd === undefined || nextStart !== start) {
      setStart(nextStart);
      // WARN: The end is pushed rather than clamped on submit — left behind the start the range inverts, and left further than the ceiling it is a clip past the cap.
      setEnd((current) =>
        Math.min(
          durationSeconds,
          nextStart + ceilingSeconds,
          Math.max(nextEnd ?? current, nextStart + minTrimSeconds),
        ),
      );
      seek(nextStart);

      return;
    }

    setEnd(nextEnd);
    // WARN: Clamped at zero. Dragging the end to the very start would otherwise push this negative, handing `mediabunny` a range that begins before the file does.
    setStart((current) =>
      Math.max(0, nextEnd - ceilingSeconds, Math.min(current, nextEnd - minTrimSeconds)),
    );
    seek(nextEnd);
  }

  function seek(seconds: number) {
    if (videoRef.current) {
      // INFO: A thumb under the finger is choosing a frame, so the audition stops rather than playing on from wherever the drag left the head.
      videoRef.current.pause();
      videoRef.current.currentTime = seconds;
    }
  }

  // WARN: Loops back to the start instead of running past `resolvedEnd` — the element knows the whole clip, and only these two handles say which part of it the emoticon is.
  function handleTimeUpdate(event: SyntheticEvent<HTMLVideoElement>) {
    const video = event.currentTarget;

    if (!video.paused && video.currentTime >= resolvedEnd) {
      video.currentTime = start;
    }
  }

  function togglePlayback() {
    const video = videoRef.current;

    if (!video) {
      return;
    }

    if (!video.paused) {
      video.pause();

      return;
    }

    if (video.currentTime < start || video.currentTime >= resolvedEnd) {
      video.currentTime = start;
    }

    // INFO: A refusal is the engine declining the gesture, and the button is already back to ▶ through `onPause` — there is nothing further to say about it.
    void video.play().catch(() => setIsPlaying(false));
  }

  async function submit() {
    setIsTrimming(true);

    try {
      const range: TrimRange = { start, end: resolvedEnd };

      onDone(await trimVideo(draft.file, range, { keepsAudio }), range);
    } catch (error) {
      // INFO: The one failure the user can act on is a codec this browser cannot decode; everything else here is a bug. Both read the same from the outside, so the copy names neither.
      // WARN: Logged, because the toast is all a user can report — mediabunny 1.52.3's Safari `isConfigSupported` throw was invisible for exactly as long as this swallowed it.
      console.error("[trim] the cut failed", error);
      toast.error("영상을 자르지 못했어요");
    } finally {
      setIsTrimming(false);
    }
  }
}

// WARN: Falls back rather than emitting `0 / 0`, which collapses the box back to the nothing this reserves it against — a draft carries zeroes for a container `toVideoDraft` could not measure.
function toAspectRatio(width: number, height: number): string {
  return width > 0 && height > 0 ? `${width} / ${height}` : "16 / 9";
}

function toHeaderLabel(limit: Optional<TrimLimit>, windowSeconds: number): string {
  if (!limit) {
    return "영상 자르기";
  }

  return limit.kind === "window"
    ? `${Math.round(windowSeconds)}초만 쓸 수 있어요`
    : `최대 ${Math.round(limit.durationMs / A_SECOND)}초까지 쓸 수 있어요`;
}

function formatSeconds(value: number): string {
  const total = Math.round(value);

  return `${Math.floor(total / 60)}:${String(total % 60).padStart(2, "0")}`;
}
