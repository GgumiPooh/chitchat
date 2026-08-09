"use client";

import { cn, useIsIos, useModalOverlay, usePinchZoom } from "@/shared/lib";
import { Download, MessageCircle, Share, Trash2, Wallpaper, X } from "lucide-react";
import { useEffect, useRef, useState, type MouseEvent } from "react";
import { IconButton } from "./icon-button";
import type { MediaCell } from "./media-cell";
import { PreloadImage } from "./preload-image";
import { ShellOverlay } from "./shell-overlay";

export type MediaViewerProps = {
  className?: string;
  cells: MediaCell[];
  initialIndex: number;
  /**
   * REQUIREMENTS.md § 10. The 삭제 for the slide on screen, and the label saying how
   * far it reaches — a chat bubble's takes the whole message with it (`메시지 삭제`),
   * 보관함's takes the library row alone (`보관함에서 삭제`). Omitted where the reader
   * has nothing to remove.
   *
   * INFO: The label rides with the handler rather than standing beside it as a second prop, because DESIGN.md § 7.10. is that the reach is not readable from where the control sits — a handler that could arrive without one would draw the same trash over two different consequences.
   * INFO: `onSelect` is given the media id for `onShare`'s reason, the slide moving under the control. A chat bubble's viewer ignores it and removes the message its cells came from.
   */
  deletion?: { label: string; onSelect: (mediaId: string) => void };
  onClose: () => void;
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
  /**
   * REQUIREMENTS.md § 10. Opens the conversation at the message the slide on
   * screen was sent in. Given the message id, since the slide moves under the
   * control — and withheld outright by the chat room, where the reader is already
   * on the message it would travel to.
   */
  onOpenMessage?: (messageId: number) => void;
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
 * INFO: REQUIREMENTS.md § 18. #6. Pinch zoom is `usePinchZoom`; swiping between
 * attachments stays native scroll snapping, which needs no gesture parameters at all.
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
  deletion,
  onClose,
  onShare,
  onSave,
  onSetBackground,
  onOpenMessage,
}: MediaViewerProps) {
  const trackRef = useRef<HTMLDivElement>(null);
  // WARN: REQUIREMENTS.md § 10. The slides as they stood when `swipedTo` was last written, which is what turns a position into a *photo* — a delete below resolves against the id, and an index alone cannot say whether the row that left was before the reader or under them.
  const shownCellsRef = useRef(cells);
  // INFO: REQUIREMENTS.md § 12.3. `Escape`, the focus trap and the marker the profile screen underneath reads, from the one owner the profile screen shares.
  const overlayRef = useModalOverlay<HTMLDivElement>(onClose);
  const [swipedTo, setSwipedTo] = useState(initialIndex);
  // INFO: REQUIREMENTS.md § 18. #6. One zoom for the viewer rather than one per slide — only the slide on screen can be gestured, and a stale scale on a neighbour would be restored by a swipe back to it.
  const zoom = usePinchZoom();
  // WARN: REQUIREMENTS.md § 10. `cells` shrinks under the viewer, since 보관함's 삭제 takes the slide on screen and leaves the reader on the track. Held to the slides that still exist: deleting the last one leaves the swiped-to position past the end, which renders no slide and no controls at all.
  const index = Math.min(swipedTo, cells.length - 1);
  const current = cells[index];
  // INFO: A draft has no stored object yet, so there is nothing for either control to reach.
  const downloadUrl = current?.downloadUrl;
  // INFO: REQUIREMENTS.md § 8.11. Picks which save routes this platform is offered, by the same rule the § 10. selection bar follows.
  const isIosDevice = useIsIos();
  // INFO: REQUIREMENTS.md § 10. Null for a library row that was uploaded rather than sent, and for one whose message has since been deleted — neither has a conversation to open.
  const sentMessageId = current?.messageId ?? null;
  // WARN: REQUIREMENTS.md § 8.11. The same sheet either way, but not the same intent — on iOS this control *is* 저장, and asking for it as 공유 would word the buffering wait and the re-tap dialog for a share the user never asked for.
  const handleSheet = isIosDevice ? onSave : onShare;

  useEffect(() => {
    const track = trackRef.current;

    track?.scrollTo({ left: track.clientWidth * initialIndex });
  }, [initialIndex]);

  /**
   * REQUIREMENTS.md § 10. What a slide being deleted out of the track costs: the
   * reader keeps the photo they were on, and the zoom belonged to whichever slide
   * left.
   *
   * WARN: Resolved by id, never by holding the position still. 보관함's 삭제 usually takes the slide on screen, but its confirmation can be dismissed while the request is in flight and the reader can swipe on — so the row that leaves may sit *before* them, and every slide after it shifts down one.
   * WARN: The offset is re-asserted rather than trusted to scroll snapping. Removing the snapped element leaves re-snapping to pick the closest position, which is the right one — but this is a `snap-mandatory` track on WebKit, and the app's own history with that combination (§ 8.3.) is that the correction is where engines differ. Written out, the reader lands on the right photo on all of them.
   * WARN: Guarded on the length, which is what keeps a swipe's own `swipedTo` write off the scroll below — re-asserting an offset mid-gesture force-snaps a scroll that is still in flight.
   */
  useEffect(() => {
    const shownCells = shownCellsRef.current;

    if (shownCells.length === cells.length) {
      return;
    }

    shownCellsRef.current = cells;

    // INFO: § 10. Gone exactly when the deleted row was the one on screen, where the position it leaves behind is already the next photo's.
    const shownId = shownCells[swipedTo]?.id;
    const found = cells.findIndex((cell) => cell.id === shownId);
    const target = found < 0 ? Math.min(swipedTo, cells.length - 1) : found;
    const track = trackRef.current;

    setSwipedTo(target);
    track?.scrollTo({ left: track.clientWidth * target });
    zoom.reset();
  }, [cells, swipedTo, zoom]);

  return (
    <ShellOverlay>
      {/* WARN: `role`/`aria-modal` by hand, because this composes no Radix primitive (§ 12.3.) — and required, not decoration: the hook focuses this element on open, so without them focus lands on an anonymous `div` and a reader is told nothing while the conversation behind stays exposed to it. */}
      <div
        ref={overlayRef}
        className={cn("absolute inset-0 z-40 flex flex-col bg-scrim/90", className)}
        role="dialog"
        aria-modal="true"
        aria-label="첨부 크게 보기"
      >
        <div className="flex items-center justify-between p-sm pt-[max(var(--spacing-sm),env(safe-area-inset-top))]">
          <IconButton
            className="text-on-scrim hover:bg-on-scrim/15 hover:text-on-scrim"
            Icon={X}
            aria-label="닫기"
            onClick={onClose}
          />
          {cells.length > 1 && (
            <span className="text-caption text-on-scrim">{`${index + 1} / ${cells.length}`}</span>
          )}
          <div className="flex items-center">
            {deletion && current && (
              // INFO: DESIGN.md § 7.10. Confirmed wherever it renders, since a control beside a per-slide save does not say its own reach — in a chat bubble it is the same delete the § 8.11. action sheet reaches.
              <IconButton
                className="text-semantic-error hover:bg-on-scrim/15 hover:text-semantic-error-hover"
                Icon={Trash2}
                aria-label={deletion.label}
                onClick={() => deletion.onSelect(current.id)}
              />
            )}
            {onSetBackground && current && (
              // INFO: REQUIREMENTS.md § 12.1. Withheld on a video, which has no still frame to wear, and on a draft, which has no stored object for the server-side copy to read.
              // WARN: `invisible`, never unmounted — the controls beside it keep their box for the same reason. Removing a 44px slot from this right-aligned row mid-swipe slides the save control under a finger already travelling towards it.
              <IconButton
                className={cn(
                  "text-on-scrim hover:bg-on-scrim/15 hover:text-on-scrim",
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
                  "text-on-scrim hover:bg-on-scrim/15 hover:text-on-scrim",
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
                  "inline-flex size-11 items-center justify-center rounded-full text-on-scrim transition-colors outline-none hover:bg-on-scrim/15 focus-visible:ring-2 focus-visible:ring-primary",
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
        {/* WARN: REQUIREMENTS.md § 18. #6. A zoomed slide freezes the track, or the pan competes with the swipe for the same finger and the photo changes under it. `overflow-x-hidden` holds `scrollLeft` where it is, so the slide is still the one the reader zoomed when it lifts. */}
        <div
          ref={trackRef}
          className={cn(
            "scrollbar-hidden flex min-h-0 flex-1 snap-x snap-mandatory overscroll-x-contain",
            zoom.isZoomed ? "overflow-x-hidden" : "overflow-x-auto",
          )}
          onClick={handleBackdropClick}
          onScroll={handleScroll}
        >
          {cells.map((cell, slideIndex) => (
            <div
              key={cell.id}
              // INFO: Vertical padding only. A side gutter reads as a frame around the photo, and the viewer's whole point is that the image is the screen.
              className="flex w-full shrink-0 snap-center items-center justify-center py-md"
            >
              {/* WARN: REQUIREMENTS.md § 10. Only the neighbours load their asset. Every slide used to request its original on mount, which was bounded by `MAX_MEDIA_PER_MESSAGE` in a chat bubble but is the whole loaded library here — opening one photo after three pages of scrolling started 180 requests for objects of up to `MAX_IMAGE_SIZE`. */}
              {Math.abs(slideIndex - index) > 1 ? (
                <SlidePlaceholder cell={cell} />
              ) : cell.isVideo ? (
                <VideoSlide cell={cell} />
              ) : (
                // WARN: REQUIREMENTS.md § 18. #6. Only the slide on screen takes the gesture. A neighbour is half a swipe away and mounted, so handlers on it would answer a pinch that started over the photo the reader can see.
                <ImageSlide cell={cell} zoom={slideIndex === index ? zoom : undefined} />
              )}
            </div>
          ))}
        </div>
        {/* INFO: REQUIREMENTS.md § 10. Below the track rather than over it, so it never covers the photograph the viewer exists to show whole. */}
        {/* WARN: The row keeps its box on a slide that cannot jump, for the reason the header's controls do — a control that unmounts mid-swipe resizes the track and moves the photo under a finger that is already travelling. */}
        {onOpenMessage && (
          <div className="flex justify-center px-md pb-[max(var(--spacing-md),env(safe-area-inset-bottom))]">
            <button
              className={cn(
                "inline-flex min-h-11 cursor-pointer items-center gap-xs rounded-full border border-on-scrim/25 px-md text-button-sm text-on-scrim transition-colors outline-none hover:bg-on-scrim/15 focus-visible:ring-2 focus-visible:ring-primary active:bg-on-scrim/15",
                sentMessageId === null && "invisible",
              )}
              type="button"
              tabIndex={sentMessageId === null ? -1 : undefined}
              onClick={() => sentMessageId !== null && onOpenMessage(sentMessageId)}
            >
              <MessageCircle className="size-4" strokeWidth={1.75} />
              대화에서 보기
            </button>
          </div>
        )}
      </div>
    </ShellOverlay>
  );

  function handleScroll() {
    const track = trackRef.current;

    if (!track) {
      return;
    }

    const next = Math.round(track.scrollLeft / track.clientWidth);

    // WARN: REQUIREMENTS.md § 18. #6. The zoom belongs to the slide it was applied to, so arriving at another one drops it. Unconditional, because `scroll` fires for every frame of the swipe and resetting on each would fight a pinch that is still in progress.
    if (next !== index) {
      zoom.reset();
      setSwipedTo(next);
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
      className="max-h-full w-full rounded-md bg-on-scrim/10"
      style={{ aspectRatio: `${cell.width} / ${cell.height}` }}
    />
  );
}

function ImageSlide({ cell, zoom }: { cell: MediaCell; zoom?: ReturnType<typeof usePinchZoom> }) {
  return (
    // WARN: REQUIREMENTS.md § 18. #6. The gesture surface, and it never scales — the hook measures its box for the pan bounds, so the transform belongs to the element inside it.
    <div className="flex max-h-full w-full items-center justify-center" {...zoom?.surfaceProps}>
      <div className="max-h-full w-full" style={zoom?.contentStyle}>
        {/* INFO: The stored ratio gives the skeleton a box to fill while the original downloads — the grid tile the user tapped came from a thumbnail, so this request starts cold. */}
        <PreloadImage
          className="max-h-full w-full"
          imgClassName="size-full object-contain"
          placeholderClassName="rounded-md"
          style={{ aspectRatio: `${cell.width} / ${cell.height}` }}
          src={cell.originalUrl ?? cell.previewUrl}
          alt=""
        />
      </div>
    </div>
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
        <p className="text-body-md text-on-scrim">이 기기에서는 재생할 수 없는 형식이에요</p>
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
