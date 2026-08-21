"use client";

import type { MediaDraft } from "@/entities/media";
import { BACKGROUND_MAX_EDGE } from "@/shared/config";
import { cn, type Nullable } from "@/shared/lib";
import { Button, IconButton, ShellOverlay, toast } from "@/shared/ui";
import { ArrowLeft, Volume2, VolumeX, X } from "lucide-react";
import { useEffect, useRef, useState, type CSSProperties, type Ref } from "react";
import {
  Cropper,
  CropperBackgroundImage,
  getBackgroundStyle,
  type CropperRef,
} from "react-advanced-cropper";
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
  /** REQUIREMENTS.md § 13.4.1. Where this screen follows another one, 취소 becomes ← and the flow steps back instead of ending — the trimmer it came from still has 취소. */
  onBack?: () => void;
  /** Given the cropped file, for the caller to re-read into a draft of its own. */
  onDone: (file: File) => void;
};

/**
 * REQUIREMENTS.md § 12.1. Frames a video the way `MediaEditor` frames a photo — the
 * profile cover, and § 13.4.1.'s emoticon.
 *
 * INFO: The stencil is measured against the draft's **poster**, not against the
 * element. A `<video>` is not something `react-advanced-cropper` can measure, and the
 * poster is the same picture at the same aspect ratio — so the rectangle is chosen on
 * a still and reported back in the clip's own pixels. The clip itself plays over that
 * still through `backgroundComponent`, so what is being framed is the animation.
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
  onBack,
  onDone,
}: VideoCropperProps) {
  const [croppedArea, setCroppedArea] = useState<Nullable<CropArea>>(null);
  const [isCropping, setIsCropping] = useState(false);
  const [sourceUrl, setSourceUrl] = useState("");
  // INFO: Sound on, since the clip is being framed to be heard — `startPlayback` puts this back where the engine refuses that.
  const [isMuted, setIsMuted] = useState(false);
  const videoRef = useRef<Nullable<HTMLVideoElement>>(null);
  const hasStartedRef = useRef(false);
  const posterUrl = draft.previewUrl;
  // INFO: The poster's own pixel size, which is what the stencil reports against — the thumbnail is a scaled copy of the frame, so the rectangle has to be carried back across that scale.
  const [posterWidth, setPosterWidth] = useState(0);

  // WARN: Created and revoked inside one effect, never from a `useState` initializer — `VideoTrimmer` carries the argument.
  useEffect(() => {
    const url = URL.createObjectURL(draft.file);

    // eslint-disable-next-line react-hooks/set-state-in-effect -- The object URL is external state; minting it and handing it to React is this effect's whole purpose.
    setSourceUrl(url);

    return () => URL.revokeObjectURL(url);
  }, [draft.file]);

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
        <div className="relative flex items-center justify-between p-sm pt-[max(var(--spacing-sm),env(safe-area-inset-top))]">
          <IconButton
            className="text-on-scrim hover:bg-on-scrim/15 hover:text-on-scrim"
            Icon={onBack ? ArrowLeft : X}
            disabled={isCropping}
            aria-label={onBack ? "영상 자르기로 돌아가기" : "자르기 취소"}
            onClick={onBack ?? onCancel}
          />
          {/* INFO: The wait is named up front because a spatial crop re-encodes every frame, where the § 12.1. trimmer usually only re-muxes — the same clip takes far longer here. */}
          {/* INFO: 영역, not 영상 — `VideoTrimmer` is the screen that cuts the clip itself, and both were reached one after the other under the same title. */}
          {/* WARN: Centred against the bar itself, not between its two sides — 완료 changes width while it works, and a title laid out between them slid across the header every time it did. */}
          <span className="pointer-events-none absolute left-1/2 max-w-[calc(100%-14rem)] -translate-x-1/2 truncate text-caption text-on-scrim">
            {isCropping ? "다시 인코딩하고 있어요" : "영역 자르기"}
          </span>
          <div className="flex items-center gap-2xs">
            {/* INFO: In the bar rather than over the frame — the clip loops for as long as the screen is open, so its sound is a setting of the screen rather than a control on the picture. */}
            <IconButton
              className="text-on-scrim hover:bg-on-scrim/15 hover:text-on-scrim"
              Icon={isMuted ? VolumeX : Volume2}
              aria-label={isMuted ? "소리 켜기" : "소리 끄기"}
              onClick={toggleSound}
            />
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
        </div>
        <div className="relative min-h-0 flex-1">
          {posterUrl && (
            <Cropper
              className="size-full"
              src={posterUrl}
              stencilProps={{ grid: true }}
              backgroundComponent={CropperVideoBackground}
              backgroundProps={{ src: sourceUrl, videoRef, isMuted, onCanPlay: startPlayback }}
              onChange={handleChange}
            />
          )}
        </div>
      </div>
    </ShellOverlay>
  );

  /**
   * WARN: Not the `autoplay` attribute. Unmuted playback needs a gesture this screen
   * was reached by but no longer holds — a whole trim ran in between — so it is tried
   * out loud and falls back to muted, which every engine allows, rather than sitting
   * on a frame with nothing saying why.
   *
   * INFO: `canplay` fires again after every seek, and this only ever runs once.
   */
  async function startPlayback(video: HTMLVideoElement) {
    if (hasStartedRef.current) {
      return;
    }

    hasStartedRef.current = true;

    try {
      await video.play();
    } catch {
      video.muted = true;
      setIsMuted(true);
      void video.play().catch(() => undefined);
    }
  }

  // WARN: Set on the element, not only through the prop — `muted` is a property React re-renders do not reliably write, and the attribute only ever decides the initial state.
  // WARN: Inside the tap, because WebKit pauses a video that is unmuted outside a gesture.
  function toggleSound() {
    const video = videoRef.current;

    if (!video) {
      return;
    }

    video.muted = !video.muted;
    setIsMuted(video.muted);

    if (video.paused) {
      void video.play().catch(() => undefined);
    }
  }

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

type CropperVideoBackgroundProps = {
  ref?: Ref<HTMLImageElement>;
  className?: string;
  /** The cropper's own handle, which is what carries the image box and the transform the stencil is measured in. */
  cropper: Pick<CropperRef, "getState" | "getTransitions" | "getImage">;
  src: string;
  isMuted: boolean;
  videoRef: Ref<Nullable<HTMLVideoElement>>;
  onCanPlay: (video: HTMLVideoElement) => void;
};

/**
 * The clip itself, drawn under the stencil at exactly the transform
 * `CropperBackgroundImage` gives the poster (REQUIREMENTS.md § 13.4.1.).
 *
 * INFO: The poster stays mounted beneath it and keeps the cropper's own `ref`, so a
 * clip this engine will not play leaves the frame it was measured on rather than a
 * black rectangle.
 *
 * WARN: `object-fit: fill`. The box comes from the poster's ratio and the clip's is
 * the same one — but the two round apart by a pixel, which `contain` would answer
 * with a letterbox the stencil does not know about.
 */
function CropperVideoBackground({
  ref,
  className,
  cropper,
  src,
  isMuted,
  videoRef,
  onCanPlay,
}: CropperVideoBackgroundProps) {
  const state = cropper.getState();
  const image = cropper.getImage();
  const style: CSSProperties =
    image && state ? getBackgroundStyle(image, state, cropper.getTransitions()) : {};

  return (
    <>
      <CropperBackgroundImage ref={ref} className={className} cropper={cropper} />
      {src && (
        <video
          ref={videoRef}
          className={cn("advanced-cropper-background-image", className)}
          style={{ ...style, objectFit: "fill" }}
          src={src}
          loop
          muted={isMuted}
          playsInline
          onCanPlay={(event) => onCanPlay(event.currentTarget)}
        />
      )}
    </>
  );
}
