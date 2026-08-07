"use client";

import { cn, useIsIos } from "@/shared/lib";
import { Download, Share, Trash2, Wallpaper, X } from "lucide-react";
import { useEffect, useRef, useState, type MouseEvent } from "react";
import { IconButton } from "./icon-button";
import type { MediaCell } from "./media-cell";
import { PreloadImage } from "./preload-image";
import { ShellOverlay } from "./shell-overlay";

// INFO: What every overlay in `shared/ui` renders — `Modal` through Radix's `Dialog`, `BottomSheet` and `ActionSheet` through Vaul's `Drawer`.
const OPEN_DIALOG_SELECTOR = '[role="dialog"][data-state="open"]';

export type MediaViewerProps = {
  className?: string;
  cells: MediaCell[];
  initialIndex: number;
  onClose: () => void;
  /** Removes the message the attachments belong to, not the slide on screen. Omitted when they are not the current user's to remove. */
  onDelete?: () => void;
  /** REQUIREMENTS.md § 8.11. Hands the slide on screen to the OS share sheet. Given the media id, since the slide moves under the control. */
  onShare?: (mediaId: string) => void;
  /** REQUIREMENTS.md § 8.11. The 저장 route for the slide on screen. Used on iOS only, where the download beside it cannot reach the photo library. */
  onSave?: (mediaId: string) => void;
  /**
   * REQUIREMENTS.md § 12.1. Opens 배경으로 설정 for the slide on screen.
   *
   * INFO: Given the media id for `onShare`'s reason — the slide moves under the
   * control, so the id has to be read at the tap rather than captured at mount.
   */
  onSetBackground?: (mediaId: string) => void;
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
 *
 * WARN: REQUIREMENTS.md § 8.11. This is the one surface that suppresses none of the
 * OS's own hold gestures — a slide is the whole screen with nothing of the app's
 * competing for the hold, so it is where iOS's 사진에 저장 lives. Never add a
 * `LONG_PRESS_TARGET_CLASS` or a `draggable={false}` here.
 */
export function MediaViewer({
  className,
  cells,
  initialIndex,
  onClose,
  onDelete,
  onShare,
  onSave,
  onSetBackground,
}: MediaViewerProps) {
  const trackRef = useRef<HTMLDivElement>(null);
  const [index, setIndex] = useState(initialIndex);
  const current = cells[index];
  // INFO: A draft has no stored object yet, so there is nothing for either control to reach.
  const downloadUrl = current?.downloadUrl;
  // INFO: REQUIREMENTS.md § 8.11. Picks which save routes this platform is offered, by the same rule the § 10. selection bar follows.
  const isIosDevice = useIsIos();
  // WARN: REQUIREMENTS.md § 8.11. The same sheet either way, but not the same intent — on iOS this control *is* 저장, and asking for it as 공유 would word the buffering wait and the re-tap dialog for a share the user never asked for.
  const handleSheet = isIosDevice ? onSave : onShare;

  useEffect(() => {
    const track = trackRef.current;

    track?.scrollTo({ left: track.clientWidth * initialIndex });
  }, [initialIndex]);

  // INFO: DESIGN.md § 7.10. The viewer composes no `Dialog`, so the dismissal `Modal` gets from Radix is written out here.
  useEffect(() => {
    // WARN: The viewer is the bottom of the overlay stack, not the top — a confirmation or the § 8.11. share dialog opens over it, and both answer `Escape` themselves. Without this the key dismisses that overlay and takes the viewer under it with it.
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape" && !document.querySelector(OPEN_DIALOG_SELECTOR)) {
        onClose();
      }
    };

    document.addEventListener("keydown", handleKeyDown);

    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [onClose]);

  return (
    <ShellOverlay>
      {/* INFO: `data-media-viewer` is how an overlay *underneath* this one tells that it is open. The viewer composes no `Dialog`, so `OPEN_DIALOG_SELECTOR` does not find it, and REQUIREMENTS.md § 12.3.'s profile screen has to leave `Escape` to whatever is on top of it. */}
      <div
        className={cn("absolute inset-0 z-40 flex flex-col bg-scrim/90", className)}
        data-media-viewer=""
      >
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
              // INFO: DESIGN.md § 7.10. Deleting one's own attachment, confirmed — the same delete the § 8.11. action sheet reaches.
              <IconButton
                className="text-semantic-error hover:bg-canvas/15 hover:text-semantic-error-hover"
                Icon={Trash2}
                aria-label="메시지 삭제"
                onClick={onDelete}
              />
            )}
            {onSetBackground && current && (
              // INFO: REQUIREMENTS.md § 12.1. Withheld on a video, which has no still frame to wear, and on a draft, which has no stored object for the server-side copy to read.
              // WARN: `invisible`, never unmounted — the controls beside it keep their box for the same reason. Removing a 44px slot from this right-aligned row mid-swipe slides the save control under a finger already travelling towards it.
              <IconButton
                className={cn(
                  "text-on-primary hover:bg-canvas/15 hover:text-on-primary",
                  (!downloadUrl || current.isVideo) && "invisible",
                )}
                Icon={Wallpaper}
                aria-label="배경으로 설정"
                onClick={() => onSetBackground(current.id)}
              />
            )}
            {handleSheet && current && (
              <IconButton
                className={cn(
                  "text-on-primary hover:bg-canvas/15 hover:text-on-primary",
                  !downloadUrl && "invisible",
                )}
                Icon={isIosDevice ? Download : Share}
                aria-label={isIosDevice ? "저장/공유" : "공유"}
                onClick={() => handleSheet(current.id)}
              />
            )}
            {/* WARN: No `download` attribute — the route 302s to R2 and the spec drops it once the navigation resolves cross-origin. `toMediaDownloadUrl` signs the disposition into the object instead. */}
            {/* WARN: REQUIREMENTS.md § 8.11. Withheld on iOS alone, where it lands in Files rather than the photo library the control beside it reaches — and where holding the slide is already the OS's own route to 사진에 저장. */}
            {!isIosDevice && (
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
            )}
          </div>
        </div>
        {/* INFO: Native scroll snapping is the horizontal swipe of REQUIREMENTS.md § 8.1. — it costs no gesture code and matches the platform's own momentum. */}
        <div
          ref={trackRef}
          className="scrollbar-hidden flex min-h-0 flex-1 snap-x snap-mandatory overflow-x-auto overscroll-x-contain"
          onClick={handleBackdropClick}
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

  /**
   * DESIGN.md § 7.10. A tap on the scrim closes, as it does on every other overlay —
   * the photo itself is the one thing that does not, since holding it is how the OS
   * menu is reached (`REQUIREMENTS.md § 8.11.`).
   *
   * WARN: A `<video>` is excluded whole. Its controls are the platform's own and a
   * tap that lands between two of them is aimed at the player, not past it. So is
   * every control on a slide — the 원본 저장 fallback an undecodable video ends on
   * would otherwise close the viewer as it starts the download.
   */
  function handleBackdropClick(event: MouseEvent<HTMLDivElement>) {
    const target = event.target as HTMLElement;

    if (target.closest("a, button, video")) {
      return;
    }

    const image = target.closest("img");

    if (image && isOnPaintedArea(image, event.clientX, event.clientY)) {
      return;
    }

    onClose();
  }
}

/**
 * WARN: The element's box is not what the user sees. `object-contain` letterboxes
 * the asset inside it, so a portrait photo's side gutters are `<img>` as far as the
 * DOM is concerned and scrim as far as the eye is — and those gutters are most of
 * what there is to tap on a phone.
 */
function isOnPaintedArea(image: HTMLImageElement, x: number, y: number): boolean {
  const rect = image.getBoundingClientRect();
  const ratio = image.naturalWidth / image.naturalHeight;

  if (!Number.isFinite(ratio) || ratio <= 0) {
    return true;
  }

  const width = Math.min(rect.width, rect.height * ratio);
  const height = Math.min(rect.height, rect.width / ratio);

  return (
    Math.abs(x - (rect.left + rect.width / 2)) <= width / 2 &&
    Math.abs(y - (rect.top + rect.height / 2)) <= height / 2
  );
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
      poster={cell.previewUrl ?? undefined}
      controls
      playsInline
      preload="metadata"
      onError={() => setHasFailed(true)}
    />
  );
}
