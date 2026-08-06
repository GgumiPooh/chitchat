"use client";

import type { MediaDraft } from "@/entities/media";
import { A_SECOND, cn, type Nullable } from "@/shared/lib";
import { Button, IconButton, ShellOverlay, toast } from "@/shared/ui";
import { X } from "lucide-react";
import { useEffect, useRef, useState, type ChangeEvent } from "react";
import { toDefaultTrimRange, trimVideo, type TrimRange } from "../model/trim-video";

export type VideoTrimmerProps = {
  className?: string;
  draft: MediaDraft;
  /** REQUIREMENTS.md § 12.1. The window the result must fit inside, in milliseconds. */
  maxDurationMs: number;
  onCancel: () => void;
  /** Given the trimmed file, for the caller to re-read into a draft of its own. */
  onDone: (file: File) => void;
};

/**
 * REQUIREMENTS.md § 12.1. Picks the `maxDurationMs` window a background video is
 * cut down to, over the app shell.
 *
 * WARN: `absolute`, never `fixed` — AGENTS.md § 4.4. keeps the app shell as the one
 * fixed element. `ShellOverlay` is what makes the shell the box this fills, exactly
 * as `MediaEditor` does.
 *
 * INFO: One handle, not two. The window is a fixed `maxDurationMs` wide, so the
 * user is choosing **where** it sits rather than how long it is — a second handle
 * would offer a length that is already decided.
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
  const durationMs = draft.durationMs ?? maxDurationMs;
  const windowSeconds = Math.min(durationMs, maxDurationMs) / A_SECOND;
  const latestStart = Math.max(0, (durationMs - maxDurationMs) / A_SECOND);
  const [start, setStart] = useState(() => toDefaultTrimRange(durationMs, maxDurationMs).start);

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
            {`${Math.round(windowSeconds)}초만 쓸 수 있어요`}
          </span>
          <Button
            className="w-auto"
            buttonClassName="h-9 min-h-9 w-auto px-sm"
            disabled={isTrimming}
            haptic
            onClick={() => void submit()}
          >
            {isTrimming ? "자르는 중" : "완료"}
          </Button>
        </div>
        <div className="flex min-h-0 flex-1 items-center justify-center px-md">
          {/* INFO: `muted` and `playsInline` so scrubbing previews on iOS without the element demanding fullscreen; there is no audio in the result either way. */}
          <video
            ref={videoRef}
            className="max-h-full max-w-full"
            src={sourceUrl || undefined}
            muted
            playsInline
            preload="metadata"
          />
        </div>
        <div className="space-y-xs p-md pb-[max(var(--spacing-md),env(safe-area-inset-bottom))]">
          <label className="block text-body-sm text-on-primary" htmlFor="trim-start">
            시작 지점
          </label>
          {/* INFO: A range input rather than a filmstrip. Decoding a strip of thumbnails is a second pass over the file for an affordance one handle already gives, and the preview beside it already shows the frame. */}
          <input
            className="w-full accent-primary"
            type="range"
            min={0}
            max={latestStart}
            step={0.1}
            value={start}
            disabled={isTrimming || latestStart === 0}
            id="trim-start"
            onChange={handleScrub}
          />
          <p className="text-center text-caption text-on-primary/80">
            {`${formatSeconds(start)} ~ ${formatSeconds(start + windowSeconds)}`}
          </p>
        </div>
      </div>
    </ShellOverlay>
  );

  // INFO: The preview seeks with the handle, so the frame under it is the one the cut starts on.
  function handleScrub(event: ChangeEvent<HTMLInputElement>) {
    const next = Number(event.target.value);

    setStart(next);

    if (videoRef.current) {
      videoRef.current.currentTime = next;
    }
  }

  async function submit() {
    setIsTrimming(true);

    try {
      const range: TrimRange = { start, end: start + windowSeconds };

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
