"use client";

import type { MediaDraft } from "@/entities/media";
import { BACKGROUND_MAX_EDGE } from "@/shared/config";
import { cn, type Nullable } from "@/shared/lib";
import { Button, IconButton, ShellOverlay, toast } from "@/shared/ui";
import { X } from "lucide-react";
import { useEffect, useState } from "react";
import { Cropper, type CropperRef } from "react-advanced-cropper";
import "react-advanced-cropper/dist/style.css";
import type { CropArea } from "../model/apply-edit";
import { loadImage } from "../model/canvas";
import { cropVideo, toEvenCrop } from "../model/crop-video";

export type VideoCropperProps = {
  className?: string;
  draft: MediaDraft;
  /** The long edge the crop is re-encoded at — a background's own by default, `EMOTICON_MAX_EDGE` for § 13.4.1. */
  maxEdge?: number;
  onCancel: () => void;
  /** Given the cropped file, for the caller to re-read into a draft of its own. */
  onDone: (file: File) => void;
};

/**
 * REQUIREMENTS.md § 12.1. Frames a video the way `MediaEditor` frames a photo — the
 * profile cover, and § 13.4.1.'s emoticon.
 *
 * INFO: The stencil is drawn over the draft's **poster**, not over the element. A
 * `<video>` is not something `react-advanced-cropper` can measure, and the poster is
 * the same picture at the same aspect ratio — so the rectangle is chosen on a still
 * and reported back in the clip's own pixels.
 *
 * INFO: Free-form, with no ratio chips: a background is drawn `object-cover` at two
 * geometries (§ 12.2.) and an emoticon is drawn at its own, so a fixed ratio would
 * crop either of them twice.
 *
 * WARN: `absolute`, never `fixed` — `ShellOverlay` owns the viewport-sized box this
 * fills (DESIGN.md § 3.3.), exactly as `MediaEditor` does.
 */
export function VideoCropper({
  className,
  draft,
  maxEdge = BACKGROUND_MAX_EDGE,
  onCancel,
  onDone,
}: VideoCropperProps) {
  const [croppedArea, setCroppedArea] = useState<Nullable<CropArea>>(null);
  const [isCropping, setIsCropping] = useState(false);
  const posterUrl = draft.previewUrl;
  // INFO: The poster's own pixel size, which is what the stencil reports against — the thumbnail is a scaled copy of the frame, so the rectangle has to be carried back across that scale.
  const [posterWidth, setPosterWidth] = useState(0);

  useEffect(() => {
    if (!posterUrl) {
      return;
    }

    let isCurrent = true;

    void loadImage(posterUrl).then((image) => {
      if (isCurrent) {
        setPosterWidth(image.naturalWidth);
      }
    });

    return () => {
      isCurrent = false;
    };
  }, [posterUrl]);

  return (
    <ShellOverlay>
      <div
        className={cn(
          "pointer-events-auto absolute inset-0 z-50 flex flex-col bg-scrim",
          className,
        )}
      >
        <div className="flex items-center justify-between p-sm pt-[max(var(--spacing-sm),env(safe-area-inset-top))]">
          <IconButton
            className="text-on-scrim hover:bg-on-scrim/15 hover:text-on-scrim"
            Icon={X}
            aria-label="자르기 취소"
            onClick={onCancel}
          />
          {/* INFO: The wait is named up front because a spatial crop re-encodes every frame, where the § 12.1. trimmer usually only re-muxes — the same clip takes far longer here. */}
          <span className="text-caption text-on-scrim">
            {isCropping ? "다시 인코딩하고 있어요" : "영상 자르기"}
          </span>
          <Button
            className="w-auto"
            buttonClassName="h-9 min-h-9 w-auto px-sm"
            disabled={isCropping || posterWidth === 0}
            haptic
            onClick={() => void save()}
          >
            {isCropping ? "자르는 중" : "완료"}
          </Button>
        </div>
        <div className="relative min-h-0 flex-1">
          {posterUrl && (
            <Cropper
              className="size-full"
              src={posterUrl}
              stencilProps={{ grid: true }}
              onChange={handleChange}
            />
          )}
        </div>
      </div>
    </ShellOverlay>
  );

  function handleChange(cropper: CropperRef) {
    const coordinates = cropper.getCoordinates();

    if (coordinates) {
      setCroppedArea({
        x: coordinates.left,
        y: coordinates.top,
        width: coordinates.width,
        height: coordinates.height,
      });
    }
  }

  async function save() {
    if (!croppedArea || posterWidth === 0) {
      return;
    }

    setIsCropping(true);

    try {
      const scale = draft.width / posterWidth;
      const file = await cropVideo(
        draft.file,
        toEvenCrop({
          left: croppedArea.x * scale,
          top: croppedArea.y * scale,
          width: croppedArea.width * scale,
          height: croppedArea.height * scale,
        }),
        maxEdge,
      );

      onDone(file);
    } catch {
      // INFO: `VideoTrimmer`'s reason — the one failure a user can act on is a codec this browser cannot decode, and everything else here reads the same from outside.
      toast.error("영상을 자르지 못했어요");
    } finally {
      setIsCropping(false);
    }
  }
}
