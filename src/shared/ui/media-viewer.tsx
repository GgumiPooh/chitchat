"use client";

import { cn } from "@/shared/lib";
import { Download, Trash2, X } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { IconButton } from "./icon-button";
import type { MediaCell } from "./media-cell";
import { PreloadImage } from "./preload-image";
import { ShellOverlay } from "./shell-overlay";

export type MediaViewerProps = {
  className?: string;
  cells: MediaCell[];
  initialIndex: number;
  onClose: () => void;
  /** Omitted when the viewer's attachments are not the current user's to remove. */
  onDelete?: () => void;
};

/**
 * DESIGN.md § 7.10. Full-bleed on `scrim`, no chrome but a close control and the
 * position counter.
 *
 * WARN: `absolute`, never `fixed` — AGENTS.md § 4.4. keeps the app shell as the
 * app's one fixed element. `ShellOverlay` is what makes the shell, rather than the
 * chat room, the box this fills: staying inside the scroller leaves it under the
 * header and the tab bar.
 *
 * TODO: Pinch zoom is REQUIREMENTS.md § 18. #6, still undecided and meant to be
 * tuned on a real device. Swiping between attachments is native scroll snapping,
 * which needs no gesture parameters at all.
 */
export function MediaViewer({
  className,
  cells,
  initialIndex,
  onClose,
  onDelete,
}: MediaViewerProps) {
  const trackRef = useRef<HTMLDivElement>(null);
  const [index, setIndex] = useState(initialIndex);
  const downloadUrl = cells[index]?.downloadUrl;

  useEffect(() => {
    const track = trackRef.current;

    track?.scrollTo({ left: track.clientWidth * initialIndex });
  }, [initialIndex]);

  return (
    <ShellOverlay>
      <div className={cn("absolute inset-0 z-40 flex flex-col bg-scrim/90", className)}>
        <div className="flex items-center justify-between p-sm pt-[max(var(--spacing-sm),env(safe-area-inset-top))]">
          <IconButton
            className="text-on-primary hover:bg-canvas/15 hover:text-on-primary"
            Icon={X}
            aria-label="닫기"
            onClick={onClose}
          />
          {cells.length > 1 && (
            <span className="text-caption text-on-primary">{`${index + 1} / ${cells.length}`}</span>
          )}
          <div className="flex items-center">
            {onDelete && (
              // INFO: DESIGN.md § 3.2. The only route to deleting one's own attachment — the bubble's hold is left to the OS so it can offer 사진에 저장.
              <IconButton
                className="text-semantic-error hover:bg-canvas/15 hover:text-semantic-error-hover"
                Icon={Trash2}
                aria-label="삭제"
                onClick={onDelete}
              />
            )}
            {/* WARN: No `download` attribute — the route 302s to R2 and the spec drops it once the navigation resolves cross-origin. `toMediaDownloadUrl` signs the disposition into the object instead. */}
            <a
              className={cn(
                "inline-flex size-11 items-center justify-center rounded-full text-on-primary transition-colors outline-none hover:bg-canvas/15 focus-visible:ring-2 focus-visible:ring-primary",
                !downloadUrl && "invisible",
              )}
              href={downloadUrl ?? undefined}
              aria-label="원본 저장"
            >
              <Download className="size-5" strokeWidth={1.75} />
            </a>
          </div>
        </div>
        {/* INFO: Native scroll snapping is the horizontal swipe of REQUIREMENTS.md § 8.1. — it costs no gesture code and matches the platform's own momentum. */}
        <div
          ref={trackRef}
          className="scrollbar-hidden flex min-h-0 flex-1 snap-x snap-mandatory overflow-x-auto overscroll-x-contain"
          onScroll={handleScroll}
        >
          {cells.map((cell, slideIndex) => (
            <div
              key={cell.id}
              // INFO: Vertical padding only. A side gutter reads as a frame around the photo, and the viewer's whole point is that the image is the screen.
              className="flex w-full shrink-0 snap-center items-center justify-center py-md"
            >
              {/* WARN: REQUIREMENTS.md § 10. Only the neighbours load their asset. Every slide used to request its original on mount, which was bounded by `MAX_MEDIA_PER_MESSAGE` in a chat bubble but is the whole loaded gallery here — opening one photo after three pages of scrolling started 180 requests for objects of up to `MAX_IMAGE_SIZE`. */}
              {Math.abs(slideIndex - index) > 1 ? (
                <SlidePlaceholder cell={cell} />
              ) : cell.isVideo ? (
                <VideoSlide cell={cell} />
              ) : (
                <ImageSlide cell={cell} />
              )}
            </div>
          ))}
        </div>
      </div>
    </ShellOverlay>
  );

  function handleScroll() {
    const track = trackRef.current;

    if (track) {
      setIndex(Math.round(track.scrollLeft / track.clientWidth));
    }
  }
}

/**
 * INFO: The box a slide occupies before it is close enough to load, at the stored
 * ratio — so scroll snapping resolves against the same geometry the real asset
 * will take and the track does not resize as slides come and go.
 */
function SlidePlaceholder({ cell }: { cell: MediaCell }) {
  return (
    <div
      className="max-h-full w-full rounded-md bg-canvas/10"
      style={{ aspectRatio: `${cell.width} / ${cell.height}` }}
    />
  );
}

function ImageSlide({ cell }: { cell: MediaCell }) {
  return (
    // INFO: The stored ratio gives the skeleton a box to fill while the original downloads — the grid tile the user tapped came from a thumbnail, so this request starts cold.
    <PreloadImage
      className="max-h-full w-full"
      imgClassName="size-full object-contain"
      placeholderClassName="rounded-md"
      style={{ aspectRatio: `${cell.width} / ${cell.height}` }}
      src={cell.originalUrl ?? cell.previewUrl}
      alt=""
    />
  );
}

/**
 * WARN: REQUIREMENTS.md § 9. Videos are stored exactly as the phone produced them,
 * so a desktop browser without an HEVC decoder legitimately cannot play one. The
 * element reports that as an `error`, and the download link is the fallback rather
 * than a blank black rectangle.
 */
function VideoSlide({ cell }: { cell: MediaCell }) {
  const [hasFailed, setHasFailed] = useState(false);

  if (hasFailed) {
    return (
      <div className="flex flex-col items-center gap-sm text-center">
        <p className="text-body-md text-on-primary">이 기기에서는 재생할 수 없는 형식이에요</p>
        <a
          className="inline-flex min-h-11 items-center gap-xs rounded-md bg-canvas px-md text-button-md text-ink transition-colors hover:bg-surface-soft"
          href={cell.downloadUrl ?? undefined}
        >
          <Download className="size-4" strokeWidth={1.75} />
          원본 저장
        </a>
      </div>
    );
  }

  return (
    <video
      className="max-h-full max-w-full"
      src={cell.originalUrl ?? undefined}
      poster={cell.previewUrl}
      controls
      playsInline
      preload="metadata"
      onError={() => setHasFailed(true)}
    />
  );
}
