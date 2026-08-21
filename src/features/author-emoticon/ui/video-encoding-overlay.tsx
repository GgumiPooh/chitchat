"use client";

import { cn, type Nullable } from "@/shared/lib";
import { Button, ShellOverlay } from "@/shared/ui";

/**
 * What the wait is on. A number is ffmpeg's own progress; the two words either side
 * of it are phases that report nothing at all — fetching the ~32MB encoder before,
 * and lifting the still out of the finished animation after.
 */
export type EncodeProgress = "preparing" | "finishing" | number;

export type VideoEncodingOverlayProps = {
  className?: string;
  progress: EncodeProgress;
  onCancel: () => void;
};

/**
 * REQUIREMENTS.md § 13.4.1. The wait between 완료 on the crop and the authoring
 * sheet — a whole-clip re-encode on a single-threaded wasm core, which is long
 * enough that a spinner would say nothing.
 *
 * WARN: `absolute`, never `fixed` — `ShellOverlay` owns the viewport-sized box this
 * fills (DESIGN.md § 3.3.), exactly as `VideoTrimmer` does.
 */
export function VideoEncodingOverlay({ className, progress, onCancel }: VideoEncodingOverlayProps) {
  const percent = typeof progress === "number" ? Math.round(progress * 100) : null;

  return (
    <ShellOverlay>
      <div
        className={cn(
          "pointer-events-auto absolute inset-0 z-50 flex flex-col items-center justify-center gap-sm bg-scrim px-md",
          className,
        )}
      >
        <p className="text-body-md text-on-scrim">이모티콘으로 만들고 있어요</p>
        {/* WARN: Indeterminate outside the encode, never a number. Only ffmpeg reports anything, so a percentage held across the phases either side of it stalls and then jumps — which is what it did. */}
        <div className="h-1 w-full max-w-64 overflow-hidden rounded-full bg-on-scrim/25">
          <div
            className={cn(
              "h-full bg-primary",
              percent === null ? "w-full animate-pulse" : "transition-[width] duration-200",
            )}
            style={percent === null ? undefined : { width: `${percent}%` }}
          />
        </div>
        <p className="text-caption text-on-scrim/80">{toProgressLabel(progress, percent)}</p>
        <Button
          className="w-auto"
          buttonClassName="h-9 min-h-9 w-auto px-sm"
          variant="secondary"
          haptic
          onClick={onCancel}
        >
          취소
        </Button>
      </div>
    </ShellOverlay>
  );
}

function toProgressLabel(progress: EncodeProgress, percent: Nullable<number>): string {
  if (percent !== null) {
    return `${percent}%`;
  }

  return progress === "preparing" ? "준비하는 중이에요" : "마무리하는 중이에요";
}
