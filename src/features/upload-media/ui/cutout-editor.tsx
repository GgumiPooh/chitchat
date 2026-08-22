"use client";

import type { MediaDraft } from "@/entities/media";
import { cn, type Nullable } from "@/shared/lib";
import { Button, IconButton, ShellOverlay, Switch, toast } from "@/shared/ui";
import { ArrowLeft, X } from "lucide-react";
import { useEffect, useRef, useState, type CSSProperties } from "react";
import { applyCutout, type CutoutModel, type CutoutProgress } from "../model/apply-cutout";

// INFO: DESIGN.md § 5.3. `on-scrim` rather than a surface token — the squares sit on `bg-scrim`, which is the one surface that does not follow the theme, so a theme-following checker would go invisible on one of them.
// WARN: An inline style, not a Tailwind arbitrary value. § 5.2. records what Tailwind does to a `var()` inside `color-mix` — it inlines the resolved light value as an `@supports` fallback, which is wrong under the other theme.
const CHECKER_STYLE: CSSProperties = {
  backgroundImage:
    "conic-gradient(var(--checker) 0deg 90deg, transparent 90deg 180deg, var(--checker) 180deg 270deg, transparent 270deg)",
  backgroundSize: "16px 16px",
  "--checker": "color-mix(in srgb, var(--color-on-scrim) 10%, transparent)",
} as CSSProperties;

export type CutoutEditorProps = {
  className?: string;
  draft: MediaDraft;
  /** REQUIREMENTS.md § 13.4.2. `video` mattes the draft's poster as a preview of what the encode will do to every frame. */
  model?: CutoutModel;
  /** REQUIREMENTS.md § 13.4.1. Where a screen precedes this one, 취소 becomes ← — the video flow's trimmer keeps the flow's only exit. */
  onBack?: () => void;
  onCancel: () => void;
  /** The cut-out draft, or `null` where the user left the switch off — nothing was produced for the caller to own. */
  onDone: (cutout: Nullable<MediaDraft>) => void;
};

/**
 * REQUIREMENTS.md § 13.4.2. The step between picking a picture and framing it: the
 * background comes off here, and the crop that follows is drawn against what is left.
 *
 * WARN: The matte is computed when the switch is turned on, **never on arrival**. It
 * was eager once: a picked image is ~2.5s of inference on a desktop and was measured
 * at **11.8s on an iPhone** (§ 13.4.2.), which every pick paid whether or not the user
 * wanted a cutout at all. The switch is therefore off until asked, and the first
 * answer is the one that costs — turning it back off afterwards is free, since both
 * pictures are then in hand.
 *
 * WARN: `absolute`, never `fixed` — `ShellOverlay` owns the viewport-sized box this
 * fills (DESIGN.md § 3.3.), exactly as `MediaEditor` does.
 */
export function CutoutEditor({
  className,
  draft,
  model = "still",
  onBack,
  onCancel,
  onDone,
}: CutoutEditorProps) {
  const [cutout, setCutout] = useState<Nullable<MediaDraft>>(null);
  const [isApplied, setIsApplied] = useState(false);
  const [progress, setProgress] = useState<Nullable<CutoutProgress>>(null);
  const [hasFailed, setHasFailed] = useState(false);
  // WARN: What the unmount cleanup revokes, and what 다음 clears before handing the draft on. State cannot serve here — the cleanup would close over the value from the render it was created in.
  const ownedRef = useRef<Nullable<MediaDraft>>(null);
  const isWorking = progress !== null;
  const shown = isApplied && cutout ? cutout : draft;

  // WARN: On unmount alone. Keyed on anything else it would revoke a live preview under StrictMode's setup → cleanup → setup, which is `use-video-emoticon`'s own argument one layer down.
  useEffect(
    () => () => {
      if (ownedRef.current?.previewUrl) {
        URL.revokeObjectURL(ownedRef.current.previewUrl);
      }
    },
    [],
  );

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
            Icon={onBack ? ArrowLeft : X}
            disabled={isWorking}
            aria-label={onBack ? "영상 자르기로 돌아가기" : "배경 지우기 취소"}
            onClick={onBack ?? onCancel}
          />
          {/* WARN: `VideoCropper`'s rule — centred against the bar itself, never between its two sides, since the right cluster changes width while it works. Its `max-w` is tighter here because that cluster carries a switch as well as a button. */}
          <span className="pointer-events-none absolute left-1/2 max-w-[calc(100%-18rem)] -translate-x-1/2 truncate text-caption text-on-scrim">
            {toStatusLabel(progress)}
          </span>
          <div className="flex items-center gap-2xs">
            {/* INFO: § 13.4.2. Beside 다음 rather than over the picture: what it decides is which of two pictures the next screen is handed, which is a property of the step rather than a control on the art. */}
            <label className="flex cursor-pointer items-center gap-2xs text-caption text-on-scrim">
              누끼
              <Switch
                trackClassName="h-6 w-10"
                thumbClassName="size-5 data-[state=checked]:translate-x-4"
                checked={isApplied}
                disabled={isWorking || hasFailed}
                haptic
                aria-label="배경 지우기"
                onCheckedChange={(next) => void toggle(next)}
              />
            </label>
            <Button
              className="w-auto"
              buttonClassName="h-9 min-h-9 w-auto px-sm"
              disabled={isWorking}
              haptic
              onClick={handleDone}
            >
              다음
            </Button>
          </div>
        </div>
        <div className="relative flex min-h-0 flex-1 items-center justify-center p-md">
          {shown.previewUrl && (
            <img
              className="max-h-full max-w-full object-contain"
              style={shown === cutout ? CHECKER_STYLE : undefined}
              src={shown.previewUrl}
              alt=""
            />
          )}
        </div>
        {isWorking && <ProgressBar progress={progress} />}
      </div>
    </ShellOverlay>
  );

  /**
   * INFO: The first 켜기 is what runs the model; every later toggle is free, since the
   * result is kept for as long as this screen is up.
   */
  async function toggle(next: boolean) {
    setIsApplied(next);

    if (!next || cutout) {
      return;
    }

    setProgress({ phase: "starting" });

    try {
      const result = await applyCutout(draft, model, setProgress);

      ownedRef.current = result;
      setCutout(result);
    } catch (error) {
      // WARN: The only surface this failure has — every cause is a backend refusing the model, and the sentence the user gets cannot carry the reason.
      console.error("[cutout] the background could not be removed", error);
      setHasFailed(true);
      setIsApplied(false);
      toast.error("배경을 지우지 못했어요");
    } finally {
      setProgress(null);
    }
  }

  /** INFO: Ownership moves with the draft — the unmount cleanup must not revoke a preview the sheet behind this is now showing. */
  function handleDone() {
    if (!isApplied || !cutout) {
      onDone(null);

      return;
    }

    ownedRef.current = null;
    onDone(cutout);
  }
}

type ProgressBarProps = {
  className?: string;
  progress: CutoutProgress;
};

/**
 * INFO: `VideoEncodingOverlay`'s bar and its rule: a number only where something
 * actually reports one. The download does, through `Content-Length`; the inference is
 * one opaque call, so it stays indeterminate rather than stalling at a percentage.
 */
function ProgressBar({ className, progress }: ProgressBarProps) {
  const percent =
    progress.phase === "fetching" ? Math.round((progress.loaded / progress.total) * 100) : null;

  return (
    <div
      className={cn(
        "flex flex-col items-center gap-2xs px-md pb-[max(var(--spacing-md),env(safe-area-inset-bottom))]",
        className,
      )}
    >
      <div className="h-1 w-full max-w-64 overflow-hidden rounded-full bg-on-scrim/25">
        <div
          className={cn(
            "h-full bg-primary",
            percent === null ? "w-full animate-pulse" : "transition-[width] duration-200",
          )}
          style={percent === null ? undefined : { width: `${percent}%` }}
        />
      </div>
      {percent !== null && <p className="text-caption text-on-scrim/80">{percent}%</p>}
    </div>
  );
}

function toStatusLabel(progress: Nullable<CutoutProgress>): string {
  if (!progress) {
    return "배경 지우기";
  }

  // INFO: The first run on a device fetches 96MB of weights, which is long enough that a screen saying only 지우는 중 reads as a hang.
  return progress.phase === "fetching" ? "준비하는 중이에요" : "배경을 지우는 중이에요";
}
