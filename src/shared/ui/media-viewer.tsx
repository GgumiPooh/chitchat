"use client";

import {
  CHAT_MEDIA_PAGE_MARGIN,
  isWearableBackgroundVideo,
  toMediaCountUnit,
  toMediaLabel,
  type ChatTrackEdge,
} from "@/shared/config";
import {
  A_SECOND,
  GESTURE_SLOP,
  MEDIA_MORPH_NAME,
  MEDIA_VIEWER_NAME,
  cn,
  endMediaMorph,
  useInertialStrip,
  useIsIos,
  useModalOverlay,
  usePinchZoom,
  useSettledCommit,
  whenMediaMorphSettled,
  type MediaId,
  type MessageId,
  type Nullable,
  type Optional,
} from "@/shared/lib";
import { OFFLINE_MESSAGES, useOfflineGate } from "@/shared/offline-ux";
import {
  ChevronLeft,
  ChevronRight,
  Download,
  ImagePlus,
  Images,
  Play,
  Share,
  Trash2,
  X,
} from "lucide-react";
import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type ComponentProps,
  type FC,
  type MouseEvent,
  type PointerEvent,
} from "react";
import { HapticTap } from "./haptic-tap";
import { HapticTarget } from "./haptic-target";
import { IconButton } from "./icon-button";
import { toCellRatio, type MediaCell } from "./media-cell";
import { PreloadImage } from "./preload-image";
import { ShellOverlay } from "./shell-overlay";

/**
 * How long the reader has to stay on a slide they arrived at before its original is
 * asked for — long enough that a slide crossed on the way somewhere else asks for
 * nothing at all.
 *
 * WARN: The abort in `useDecodedOriginal`'s cleanup does not stand in for this, and the two are not alternatives. It stops the bytes that have not arrived yet; the request itself has already been made, and `/api/media/{id}` validates the session, reads the row and signs a URL before it answers. A reader flipping between three photos was paying that round trip per crossing, for objects they never looked at.
 * INFO: A whole second rather than a frame or two, because the flipping is what it is for. A slide crossed in a filmstrip scrub is held for tens of milliseconds, and one crossed in a quick there-and-back swipe for two or three hundred — the pattern the § 10. blank slide was reported from, and a reader searching for a photo stays under it for several crossings in a row.
 */
const ARRIVAL_DWELL = A_SECOND;

// INFO: The platform transport's strip along the bottom of the picture, in CSS px, sized to cover iOS's and Android's — neither exposes its own height to script.
const VIDEO_TRANSPORT_HEIGHT = 64;

// INFO: The centre play glyph iOS and Android draw before playback, in CSS px.
const VIDEO_PLAY_GLYPH_RADIUS = 48;

export type MediaViewerProps = {
  className?: string;
  cells: MediaCell[];
  initialIndex: number;
  /**
   * DESIGN.md § 7.10. The top-right jump, and each viewer travels to the surface the
   * reader is **not** on — 보관함's to the message the slide was sent in, 채팅's to
   * the same photo in the library.
   *
   * INFO: The label and the glyph both ride with the handler for `deletion`'s reason: the two destinations are not readable from a shared control, and a handler that could arrive without them would draw one journey's icon over the other's. A grid glyph on 대화에서 보기 was exactly that — it named 보관함, which is the screen that jump leaves.
   * WARN: `Icon` is the destination's own glyph, taken from wherever else the app names that screen — `MessageCircle` for 채팅 (the tab bar, 대화하기, the empty state) and `Archive` for 보관함. It is not a direction arrow: the top bar already has one chevron, on the identity block, and it means "travel" rather than "back".
   * WARN: Handed the whole **cell**, not an id, because the two directions travel by different ones — 보관함 by `messageId` and 채팅 by the media id itself. It is also fired on a slide with nowhere to go: a library-only upload has no message and a photo taken out of the library has no tile (§ 10.), and the caller answers that with a toast. A control that disappeared per slide would be a hole opening and closing in the bar as the reader swipes.
   */
  jump?: { label: string; Icon: FC<ComponentProps<"svg">>; onSelect: (cell: MediaCell) => void };
  /**
   * DESIGN.md § 4.7.3. Resolves the thumbnail the viewer should collapse back into —
   * given the slide the reader ended on, which is rarely the one they opened.
   *
   * WARN: Answered by the surface behind the viewer, because only it knows how to find its own thumbnails: 보관함 by the grid's tile attribute, 채팅 by the bubble's cell. It returns nothing wherever there is no node — a windowed grid row scrolled far past, a bubble the § 8.1. track has swiped out of — and `endMediaMorph` drops an off-screen one as well, so a caller may answer optimistically.
   * WARN: Left unset the viewer still fades, and that is the § 7.7. profile viewer's whole case: the avatar it opens from is one element that is always on screen, but the picture is a *cropped* cover rather than the same rectangle, so a morph would be a lie about which photo it is.
   */
  findMorphOrigin?: (mediaId: MediaId) => Nullable<HTMLElement>;
  /**
   * The floor colour behind a slide `object-contain` leaves gaps around. Left unset
   * it is `bg-canvas`, matching the page the viewer opened over; `ChatRoom` passes
   * its wallpaper's own tint (`toChromeTint`) instead, the same colour the room
   * itself wears.
   */
  backgroundColor?: string;
  /**
   * REQUIREMENTS.md § 10. The 삭제 for the slide on screen, and the label saying how
   * far it reaches — a chat bubble's withdraws the whole message (`메시지 삭제`),
   * 보관함's destroys the object the slide is drawn from and leaves the bubble around a
   * tombstone (`삭제`). Omitted where the reader has nothing to remove.
   *
   * INFO: The label rides with the handler rather than standing beside it as a second prop, because DESIGN.md § 7.10. is that the reach is not readable from where the control sits — a handler that could arrive without one would draw the same trash over two different consequences.
   * INFO: `onSelect` is given the media id for `onShare`'s reason, the slide moving under the control. 채팅's viewer resolves it back to the message that carries that slide.
   *
   * WARN: REQUIREMENTS.md § 8.1. `isAvailable` is per slide because 채팅's track crosses bubbles and only my own may be withdrawn (§ 8.13.). Presence of the prop cannot answer it: the track is one open and the answer changes with every swipe.
   */
  deletion?: {
    label: string;
    isAvailable?: (mediaId: MediaId) => boolean;
    onSelect: (mediaId: MediaId) => void;
  };
  /**
   * REQUIREMENTS.md § 8.1. 채팅's track is a window on the conversation and it grows
   * at whichever edge the reader nears. The caller owns the rows; this component owns
   * the **timing**, because only it knows when its own track has gone still.
   *
   * WARN: 채팅 alone passes it and 보관함 must not. Its list is the loaded library and the grid behind it pages that (§ 10.) — a second pager on top would ask for rows the grid is already fetching and insert them into a snapshot the grid never sees.
   * WARN: Both callbacks have to be **memoized**. `useSettledCommit` rebuilds its wait from `onCommit`'s identity, and this component re-renders on every slide the reader crosses — a fresh arrow per render restarts the wait forever and the held page is never committed.
   */
  paging?: {
    /** A page is fetched and waiting for this track to go still. */
    hasHeldPage: boolean;
    /** Asks for the stretch beyond one edge, named by the slide sitting at it. The caller **holds** the answer rather than committing it. */
    onLoadEdge: (edge: ChatTrackEdge, anchorId: string) => void;
    /** Commits every held page. Called from here alone, and on **every** settle rather than only the awaited ones — the caller is what knows whether anything is waiting. */
    onCommit: () => void;
  };
  /**
   * DESIGN.md § 4.7.3. The slide the reader has crossed to, so the surface underneath
   * can keep a landing for the closing morph within reach.
   *
   * WARN: 보관함 alone answers it, and what it does with it is conditional: it moves its grid **only** where the tile is not already on screen. Centring unconditionally would move the shelf under a reader who opened one photo and closed it again, which is the one case where returning to exactly where they were is the whole point.
   * WARN: 채팅 leaves it unset on purpose. The equivalent there is jumping the room to another message, which loses the reader's place in the conversation — it exists, and it is the explicit `대화에서 보기` control rather than something a dismissal does behind them.
   */
  onSlideChange?: (mediaId: MediaId) => void;
  /**
   * DESIGN.md § 7.10. Makes the sender-and-caption block itself travel to the bubble
   * the slide was sent in — the second jump, and the one 채팅 needs.
   *
   * WARN: 채팅 alone passes it, and only because § 8.1.'s track leaves the bubble. Its top-right control is already spoken for by 보관함, and while the track was one bubble there was nowhere for this to go — the reader was on that message. 보관함 leaves it unset: its top-right control is this journey.
   */
  onOpenMessage?: (messageId: MessageId) => void;
  onClose: () => void;
  /** REQUIREMENTS.md § 8.11. Hands the slide on screen to the OS share sheet. Given the media id, since the slide moves under the control. */
  onShare?: (mediaId: MediaId) => void;
  /** REQUIREMENTS.md § 8.11. The 저장 route for the slide on screen. Used on iOS only, where the download beside it cannot reach the photo library. */
  onSave?: (mediaId: MediaId) => void;
  /**
   * REQUIREMENTS.md § 12.1. Opens 사진 사용하기 for the slide on screen — the profile
   * image, the profile cover, or the chat wallpaper.
   *
   * INFO: Given the media id for `onShare`'s reason — the slide moves under the
   * control, so the id has to be read at the tap rather than captured at mount.
   * INFO: `isVideo` rides along because the three slots do not take the same kinds — a profile cover may be a video and the other two may not (§ 12.2.), so the sheet has to know before it draws its rows.
   */
  onApplyPhoto?: (mediaId: MediaId, isVideo: boolean) => void;
  /**
   * REQUIREMENTS.md § 8.1. Takes 원본 저장 over, so the caller can do something before
   * the object is reached — 채팅 offers the rest of the bubble first (§ 8.1.), 보관함
   * simply routes through `downloadMedia`.
   *
   * WARN: Given, the control becomes a `button`; left unset it stays the `<a href>` below. **Both viewers now pass it**, and 보관함's reason is not a question it wants to ask: the anchor navigates straight at the object, and `REQUIREMENTS.md § 18.` #1.'s 삭제 reaches rows on a screen with nothing publishing it, so a slide can name an object that is gone — which took a standalone PWA to a bare JSON 404 with no way back. The anchor survives for the § 7.7. profile viewer, where the source is this user's own avatar and nobody else can remove it.
   */
  onDownload?: (mediaId: MediaId) => void;
};

/**
 * DESIGN.md § 7.10. Full-bleed on `scrim`, no chrome but a close control and the
 * position counter.
 *
 * WARN: `absolute`, never `fixed` — `ShellOverlay` owns the viewport-sized box this
 * fills (DESIGN.md § 3.3.), rather than the chat room: staying inside the screen
 * leaves it under the floating header and the tab bar.
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
  jump,
  paging,
  findMorphOrigin,
  backgroundColor,
  onClose,
  onSlideChange,
  onOpenMessage,
  onShare,
  onSave,
  onApplyPhoto,
  onDownload,
}: MediaViewerProps) {
  const trackRef = useRef<Nullable<HTMLDivElement>>(null);
  const lengthRef = useRef(cells.length);
  // INFO: Whether the open offset has been asserted, so whichever of the two passes below measures first is the only one that acts — see their shared WARN.
  const hasOpenedRef = useRef(false);
  // WARN: State beside the ref above, because `useSettledCommit` takes the element as a value and the React Compiler forbids reading a ref during render. The ref stays for the imperative `scrollTo`s, which run in effects where reading it is fine.
  const [trackElement, setTrackElement] = useState<Nullable<HTMLDivElement>>(null);
  // WARN: REQUIREMENTS.md § 8.1. Which slide the reader is on, by id rather than by offset. **State, not a ref**, because `index` is derived from it during render and the React Compiler forbids reading a ref there — a ref would also be the stale value on the render that matters, which is the swap this exists for.
  const [heldId, setHeldId] = useState<Optional<string>>(cells[initialIndex]?.id);
  /**
   * REQUIREMENTS.md § 10. The track as the last render drew it, beside whether that
   * render is the one that lost the slide the reader was holding.
   *
   * WARN: The previous array is the only place a **removed** slide still has a position, and naming its surviving neighbour off that is the whole of the reconciliation below. State rather than a ref for `heldId`'s reason — it is read during render.
   * WARN: `hasLostHeldSlide` is recorded here rather than re-derived later, because the re-point below puts the reader back inside `cells` and nothing after it can tell a delete from a swap. § 18. #6.'s zoom reset is its only reader, one commit later.
   */
  const [rendered, setRendered] = useState({ cells, hasLostHeldSlide: false });
  /**
   * REQUIREMENTS.md § 8.1. The slide a keyboard step has been sent to but has not yet
   * arrived at, so a held arrow key advances once per press rather than once per
   * animation.
   *
   * WARN: A ref rather than the `index` below, and it is the whole reason this exists: `index` follows `heldId`, which only moves once `handleScroll` sees the track cross half a slide. Stepping off it means every repeat that fires during the smooth scroll re-computes the same origin and re-issues the same destination — the key is held down and the viewer sits on the next photo.
   * WARN: Cleared on arrival **and on the inputs that interrupt one**, because a step that is cut short never reaches the offset it named. Arrival alone left the destination pending for good: a reader who pressed → and swiped back mid-animation had their next press measured from a slide they had turned away from, and travelled there instead of one across.
   */
  const steppedRef = useRef<Nullable<number>>(null);
  const chevronPressRef = useRef<Nullable<number>>(null);
  // INFO: REQUIREMENTS.md § 12.3. `Escape`, the focus trap and the marker the profile screen underneath reads, from the one owner the profile screen shares — and § 8.1.'s arrow keys, which that owner forwards because "is anything open over me" is the same question for all four.
  const overlayRef = useModalOverlay<HTMLDivElement>(handleClose, handleOverlayKeyDown);
  // INFO: DESIGN.md § 7.10. A tap on the photo puts the chrome away, so the slide can be looked at with nothing over it. It starts visible — the controls have to be findable without discovering the gesture first.
  const [isChromeVisible, setIsChromeVisible] = useState(true);
  /**
   * DESIGN.md § 4.7.3. Whether the opening morph has landed, which is what releases
   * the slides to ask for their stored originals (§ 7.10.).
   *
   * WARN: The request is held rather than the paint. An original that arrives mid-flight replaces the picture under an animation the live DOM is not painting at all, so the swap surfaces as a pop at the instant the transition ends — which is the one moment the reader is looking straight at it.
   * INFO: Resolves immediately where no morph ran (reduced motion, or a browser without the API), so this costs the fallback path nothing but a microtask.
   */
  const [hasMorphSettled, setHasMorphSettled] = useState(false);
  // INFO: REQUIREMENTS.md § 18. #6. One zoom for the viewer rather than one per slide — only the slide on screen can be gestured, and a stale scale on a neighbour would be restored by a swipe back to it.
  const zoom = usePinchZoom();
  // INFO: Taken off the hook once, because the correction below has to depend on it and `zoom` itself is a fresh object on every render — `reset` is the stable half of it.
  const resetZoom = zoom.reset;
  const captureRoot = zoom.captureRoot;
  /**
   * WARN: The two owners of this element are composed by hand, and both return a cleanup React has to be able to call. `useModalOverlay`'s attach **focuses** the container, so a fresh arrow here would re-run it on every render — and the viewer re-renders on every slide the reader crosses.
   */
  const captureOverlay = useCallback(
    (element: HTMLDivElement) => {
      const releaseOverlay = overlayRef(element);
      const releaseWheel = captureRoot(element);

      // WARN: DESIGN.md § 7.10. The pointer's half of the `touch-pan-x` on the root — a trackpad's two-finger scroll is a `wheel`, which `touch-action` says nothing about, so without this the grid behind the viewer travels under a desktop reader. Attached by hand because React registers `onWheel` passively, where `preventDefault` is ignored.
      element.addEventListener("wheel", refuseVerticalWheel, { passive: false });

      return () => {
        element.removeEventListener("wheel", refuseVerticalWheel);
        releaseOverlay?.();
        releaseWheel?.();
      };
    },
    [overlayRef, captureRoot],
  );
  /**
   * WARN: REQUIREMENTS.md § 8.1. The reader's position is the held slide's **id**, resolved on every render and never read out of the DOM offset. 채팅 swaps the bubble's cells for the conversation-wide track under the reader, and the offset that meant "the 3rd of 3" means "the 3rd of 300" in the new array — resolved after paint, one frame showed an unrelated photo with the wrong sender and caption, and its two neighbours started downloading their originals before being thrown away.
   * INFO: `-1` only while the track is empty, which is the caller's cue to unmount (§ 10.) rather than a state this draws.
   */
  const index = cells.findIndex((cell) => cell.id === heldId);

  /**
   * REQUIREMENTS.md § 10. The track changed identity, so this settles whether the
   * reader's own slide is still in it before the render below draws one.
   *
   * WARN: The render phase, never an effect. `index` above is what the slides, the chrome and the neighbour preloads are all keyed on, so it has to be right on the render that draws them — and the React Compiler flags a `setState` in an effect as the cascading render it would be.
   * WARN: Re-entered at most once. `rendered.cells` is advanced in the same pass, so the render React discards here is the only one that sees the reader outside the track.
   */
  if (rendered.cells !== cells) {
    setRendered({ cells, hasLostHeldSlide: index < 0 });

    if (index < 0) {
      setHeldId(toSurvivingSlideId(rendered.cells, cells, heldId));
    }
  }

  const current = cells[index];
  // INFO: REQUIREMENTS.md § 18. #6. Both step routes are withheld while the slide is zoomed, by the same rule that freezes the swipe — the pan owns the surface until the zoom is let go.
  const canStepBack = !zoom.isZoomed && index > 0;
  const canStepForward = !zoom.isZoomed && index >= 0 && index < cells.length - 1;
  // INFO: A draft has no stored object yet, so there is nothing for either control to reach.
  const downloadUrl = current?.downloadUrl;
  // INFO: REQUIREMENTS.md § 12.1. A stored image has all three slots open to it; a video reaches the profile cover alone, and only inside § 12.1.'s caps.
  const canApplyPhoto =
    Boolean(downloadUrl) && (!current?.isVideo || isWearableBackgroundVideo(current));
  // INFO: REQUIREMENTS.md § 8.1. Withheld per slide in 채팅, where the track crosses bubbles; 보관함 offers no predicate, since its 삭제 reaches either participant's row (§ 10.).
  // WARN: `Boolean(deletion)` leads, because the `??` below answers `true` for a caller that passes no `deletion` at all — the § 7.7. profile-photo viewer, where it mounted the bottom bar's pill with nothing inside it and pushed the lone 원본 저장 off centre.
  const canDeleteCurrent =
    Boolean(deletion) && Boolean(current) && (deletion?.isAvailable?.(current.id) ?? true);
  // INFO: REQUIREMENTS.md § 8.11. Picks which save routes this platform is offered, by the same rule the § 10. selection bar follows.
  const isIosDevice = useIsIos();
  // WARN: REQUIREMENTS.md § 8.11. The same sheet either way, but not the same intent — on iOS this control *is* 저장, and asking for it as 공유 would word the buffering wait and the re-tap dialog for a share the user never asked for.
  const handleSheet = isIosDevice ? onSave : onShare;
  // INFO: § 16. caches the build and `/offline` and nothing else, so every one of these four reaches for bytes or a row that is not on the device.
  const saveGate = useOfflineGate(OFFLINE_MESSAGES.save);
  const deleteGate = useOfflineGate(OFFLINE_MESSAGES.remove);
  const applyPhotoGate = useOfflineGate(OFFLINE_MESSAGES.wear);
  // WARN: REQUIREMENTS.md § 8.11. Worded by the same rule that picks the control — on iOS the sheet is 저장, so promising a share is promising the wrong thing.
  const sheetGate = useOfflineGate(isIosDevice ? OFFLINE_MESSAGES.save : OFFLINE_MESSAGES.share);
  // INFO: DESIGN.md § 7.10. Null for a library row uploaded rather than sent, and for one whose message has since been withdrawn — neither has a bubble for the identity block to travel to.
  const sentMessageId = current?.messageId ?? null;
  // INFO: DESIGN.md § 7.10. When the slide was sent, under the sender. Where it sits used to join it here and is the filmstrip's line at the foot of the screen now, beside the thumbnails it counts.
  const caption = current?.sentAt ? toSlideTimestamp(current.sentAt) : "";
  // INFO: DESIGN.md § 7.10. The bubble the slide was sent in, which is what the filmstrip draws and what the position counts — empty on a bubble of one and on a slide with no bubble at all.
  const bubble = toBubbleRun(index, cells);
  // INFO: REQUIREMENTS.md § 8.1. Every branch below falls away with the prop, which is how 보관함 gets a track that does not page.
  const { hasHeldPage = false, onLoadEdge, onCommit } = paging ?? {};
  const commitHeldPages = useCallback(() => onCommit?.(), [onCommit]);

  /**
   * The offset the viewer opens at, asserted **once** — tried in the layout phase and
   * again after paint, because only one of the two is ever the one that can measure.
   *
   * WARN: Mount only, and `initialIndex` is deliberately not a dependency — every later move of the offset belongs to the correction below, which resolves the reader's own slide by id. Re-run on a changed `initialIndex` this scrolls to a position the reader left long ago: 채팅's window swap and its § 8.13. narrowing both rewrite that number, and both run at a point where the reader may be on a different slide.
   * WARN: The passive half is what this used to be, whole, and it cannot simply become a layout effect: at mount the track may not have been laid out, and a `clientWidth` of `0` read one phase earlier would open every viewer on its first slide. `openAtInitialIndex` refuses that measurement rather than acting on it, so the passive pass is still what answers wherever the early one cannot.
   * WARN: DESIGN.md § 4.7.3. The layout half is what the opening morph needs, and it is the whole reason for the pair. A view transition captures the new state as soon as `startMediaMorph`'s `flushSync` returns — which runs layout effects and not passive ones — so left passive this lands *after* the capture, and every photo the reader opened past the first was captured off screen and flew in from the right instead of expanding out of its tile.
   * WARN: Declared **before** the correction below, so the mount pass cannot land on top of it. The correction returns early on mount (the length is unchanged), but the order is what makes that true rather than incidental.
   */
  useLayoutEffect(() => {
    openAtInitialIndex();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    openAtInitialIndex();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /**
   * DESIGN.md § 4.7.3. Tells the surface underneath which slide the reader is on, so
   * it can keep a landing for the close in reach.
   *
   * INFO: It fires on the opening slide too, and that costs nothing: the thumbnail the reader just tapped is on screen by definition, and 보관함's answer is a no-op for a tile that already is.
   */
  useEffect(() => {
    if (current) {
      onSlideChange?.(current.id);
    }
  }, [current, onSlideChange]);

  // WARN: Latched, never cleared. The promise outlives the closing morph too, and a viewer that reset here would drop back to thumbnails on its way out.
  useEffect(() => {
    let isMounted = true;

    void whenMediaMorphSettled().then(() => isMounted && setHasMorphSettled(true));

    return () => {
      isMounted = false;
    };
  }, []);

  /**
   * REQUIREMENTS.md § 8.1., § 8.3. A page is committed only once the track has been
   * still with no finger on it, because the offset correction below is dropped if it
   * lands mid-flick — WebKit hands the scroll offset to the compositor for the length
   * of a gesture, which is the history § 8.3. records.
   *
   * WARN: The **older** page is what needs this: it inserts in front of the reader and moves every slide after it. The newer page is held under the same gate anyway, because the correction is keyed on the track's length and cannot tell the two apart — and a length change under a moving finger is exactly what must not happen.
   * WARN: No scroller until the prop arrives, so 보관함 attaches none of the four listeners.
   */
  useSettledCommit({
    scroller: onCommit ? trackElement : null,
    isPending: hasHeldPage,
    onSettled: commitHeldPages,
  });

  /**
   * REQUIREMENTS.md § 8.1. Asks for the next stretch once the reader is within
   * `CHAT_MEDIA_PAGE_MARGIN` of an edge.
   *
   * WARN: Keyed on the slide the reader is on, never on a scroll frame. `index` moves once per crossing, which is the only thing that brings an edge nearer — and the commit that answers moves it away again, so nothing here re-asks itself into a loop (§ 8.3. on paging from a render-scoped effect).
   * WARN: It fires on the bubble's own cells too, before the conversation-wide window has landed, and that is fine only because **the caller is the one that decides**: `useViewerTrack` keeps both edges disarmed until the window arrives, so a bubble of three — or a draft with no stored row at all — asks for nothing.
   */
  useEffect(() => {
    const older = cells[0];
    const newer = cells.at(-1);

    if (!onLoadEdge || !older || !newer) {
      return;
    }

    if (index <= CHAT_MEDIA_PAGE_MARGIN) {
      onLoadEdge("older", older.id);
    }

    if (index >= cells.length - 1 - CHAT_MEDIA_PAGE_MARGIN) {
      onLoadEdge("newer", newer.id);
    }
  }, [index, cells, onLoadEdge]);

  /**
   * The track changed under the reader, and there are three ways that happens.
   *
   * REQUIREMENTS.md § 10. A slide was **deleted** out of it: the render above has
   * already re-pointed the reader at the surviving neighbour, so what is left here is
   * that slide's offset — and the zoom, which belonged to the one that left.
   *
   * REQUIREMENTS.md § 8.1. Or the track was **replaced** by a longer one — 채팅 opens
   * on the bubble's own attachments and swaps in the conversation-wide window when it
   * arrives, so the same photo is suddenly at a different offset. The reader must not
   * move: only the slides around it appeared.
   *
   * REQUIREMENTS.md § 8.1. Or a **page** landed at one of its edges, which is the same
   * thing one stretch at a time — and at the older edge it is a prepend, so every
   * slide the reader has behind them moves by the width of the page.
   *
   * WARN: `rendered.hasLostHeldSlide` above is what tells a delete from the other two, and the render has already answered for it — this effect only moves the **DOM scroll**, which no render can do. A length comparison could not tell them apart at all: a replacement is a different array of a different length whose current slide is still on screen.
   * WARN: This **is** the prepend correction, and it is an absolute offset rather than a delta of the size the track grew by (`ArchiveGrid` has to use a delta, since its prepend regroups the rows it merges into and leaves no row to re-find). Every slide here is exactly one track width, so the reader's logical position — `index`, derived from the held slide's id during render — resolves to an exact `scrollLeft`. Absolute cannot double-apply on top of a correction the browser did make, which a delta can.
   * WARN: A layout effect, never a passive one. Passive runs after paint, so the frame between the commit and the correction shows whichever slide the unmoved `scrollLeft` now points at — 30 photos back, on a page of `CHAT_MEDIA_TRACK_SPAN`.
   * WARN: The offset is re-asserted rather than trusted to scroll snapping. Removing or inserting around the snapped element leaves re-snapping to pick the closest position, which is the right one — but this is a `snap-mandatory` track on WebKit, and the app's own history with that combination (§ 8.3.) is that the correction is where engines differ. Written out, the reader lands where they were on all of them.
   * WARN: Guarded on the length itself, because `index` has to be read here and cannot be a dependency — the effect would then fire on every swipe and force-snap a scroll that is still in flight.
   */
  useLayoutEffect(() => {
    if (lengthRef.current === cells.length) {
      return;
    }

    lengthRef.current = cells.length;

    const track = trackRef.current;

    // WARN: A pending keyboard step names an offset in the track as it was *before* this correction, so it is dropped rather than carried across — a page landing in front of the reader would otherwise send the next arrow press back to where that slide used to sit.
    steppedRef.current = null;

    // WARN: No `setState` here, deliberately — the React Compiler flags one in an effect as a cascading render, and none is needed. `index` is already right from the render above, and the reconciliation there has already re-pointed the reader at a surviving slide.
    track?.scrollTo({ left: track.clientWidth * index });

    // INFO: § 10. Only the delete resets the zoom: the held slide left with it. A swap kept the same photo on screen, so its zoom is still the reader's.
    if (rendered.hasLostHeldSlide) {
      resetZoom();
    }
  }, [cells, index, rendered.hasLostHeldSlide, resetZoom]);

  return (
    <ShellOverlay>
      {/* WARN: `role`/`aria-modal` by hand, because this composes no Radix primitive (§ 12.3.) — and required, not decoration: the hook focuses this element on open, so without them focus lands on an anonymous `div` and a reader is told nothing while the conversation behind stays exposed to it. */}
      <div
        ref={captureOverlay}
        className={cn(
          // WARN: DESIGN.md § 4.7.3. No `bg-scrim` here — the floor is the layer below, so that it can arrive after the picture has finished travelling. On the root it would be baked into the captured snapshot and the reader would watch a black plate grow out of a grid tile.
          "pointer-events-auto absolute inset-0 z-40 flex flex-col",
          // WARN: DESIGN.md § 7.10. The whole viewer reserves the vertical axis, and this is what keeps the screen behind it still. Nothing in here scrolls vertically, so a downward drag on the scrim, the chrome or a video slide chains straight to the document — which is the app's own scroller (§ 3.3.) — and 보관함's grid travels under a viewer the reader believes is the only thing on screen. `pan-x` and never `none`: the track's own swipe (§ 8.1.) is a native horizontal scroller, and a browser intersects `touch-action` down the ancestor chain, so `none` here would meet the slide's `pan-x` as `none` and freeze the swipe.
          "touch-pan-x",
          className,
        )}
        role="dialog"
        // INFO: DESIGN.md § 4.7.3. The name is what makes the scrim and the chrome resolve around the travelling picture. It cannot reach the slide: that one carries its own name and is lifted into a group above this, which is exactly what lets the photo arrive at full strength.
        style={{ viewTransitionName: MEDIA_VIEWER_NAME }}
        aria-modal="true"
        aria-label="첨부 크게 보기"
      >
        {/* INFO: DESIGN.md § 4.7.3. The floor, and it arrives **after** the § 4.7.3. morph rather than with it — the photo travels over the screen it was opened from, and only once it has landed does the room behind it go dark. Sequenced rather than simultaneous, so the two motions are read one at a time. */}
        {/* WARN: `-z-10` and not a background on the root. This box is `absolute` and the track is in flow, so at `z-auto` it would paint *over* every slide — a positioned element outranks in-flow content in the same stacking context, whatever the DOM order says. */}
        <div
          className={cn(
            // INFO: DESIGN.md § 4.7.3. It fades on the morph's own duration rather than `--duration-state`, which is what the chrome above it uses. 200ms across a full-screen plate going from nothing to opaque is a cut with a ramp on it; the floor is the largest single change of colour the app makes, and it has to be read as arriving.
            "pointer-events-none absolute inset-0 -z-10 bg-canvas ease-out",
            "transition-opacity duration-[var(--duration-media-morph)]",
            !hasMorphSettled && "opacity-0",
          )}
          style={backgroundColor ? { backgroundColor } : undefined}
          aria-hidden
        />
        {/* WARN: DESIGN.md § 7.10. Both bars are absolute and sit *over* the track, which is what makes the chrome toggleable at all — laid out as rows they would resize the track every time they left, and the photo would jump and re-snap under the tap that hid them. */}
        {/* WARN: `pointer-events-none` on the bar and `auto` on its controls. The bars span the full width over a photo whose own taps toggle them and whose hold is the OS's (§ 8.11.), so an inert strip that still swallowed pointers would kill both gestures across the top and bottom of every slide. */}
        <div
          className={cn(
            // WARN: DESIGN.md § 7.10. The gradient runs well past the controls and fades through a midpoint rather than straight to nothing. It used to end at the bar's own padding, which put the caption where the wash had already thinned to about a third — unreadable over a white photo, which is the surface this exists for.
            "pointer-events-none absolute inset-x-0 top-0 z-10 flex items-start gap-xs bg-gradient-to-b from-scrim/40 via-scrim/15 to-transparent p-sm pt-[max(var(--spacing-sm),env(safe-area-inset-top))] pb-2xl transition-opacity duration-200",
            // WARN: The descendants' `pointer-events` are revoked with the opacity, not just their `tabIndex`. `opacity-0` alone leaves every control here fully tappable while invisible — the tap that hid the chrome, repeated in the same corner, would close the viewer.
            // INFO: DESIGN.md § 4.7.3. Held back until the opening morph has landed, with the floor above — the chrome is what says "you are in the viewer", and said while the picture is still crossing the screen it arrives before the thing it describes.
            (!isChromeVisible || !hasMorphSettled) && "opacity-0 [&_*]:pointer-events-none",
          )}
        >
          {/* INFO: DESIGN.md § 7.15. Leaving a full-screen surface ticks, as a route's 뒤로 already does — what stays silent there is a sheet or a dialog's dismissal. */}
          <IconButton
            className="pointer-events-auto shrink-0"
            buttonClassName="text-on-scrim hover:bg-on-scrim/15 hover:text-on-scrim"
            Icon={X}
            haptic
            tabIndex={isChromeVisible ? undefined : -1}
            aria-label="닫기"
            onClick={handleClose}
          />
          {/* INFO: DESIGN.md § 7.10. Who sent the slide and when — the identity half of the bar, where the action icons used to be. The position joins the caption because both answer "where am I", and neither earns a row of its own on a mobile shell. */}
          {/* WARN: A `button` only where there is somewhere to go, and a `div` otherwise. A pressable-looking block that answered nothing is worse here than in the bars, because the chevron is the only thing saying it travels at all. */}
          {sentMessageId !== null && onOpenMessage ? (
            // INFO: DESIGN.md § 7.15. The block travels to another screen, which is the switch the tab bar already ticks for. `group-active:` beside its own `active:`, since the tap lands on the overlay.
            <HapticTarget className="pointer-events-auto flex min-w-0 flex-1">
              <button
                className="w-full min-w-0 cursor-pointer rounded-sm py-2xs text-left transition-colors outline-none group-active:bg-on-scrim/10 hover:bg-on-scrim/10 focus-visible:ring-2 focus-visible:ring-primary active:bg-on-scrim/10"
                type="button"
                tabIndex={isChromeVisible ? undefined : -1}
                // INFO: The noun follows the slide, since the track mixes photos and videos — a reader hearing 사진 over a video is the § 10. defect the bundle prompt beside it already avoids.
                aria-label={`이 ${toMediaLabel(current?.isVideo ? "video" : "photo")}을 보낸 메시지로 이동`}
                onClick={() => onOpenMessage(sentMessageId)}
              >
                <SlideIdentity caption={caption} senderName={current?.senderName} hasChevron />
              </button>
            </HapticTarget>
          ) : (
            <div className="min-w-0 flex-1 py-2xs">
              <SlideIdentity caption={caption} senderName={current?.senderName} />
            </div>
          )}
          {jump && current && (
            // INFO: DESIGN.md § 7.10. The jump, at the top right — 보관함's viewer travels to the message, 채팅's to the library, so neither offers a jump to the surface it is already on.
            // WARN: Rendered on every slide, including one with nowhere to go. It answers with a toast instead of vanishing, which is what keeps a control out of the bar's own layout while the reader swipes past a library-only upload.
            <IconButton
              className="pointer-events-auto shrink-0"
              buttonClassName="text-on-scrim hover:bg-on-scrim/15 hover:text-on-scrim"
              Icon={jump.Icon}
              haptic
              tabIndex={isChromeVisible ? undefined : -1}
              aria-label={jump.label}
              onClick={() => jump.onSelect(current)}
            />
          )}
        </div>
        {/* INFO: Native scroll snapping is the horizontal swipe of REQUIREMENTS.md § 8.1. — it costs no gesture code and matches the platform's own momentum. */}
        {/* WARN: REQUIREMENTS.md § 18. #6. A zoomed slide freezes the track, or the pan competes with the swipe for the same finger and the photo changes under it. `overflow-x-hidden` holds `scrollLeft` where it is, so the slide is still the one the reader zoomed when it lifts. */}
        {/* WARN: `overflow-y-hidden` is written out, never left to default — CSS computes a `visible` axis to `auto` once the other is not visible, so a slide one pixel too tall turns this into a scroller the reader pans vertically between swipes. */}
        <div
          ref={captureTrack}
          className={cn(
            "scrollbar-hidden flex min-h-0 flex-1 snap-x snap-mandatory overflow-y-hidden overscroll-x-contain",
            zoom.isZoomed ? "overflow-x-hidden" : "overflow-x-auto",
          )}
          onClick={handleSurfaceClick}
          onPointerDown={cancelPendingStep}
          onScroll={handleScroll}
          onWheel={cancelPendingStep}
        >
          {cells.map((cell, slideIndex) => {
            const isCurrent = slideIndex === index;

            return (
              <div
                key={cell.id}
                // INFO: DESIGN.md § 7.10. No padding on either axis. The slide *is* the screen, and the asset's own `object-contain` is what keeps it inside — a gutter only makes the picture smaller than the screen can hold.
                // WARN: REQUIREMENTS.md § 8.1. `snap-always` is what holds one drag to one slide. Without it a flick's momentum runs through every snap point it passes, and a track that spans the conversation answers a firm swipe with five photos gone by.
                className="flex w-full shrink-0 snap-center snap-always items-center justify-center"
              >
                {/* WARN: REQUIREMENTS.md § 10. Only the neighbours are mounted at all. Every slide used to request its original on mount, which was bounded by `MAX_MEDIA_PER_MESSAGE` in a chat bubble but is the whole loaded library here — opening one photo after three pages of scrolling started 180 requests for objects of up to `MAX_IMAGE_SIZE`. */}
                {Math.abs(slideIndex - index) > 1 ? (
                  <SlidePlaceholder cell={cell} />
                ) : cell.isVideo ? (
                  <VideoSlide
                    cell={cell}
                    isMorphTarget={isCurrent}
                    onPlayingChange={handlePlayingChange}
                  />
                ) : (
                  // WARN: REQUIREMENTS.md § 18. #6. Only the slide on screen takes the gesture. A neighbour is half a swipe away and mounted, so handlers on it would answer a pinch that started over the photo the reader can see.
                  <ImageSlide
                    cell={cell}
                    zoom={isCurrent ? zoom : undefined}
                    isCurrent={isCurrent}
                    isMorphTarget={isCurrent}
                    hasMorphSettled={hasMorphSettled}
                  />
                )}
              </div>
            );
          })}
        </div>
        {/* INFO: DESIGN.md § 7.10. The step controls, for a pointer that has no swipe — the desktop reader's equivalent of the arrow keys `handleOverlayKeyDown` answers. */}
        {/* WARN: AGENTS.md § 4.2. Drawn on every pointer, never gated on `hover`. A control that exists only where `@media (hover: hover)` matches is a different control set per device, which § 4.2. allows for `useIsIos` alone — so these ride the chrome instead, appearing and fading with the bars on the same tap. On touch they are simply a second way to do what the swipe already does. */}
        {/* WARN: The same `pointer-events` revocation as the bars, and here it matters most: this strip spans the whole slide, so left inert-but-tappable it would swallow the pinch and the § 8.11. hold across both edges of every photo. */}
        <div
          className={cn(
            "pointer-events-none absolute inset-0 z-10 flex items-center justify-between px-xs transition-opacity duration-200",
            // INFO: DESIGN.md § 4.7.3. Held back until the opening morph has landed, with the floor above — the chrome is what says "you are in the viewer", and said while the picture is still crossing the screen it arrives before the thing it describes.
            (!isChromeVisible || !hasMorphSettled) && "opacity-0 [&_*]:pointer-events-none",
          )}
          onPointerDown={handleChevronPointerDown}
          onPointerUp={handleChevronPointerUp}
        >
          {/* WARN: `invisible` at the ends rather than unmounted, so the surviving arrow does not slide across the screen when the reader reaches the first or last slide. § 8.1.'s track also grows at both edges mid-open, which would make an unmounted control blink back into existence. */}
          <IconButton
            className={cn("pointer-events-auto shrink-0 touch-none", !canStepBack && "invisible")}
            buttonClassName="bg-scrim/70 text-on-scrim shadow-floating ring-1 ring-on-scrim/20 backdrop-blur-sm hover:bg-scrim/80 hover:text-on-scrim"
            Icon={ChevronLeft}
            haptic
            tabIndex={isChromeVisible && canStepBack ? undefined : -1}
            aria-label="이전 항목"
            onClick={() => step(-1)}
          />
          <IconButton
            className={cn(
              "pointer-events-auto shrink-0 touch-none",
              !canStepForward && "invisible",
            )}
            buttonClassName="bg-scrim/70 text-on-scrim shadow-floating ring-1 ring-on-scrim/20 backdrop-blur-sm hover:bg-scrim/80 hover:text-on-scrim"
            Icon={ChevronRight}
            haptic
            tabIndex={isChromeVisible && canStepForward ? undefined : -1}
            aria-label="다음 항목"
            onClick={() => step(1)}
          />
        </div>
        {/* INFO: DESIGN.md § 7.10. The actions, at the bottom — the two save routes flank the pair that acts on the photo itself, so the destructive one is never at the row's outer edge where a thumb lands first. */}
        {/* WARN: The middle group is one pill and the flanking controls are their own, which is what lets 삭제 and 사진 사용하기 come and go per slide without moving 공유 or 다운 under a travelling finger. Inside the pill their absence costs the pill its width and nothing else — the hole the old right-aligned row punched mid-swipe. */}
        <div
          className={cn(
            // WARN: DESIGN.md § 7.10. A gradient here too, which this bar deliberately went without for a long time on the argument that a second one frames the photo from below. The discs' own fill is what it relied on instead, and over the viewer's opaque `scrim` — which is most of the screen on a portrait slide — `scrim` on `scrim` is a control with no edge at all. The ring below answers that; the wash is what carries the group over a bright photo.
            "pointer-events-none absolute inset-x-0 bottom-0 z-10 flex flex-col gap-sm bg-gradient-to-t from-scrim/40 via-scrim/15 to-transparent p-md pt-2xl pb-[max(var(--spacing-md),env(safe-area-inset-bottom))] transition-opacity duration-200",
            // WARN: As the top bar — hidden controls must stop receiving pointers, or an invisible 삭제 sits under the reader's next tap.
            // INFO: DESIGN.md § 4.7.3. Held back until the opening morph has landed, with the floor above — the chrome is what says "you are in the viewer", and said while the picture is still crossing the screen it arrives before the thing it describes.
            (!isChromeVisible || !hasMorphSettled) && "opacity-0 [&_*]:pointer-events-none",
          )}
        >
          {/* INFO: DESIGN.md § 7.10. The bubble the reader is inside, and where in it they are — withheld on a bubble of one, exactly as the count it carries always was. */}
          {current && bubble.length > 1 && (
            <SlideFilmstrip
              cells={bubble}
              activeId={current.id}
              isReachable={isChromeVisible && !zoom.isZoomed}
              onSelect={goToSlide}
            />
          )}
          <div className="flex items-center justify-center gap-sm">
            {/* WARN: REQUIREMENTS.md § 8.11. Withheld on iOS alone, where it lands in Files rather than the photo library the control beside it reaches — and where holding the slide is already the OS's own route to 사진에 저장. */}
            {!isIosDevice &&
              current &&
              (onDownload ? (
                // INFO: REQUIREMENTS.md § 8.1. A button, because the caller has the rest of the bubble to offer before anything is saved — the anchor below cannot ask a question first.
                <IconButton
                  className={cn("pointer-events-auto shrink-0", !downloadUrl && "invisible")}
                  buttonClassName="bg-scrim/70 text-on-scrim shadow-floating ring-1 ring-on-scrim/20 backdrop-blur-sm hover:bg-scrim/80 hover:text-on-scrim"
                  Icon={Download}
                  haptic
                  tabIndex={isChromeVisible && downloadUrl ? undefined : -1}
                  aria-label="원본 저장"
                  {...saveGate.blockedProps}
                  onClick={saveGate.guard(() => downloadUrl && onDownload(current.id))}
                />
              ) : (
                // WARN: No `download` attribute — the route 302s to R2 and the spec drops it once the navigation resolves cross-origin. `toMediaDownloadUrl` signs the disposition into the object instead.
                <a
                  className={cn(
                    "pointer-events-auto relative inline-flex size-11 shrink-0 items-center justify-center rounded-full bg-scrim/70 text-on-scrim shadow-floating ring-1 ring-on-scrim/20 backdrop-blur-sm transition-colors outline-none hover:bg-scrim/80 focus-visible:ring-2 focus-visible:ring-primary",
                    !downloadUrl && "invisible",
                  )}
                  href={downloadUrl ?? undefined}
                  tabIndex={isChromeVisible && downloadUrl ? undefined : -1}
                  aria-label="원본 저장"
                  {...saveGate.blockedProps}
                  // WARN: The anchor's own activation is what has to be stopped, and `aria-disabled` suppresses nothing — left to run, the href navigates the PWA at a 302 that cannot resolve.
                  onClick={(event) => {
                    if (!saveGate.isBlocked) {
                      return;
                    }

                    event.preventDefault();
                    saveGate.refuse();
                  }}
                >
                  <Download className="size-5" strokeWidth={1.75} />
                  {/* WARN: DESIGN.md § 7.15. Inside an `<a>` it is the last child and takes no `forwardsTap` — the click bubbles to the anchor on its own, and a forwarded one would fire the navigation twice. */}
                  {!saveGate.isBlocked && <HapticTap />}
                </a>
              ))}
            {(canDeleteCurrent || canApplyPhoto) && current && (
              // WARN: No inner padding. Each control is a 44 circle in a 44-tall pill, so with the ends flush the hover disc *is* the pill's end cap — padded by `2xs` it stopped 4px short and left a sliver of pill outside a round highlight, which reads as the control being off-centre in its own group.
              <div className="pointer-events-auto flex items-center overflow-hidden rounded-full bg-scrim/70 shadow-floating ring-1 ring-on-scrim/20 backdrop-blur-sm">
                {deletion && canDeleteCurrent && (
                  // INFO: DESIGN.md § 7.10. Confirmed wherever it renders, since a control beside a per-slide save does not say its own reach — in 채팅 it is the same delete the § 8.11. action sheet reaches.
                  // INFO: REQUIREMENTS.md § 8.1. Unmounted rather than hidden, now that it sits in a group of its own — the pill simply narrows, where the old row left a 44px hole between two live controls on every slide the other participant sent.
                  <IconButton
                    buttonClassName="text-semantic-error hover:bg-on-scrim/15 hover:text-semantic-error-hover"
                    Icon={Trash2}
                    haptic
                    tabIndex={isChromeVisible ? undefined : -1}
                    aria-label={deletion.label}
                    {...deleteGate.blockedProps}
                    onClick={deleteGate.guard(() => deletion.onSelect(current.id))}
                  />
                )}
                {onApplyPhoto && canApplyPhoto && (
                  // INFO: REQUIREMENTS.md § 12.1. A video is offered too — a profile cover may be one. Absent on a draft, which has no stored object to crop, and on a video past § 12.1.'s caps: that clip fits no slot and the sheet would open on nothing.
                  <IconButton
                    buttonClassName="text-on-scrim hover:bg-on-scrim/15 hover:text-on-scrim"
                    Icon={ImagePlus}
                    haptic
                    tabIndex={isChromeVisible ? undefined : -1}
                    aria-label="사진 사용하기"
                    {...applyPhotoGate.blockedProps}
                    onClick={applyPhotoGate.guard(() => onApplyPhoto(current.id, current.isVideo))}
                  />
                )}
              </div>
            )}
            {handleSheet && current && (
              <IconButton
                className={cn("pointer-events-auto shrink-0", !downloadUrl && "invisible")}
                buttonClassName="bg-scrim/70 text-on-scrim shadow-floating ring-1 ring-on-scrim/20 backdrop-blur-sm hover:bg-scrim/80 hover:text-on-scrim"
                Icon={isIosDevice ? Download : Share}
                haptic
                tabIndex={isChromeVisible && downloadUrl ? undefined : -1}
                aria-label={isIosDevice ? "저장/공유" : "공유"}
                {...sheetGate.blockedProps}
                onClick={sheetGate.guard(() => handleSheet(current.id))}
              />
            )}
          </div>
        </div>
      </div>
    </ShellOverlay>
  );

  /**
   * DESIGN.md § 4.7.3. Both ways out route through here, so the slide collapses back
   * into its thumbnail whichever the reader used — 닫기 or `Escape`.
   *
   * WARN: A plain function declaration and not a `useCallback`. `useModalOverlay` holds its handler in a ref for exactly this — so identity here is no less stable than the `onClose` it replaces.
   */
  function handleClose() {
    endMediaMorph(current ? (findMorphOrigin?.(current.id) ?? null) : null, onClose);
  }

  /**
   * REQUIREMENTS.md § 8.1. `ArrowLeft` / `ArrowRight` are the desktop swipe. Reached
   * through `useModalOverlay`, which is what knows whether a sheet or a dialog is open
   * over the viewer and owns the keyboard while one is.
   *
   * WARN: `preventDefault`, or the key does its own thing as well — the track is the focusable scroller under the reader, so the browser scrolls it a line at a time on top of the step and lands the offset between two slides.
   * INFO: Nothing is done for a key that arrives while the slide is zoomed; `step` refuses it, the way `overflow-x-hidden` refuses the swipe (§ 18. #6.).
   */
  // WARN: A swipe that lands on a chevron is a swipe on the chevron's `HapticTap`, and its strip is a sibling of the track — the drag chains to nothing and § 8.1.'s swipe is simply lost. The buttons are `touch-none` so the browser never claims the drag either, and a horizontal pull past the slop steps the track the way the swipe would have.
  function handleChevronPointerDown(event: PointerEvent<HTMLDivElement>) {
    chevronPressRef.current = event.target === event.currentTarget ? null : event.clientX;
  }

  function handleChevronPointerUp(event: PointerEvent<HTMLDivElement>) {
    const from = chevronPressRef.current;

    chevronPressRef.current = null;

    if (from === null) {
      return;
    }

    const travel = event.clientX - from;

    if (Math.abs(travel) >= GESTURE_SLOP) {
      step(travel < 0 ? 1 : -1);
    }
  }

  function handleOverlayKeyDown(event: KeyboardEvent) {
    if (event.key !== "ArrowLeft" && event.key !== "ArrowRight") {
      return;
    }

    event.preventDefault();
    step(event.key === "ArrowLeft" ? -1 : 1);
  }

  /**
   * Moves the reader one slide, for the arrow keys and the two step controls.
   *
   * INFO: It scrolls the track and nothing else — `handleScroll` is what names the new slide, so a step and a swipe reach `heldId` by the same path and § 8.1.'s paging follows from either without knowing which happened.
   * WARN: The origin is the **pending** step where there is one, never the track's own offset. Held down, an arrow key repeats far faster than a smooth scroll completes, and measuring the live `scrollLeft` mid-animation rounds back to the slide being left — every repeat would re-issue the step already in flight.
   */
  function step(delta: number) {
    const track = trackRef.current;

    // INFO: § 18. #6. A zoomed slide freezes the track, and a step is the same crossing the swipe is.
    if (!track || zoom.isZoomed) {
      return;
    }

    const from = steppedRef.current ?? Math.round(track.scrollLeft / track.clientWidth);
    const next = Math.min(Math.max(from + delta, 0), cells.length - 1);

    if (next === from) {
      return;
    }

    steppedRef.current = next;
    track.scrollTo({ left: track.clientWidth * next, behavior: "smooth" });
  }

  /**
   * DESIGN.md § 7.10. Where a thumbnail tap lands, and it is `step`'s arithmetic with
   * the destination named rather than counted.
   *
   * INFO: The pending destination is recorded for `step`'s reason — an arrow key pressed while this scroll is still running has to measure from where the tap sent the reader, not from the slide it has not left yet.
   * WARN: The tap is refused against the **pending** slide, never `index` alone. `index` follows `heldId`, which does not move until the track has crossed half a slide — so a tap on the thumbnail still marked active, made while a previous tap's scroll runs, would be dropped and leave the reader travelling to the slide they had just changed their mind about.
   * WARN: A **live** crossing travels instantly. It is one frame of a scrub the reader's own hand is making, and a smooth scroll per frame both lags the film and queues behind the crossings after it — the photo would arrive at slides the finger left long ago, one after another.
   */
  function goToSlide(cell: MediaCell, isLive: boolean) {
    const track = trackRef.current;
    const next = cells.findIndex((slide) => slide.id === cell.id);

    // INFO: § 18. #6. A zoomed slide freezes the track, and a tap on the strip is the same crossing the swipe is.
    if (!track || zoom.isZoomed || next < 0 || next === (steppedRef.current ?? index)) {
      return;
    }

    steppedRef.current = next;
    track.scrollTo({ left: track.clientWidth * next, behavior: isLive ? "auto" : "smooth" });
  }

  /**
   * Puts the track on `initialIndex`, or declines to — see the two effects' WARN.
   *
   * WARN: A `clientWidth` of `0` is refused rather than multiplied. It is the track reporting that it has not been laid out yet, and `0 * initialIndex` is a scroll to the first slide that would then mark the open as asserted and stop the pass that could have got it right.
   */
  function openAtInitialIndex() {
    const track = trackRef.current;

    if (hasOpenedRef.current || !track || track.clientWidth === 0) {
      return;
    }

    hasOpenedRef.current = true;
    track.scrollTo({ left: track.clientWidth * initialIndex });
  }

  // INFO: The ref and the state are the same element read two ways — see the state's own WARN.
  function captureTrack(element: Nullable<HTMLDivElement>) {
    trackRef.current = element;
    setTrackElement(element);
  }

  /**
   * Gives up on a step the reader has overtaken, so the next one measures the track.
   *
   * WARN: `pointerdown` and `wheel` are the two ways a smooth scroll is interrupted — a finger or a mouse on the track, and a trackpad — and between them they cover every input that is not a key. Neither fires while the programmatic scroll runs on its own, which is what keeps the pending destination alive across a held arrow key.
   */
  function cancelPendingStep() {
    steppedRef.current = null;
  }

  function handleScroll() {
    const track = trackRef.current;

    if (!track) {
      return;
    }

    const position = Math.round(track.scrollLeft / track.clientWidth);

    // INFO: The step has landed, so the next arrow press measures from the track again.
    if (steppedRef.current === position) {
      steppedRef.current = null;
    }

    // WARN: The slide is read out of `cells` rather than kept as the bare offset, so nothing here can name a position the track does not have — a shrunken track leaves the browser's own clamped `scrollLeft` reported one frame before the correction lands.
    const arrived = cells[position];

    // WARN: REQUIREMENTS.md § 18. #6. The zoom belongs to the slide it was applied to, so arriving at another one drops it. Guarded on a real crossing rather than on every `scroll` frame, which would fight a pinch that is still in progress.
    if (arrived && arrived.id !== heldId) {
      // INFO: § 8.1. The id travels with the offset, so a track replaced mid-read reconciles against the slide the reader actually swiped to rather than the one it opened on.
      setHeldId(arrived.id);
      resetZoom();
    }
  }

  /**
   * DESIGN.md § 7.10. A tap anywhere on the slide toggles the chrome, so a photo can
   * be looked at with nothing over it.
   *
   * WARN: It does **not** close, unlike every other overlay's scrim (§ 3.5.1.). The photo is `object-contain`, so a portrait one leaves most of the screen as scrim — and § 8.1.'s track is a stream the reader swipes through rather than a single photo they opened, where a tap landing a few pixels off the image threw them out of it. 닫기 and `Escape` are the only ways out, and neither can be hit by accident.
   * WARN: On a `<video>` only the transport belongs to the player (`isOnPlayer`). The picture itself toggles, because the platform toggles its own controls on the same tap — and a clip that fills the height leaves no scrim to tap otherwise.
   * WARN: It must stay a `click`: a `pointerdown` here would fire under the OS hold that § 8.11. deliberately leaves to iOS, and the chrome would vanish as the 사진에 저장 menu opened over it.
   */
  function handleSurfaceClick(event: MouseEvent<HTMLDivElement>) {
    const target = event.target as HTMLElement;

    if (target.closest("a, button") || isOnPlayer(target, event.clientX, event.clientY)) {
      return;
    }

    // WARN: DESIGN.md § 7.10. While a clip plays a tap only puts the chrome away, never back — whether the platform's controls are up cannot be read, so a toggle runs against them half the time. Pausing is what brings it back.
    const player = target.closest("video");

    if (player && !player.paused) {
      setIsChromeVisible(false);

      return;
    }

    setIsChromeVisible((visible) => !visible);
  }

  /**
   * DESIGN.md § 7.10. The chrome follows playback the way the platform's transport does: away when a clip starts, back when it pauses or ends.
   *
   * INFO: This is what keeps the two sets of controls moving together. Starting a clip from the transport with the chrome already hidden leaves it hidden, and pausing brings both back on the one tap.
   */
  function handlePlayingChange(isPlaying: boolean) {
    setIsChromeVisible(!isPlaying);
  }
}

export type SlideIdentityProps = {
  className?: string;
  caption: string;
  senderName?: Nullable<string>;
  /** DESIGN.md § 7.10. Drawn only where the block travels, since it is the one thing that says so. */
  hasChevron?: boolean;
};

/**
 * DESIGN.md § 7.10. The top bar's identity block — who sent the slide, and when it
 * was sent beside where it sits.
 *
 * INFO: Its own component because it is drawn inside a `button` where the slide has a message to travel to and a plain `div` where it does not, and the two must not drift apart.
 */
function SlideIdentity({ className, caption, senderName, hasChevron }: SlideIdentityProps) {
  return (
    <div className={className}>
      {senderName && <p className="truncate text-button-sm text-on-scrim">{senderName}</p>}
      {caption && (
        <p className="flex items-center gap-2xs text-caption text-on-scrim/75">
          <span className="truncate">{caption}</span>
          {/* INFO: The only thing saying the block travels, so it rides with the caption rather than sitting at the row's edge where it would read as a control of its own. */}
          {hasChevron && <ChevronRight className="size-3 shrink-0" strokeWidth={2} />}
        </p>
      )}
    </div>
  );
}

/**
 * DESIGN.md § 7.10. The stretch of the track the slide's **own bubble** occupies —
 * what the filmstrip draws and what the position counts, so both answer `2장 중 1번`
 * on the first of two and re-count the moment a swipe crosses into a bubble of four.
 *
 * WARN: Counting the track instead would answer a question nobody asked. § 8.1.'s track spans the conversation, so it reads `137 / 300` — a number that changes meaning with how far back the reader has scrolled and tells them nothing about the group they are looking at. The bubble is the only grouping the sender chose and the reader ever saw (§ 6.).
 * INFO: The run is contiguous because both tracks are ordered so that one send's attachments sit together — § 8.1. by `(message_id, sort_order)`, and § 10. by a `created_at` every attachment of one send shares.
 * INFO: Empty on a slide with no bubble (a library-only upload, or a draft before § 8.1.'s track arrives) and on a bubble of one — a strip of one thumbnail is a count of nothing.
 */
function toBubbleRun(index: number, cells: MediaCell[]): MediaCell[] {
  const messageId = cells[index]?.messageId;

  if (messageId === null || messageId === undefined) {
    return [];
  }

  let start = index;
  let end = index;

  while (start > 0 && cells[start - 1]?.messageId === messageId) {
    start -= 1;
  }

  while (end < cells.length - 1 && cells[end + 1]?.messageId === messageId) {
    end += 1;
  }

  return end > start ? cells.slice(start, end + 1) : [];
}

export type SlideFilmstripProps = {
  className?: string;
  /** The bubble's own attachments, in send order (`toBubbleRun`). */
  cells: MediaCell[];
  activeId: MediaId;
  /**
   * Whether the strip may be used at all — the chrome around it is up, and the slide
   * is not zoomed.
   *
   * WARN: REQUIREMENTS.md § 18. #6. The zoom half is not decoration. `goToSlide` refuses a crossing made over a zoomed slide, exactly as `overflow-x-hidden` refuses the swipe, and this row has no way to hear that refusal — left live it moved under the reader's hand, reported a notch nobody acted on, and stranded the ring and the counter on a thumbnail the strip was no longer showing, for as long as the zoom lasted and past it. The step chevrons are withheld on the same condition, through `canStepBack` / `canStepForward`.
   */
  isReachable: boolean;
  /** `isLive` marks a crossing made **under a hand still on the strip**, which travels instantly rather than easing — see the notch's own WARN. */
  onSelect: (cell: MediaCell, isLive: boolean) => void;
};

/**
 * DESIGN.md § 7.10. The bubble laid out as thumbnails under the slide, with the
 * position beneath them — a tap crosses to a sibling without swiping through the ones
 * between, and the row itself is dragged under a notch at its centre.
 *
 * WARN: The row is **not** a scroller, and `useInertialStrip` carries the whole argument — the short version is that a scroller's position belongs to the browser, so this component could only guess whether a `scroll` was the reader's or its own centring, and a wrong guess closed a loop with the viewer's track that froze the tab.
 * WARN: The end insets are the first cell's **margin**, half the row's width less half a thumbnail — exactly the room the first and last slide need to reach the middle. A percentage margin resolves against the row, which is the shell's width, so it follows the shell rather than a number written twice.
 * WARN: The row spans the shell, and the band beside a short strip is therefore inside it rather than transparent to the slide behind. That is the price of the notch: the row **is** the control, so a drag anywhere along it has to move the film. The chrome toggle and the § 8.11. hold keep the rest of the screen, which is all of it above this bar.
 */
function SlideFilmstrip({
  className,
  cells,
  activeId,
  isReachable,
  onSelect,
}: SlideFilmstripProps) {
  // INFO: The open is a jump and every crossing after it is a follow, so the first move is instant and the rest are eased — an animated one at mount would be read as the strip arriving already moving.
  const hasSettledRef = useRef(false);
  const index = cells.findIndex((cell) => cell.id === activeId);
  // INFO: § 10.'s unit, so a bubble that is all video counts in 개 — `toCellNoun` calls a mixed one a photo, which is the same latitude 장 takes there.
  const unit = toMediaCountUnit(cells.every((cell) => cell.isVideo) ? "video" : "photo");
  /**
   * DESIGN.md § 7.10. The crossing made **under the hand that is making it**, so the
   * photo above follows the film rather than waiting for it to be let go.
   *
   * INFO: Marked live, which is what makes the track travel instantly. A smooth scroll per crossing cannot keep up with a finger and lands on a slide the reader has already dragged past.
   * INFO: Reported once per notch by the hook, whatever the frame rate — the dedupe is exact because the row's position is a value it owns rather than one React has yet to re-render with.
   */
  const { rowRef, moveTo, dragProps } = useInertialStrip<HTMLDivElement>({
    count: cells.length,
    onNotch: (notched) => {
      const cell = cells[notched];

      if (cell) {
        onSelect(cell, true);
      }
    },
  });

  /**
   * DESIGN.md § 7.10. Puts the active thumbnail on the notch — on the open, where the
   * reader may have tapped the last of nine, and on every crossing made anywhere else.
   *
   * WARN: A layout effect, so the row is already on the right thumbnail in the frame it first paints — the opening morph (§ 4.7.3.) lands on a viewer whose chrome must not then be seen correcting itself.
   * WARN: The run's own length is a dependency as well as the held slide. § 8.1.'s track is replaced as pages commit, so a bubble can gain the siblings that were past the window's edge while the reader stands still — and the thumbnails inserted before theirs push it off the notch with nothing to notice it.
   * INFO: A crossing the strip itself reported comes back through here and stops inside `moveTo`, which refuses an index it already holds.
   */
  useLayoutEffect(() => {
    if (index < 0) {
      return;
    }

    moveTo(index, hasSettledRef.current);
    hasSettledRef.current = true;
  }, [index, cells.length, moveTo]);

  return (
    // WARN: DESIGN.md § 7.10. Inert like the bar around it, with `pointer-events-auto` on the row's viewport alone. This block spans the bar's width, so claiming pointers here would swallow the chrome toggle and the § 8.11. hold across a band beside a two-thumbnail strip.
    <div className={cn("flex flex-col items-center gap-2xs", className)}>
      {/* WARN: `touch-none`, because the row is dragged from JS — left at `pan-x` the browser looks for a scrollable ancestor to pan and takes the pointer stream away mid-scrub. Nothing is given up: the viewer's root already reserves the vertical axis (§ 7.10.). */}
      {/* WARN: The gesture is withheld whole rather than refused inside `onNotch` — see `isReachable`. The row keeps its place and its ring, and a pinch that reaches past the photo finds nothing here to take it. */}
      <div
        className={cn(
          // INFO: Left to inherit the bar's own `pointer-events-none` where the strip is withheld, which takes the thumbnails' taps with it — the `tabIndex` below already drops them from the tab sequence on the same condition.
          "w-full touch-none overflow-hidden",
          isReachable && "pointer-events-auto cursor-grab active:cursor-grabbing",
        )}
        role="group"
        aria-label="이 메시지의 첨부"
        {...(isReachable ? dragProps : {})}
      >
        <div
          ref={rowRef}
          className="flex w-full gap-2xs will-change-transform [&>*:first-child]:ml-[calc(50%-1.5rem)]"
        >
          {cells.map((cell) => {
            const isActive = cell.id === activeId;

            return (
              // INFO: DESIGN.md § 7.15. A selection among peers, which is where the tick belongs — and `keepsScroll`, since these cells tile a draggable row (§ 7.15.1.).
              <HapticTarget
                key={cell.id}
                className="shrink-0"
                // WARN: DESIGN.md § 7.15. The row's own `touch-action` repeated, since the gesture starts on the overlay — without it the browser claims the drag before `dragProps` sees it.
                overlayClassName="touch-none"
                keepsScroll
              >
                <button
                  // INFO: A fixed square whatever the asset's shape is, so the strip reads as one row of equals rather than as a second, smaller track.
                  // WARN: The focus ring is an `outline` drawn inward, not a `ring`. An outward one is clipped by the row's viewport on the end thumbnails, and `ring-inset` is a box-shadow — which paints *under* this element's own content, and the picture fills the box exactly. An outline is painted after the descendants, so a negative offset puts it over the photo where it can be seen.
                  className="relative block size-12 cursor-pointer overflow-hidden rounded-sm bg-on-scrim/10 outline-none focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-primary"
                  type="button"
                  // WARN: AGENTS.md § 4.2. Roving tabindex over the strip, and the arrows that would move it are the viewer's own — `handleOverlayKeyDown` steps the track, which is what moves the mark here. Nine thumbnails in the tab sequence would put the bottom bar's controls nine stops away.
                  tabIndex={isReachable && isActive ? undefined : -1}
                  aria-current={isActive}
                  aria-label={`${cells.indexOf(cell) + 1}번째 ${toMediaLabel(cell.isVideo ? "video" : "photo")}`}
                  // INFO: Not live: a tap names its destination outright, so the track eases there as it does for the step controls.
                  onClick={() => onSelect(cell, false)}
                >
                  {cell.previewUrl && (
                    <PreloadImage
                      className="size-full"
                      imgClassName="size-full object-cover"
                      src={cell.previewUrl}
                      hasSkeleton={false}
                      blurhash={cell.blurhash}
                      blurhashRatio={toCellRatio(cell)}
                      alt=""
                    />
                  )}
                  {/* INFO: DESIGN.md § 7.10. The 2px `primary` mark on the slide being read, inset for the reason § 13.8.'s results row records — an outward ring on the first or last thumbnail is clipped away by the row's own viewport. */}
                  {/* WARN: An element over the picture, never `ring-inset` on the button. An inset ring is a box-shadow, which paints under the element's own content — and the thumbnail fills the box exactly, so it covered the mark completely. */}
                  {isActive && (
                    <span className="pointer-events-none absolute inset-0 rounded-sm ring-2 ring-primary ring-inset" />
                  )}
                  {/* INFO: DESIGN.md § 6.5. The video tile's own glyph, at the size this box has for one — a strip of squares says nothing else about which of them plays. */}
                  {cell.isVideo && (
                    <span className="pointer-events-none absolute inset-0 flex items-center justify-center">
                      <Play className="size-4 fill-on-scrim text-on-scrim drop-shadow" />
                    </span>
                  )}
                </button>
              </HapticTarget>
            );
          })}
        </div>
      </div>
      {/* INFO: DESIGN.md § 7.10. The position, moved out of the top bar's caption to sit under the thumbnails it counts. */}
      <p className="flex items-center gap-2xs text-caption text-on-scrim/75">
        <Images className="size-3.5 shrink-0" strokeWidth={1.75} />
        {`${cells.length}${unit} 중 ${index + 1}번`}
      </p>
    </div>
  );
}

/**
 * DESIGN.md § 7.10. Keeps a wheel from reaching the document behind the viewer, which
 * is the app's own scroller (§ 3.3.).
 *
 * WARN: The horizontal half is let through on purpose — it is how a trackpad crosses the § 8.1. track, and the only route a pointer has to the swipe besides the two chevrons. Refusing every wheel took that away.
 * INFO: `ctrl`+`wheel` is the desktop pinch and is already refused by `usePinchZoom` on this same element (REQUIREMENTS.md § 18. #6.); it falls through the axis test anyway, which is why there is no branch for it.
 */
function refuseVerticalWheel(event: WheelEvent): void {
  if (Math.abs(event.deltaX) > Math.abs(event.deltaY)) {
    return;
  }

  event.preventDefault();
}

/**
 * Whether a point lands on the platform's transport inside a `<video>` — the strip
 * along the bottom of the **painted** picture, or the play glyph at its centre.
 *
 * WARN: The element and the picture are two different rectangles. `VideoSlide` is `w-full` at the stored ratio so a clip narrower than the shell still fills it, which means a portrait one is a full-width `<video>` with the picture letterboxed inside — and the gutters are `<video>` to the DOM, so the bands are measured against the picture, never the element.
 * WARN: Not the whole picture, as it used to be. A clip that fills the screen's height left no scrim to tap, so the chrome could never be brought back; the platform toggles its own controls on a tap of the picture, and the chrome now rides the same tap. A tap between two transport controls is still the player's.
 * INFO: Before metadata lands there is no picture to measure, so the whole element answers `true` — it lasts one round trip.
 */
function isOnPlayer(target: EventTarget, x: number, y: number): boolean {
  const player = target instanceof Element ? target.closest("video") : null;

  if (!player) {
    return false;
  }

  const box = player.getBoundingClientRect();
  const ratio = player.videoHeight > 0 ? player.videoWidth / player.videoHeight : 0;

  if (ratio <= 0) {
    return true;
  }

  const height = Math.min(box.height, box.width / ratio);
  const width = height * ratio;
  const centerX = box.left + box.width / 2;
  const centerY = box.top + box.height / 2;
  const isOnPicture = Math.abs(x - centerX) <= width / 2 && Math.abs(y - centerY) <= height / 2;
  const isOnTransport = y >= centerY + height / 2 - VIDEO_TRANSPORT_HEIGHT;
  const isOnPlayGlyph = Math.hypot(x - centerX, y - centerY) <= VIDEO_PLAY_GLYPH_RADIUS;

  return isOnPicture && (isOnTransport || isOnPlayGlyph);
}

/**
 * DESIGN.md § 7.10. The slide a reader is left on when the one they were holding is
 * removed under them — the next one along, or the one before it where the track ended.
 *
 * WARN: REQUIREMENTS.md § 8.1. Walked over the track as it **was**, because that is the only array the removed slide still has a position in. Counting survivors off the reader's DOM offset instead is right for one slide and wrong for every larger removal: 채팅's 메시지 삭제 takes the whole bubble, 2 to 9 slides (§ 6.), and an offset left where it stood skips every one of them that sat after the slide on screen.
 * INFO: The forward walk is `DESIGN.md § 7.10.`'s promise that the next photo is already under them; the backward one is reached only where nothing after the held slide survived, which is the end of the track.
 */
function toSurvivingSlideId(
  previous: MediaCell[],
  cells: MediaCell[],
  heldId: Optional<string>,
): Optional<string> {
  const surviving = new Set(cells.map((cell) => cell.id));
  const held = previous.findIndex((cell) => cell.id === heldId);
  const after = previous.slice(held + 1).find((cell) => surviving.has(cell.id));
  const before =
    held > 0 ? previous.slice(0, held).findLast((cell) => surviving.has(cell.id)) : undefined;

  return (after ?? before)?.id;
}

/**
 * DESIGN.md § 7.10. When the slide was sent, as the viewer's caption says it.
 *
 * WARN: `ko-KR` explicitly rather than the runtime's locale. Every other date in the
 * app is Korean copy (`AGENTS.md § 0.2.`), and a device set to another language would
 * otherwise put an English month in the middle of a Korean UI.
 */
function toSlideTimestamp(sentAt: string): string {
  return new Date(sentAt).toLocaleString("ko-KR", {
    year: "numeric",
    month: "long",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

/**
 * INFO: The box a slide occupies before it is close enough to load, at the stored
 * ratio — so scroll snapping resolves against the same geometry the real asset
 * will take and the track does not resize as slides come and go.
 */
function SlidePlaceholder({ cell }: { cell: MediaCell }) {
  return (
    // WARN: Square corners, matching the asset. A photo is never rounded here, so a rounded stand-in changes shape the instant it is replaced.
    <div className="max-h-full w-full bg-on-scrim/10" style={{ aspectRatio: toCellRatio(cell) }} />
  );
}

/**
 * DESIGN.md § 4.7.3. `isMorphTarget` marks the slide the reader is on as the half of
 * the opening morph the tile expands **into**.
 *
 * WARN: The slide on screen and no other, because `MEDIA_MORPH_NAME` is one name for the whole app — a neighbour is mounted half a swipe away, and two elements holding the name at once abort the transition rather than degrade it.
 */
function ImageSlide({
  cell,
  zoom,
  isCurrent,
  isMorphTarget,
  hasMorphSettled,
}: {
  cell: MediaCell;
  zoom?: ReturnType<typeof usePinchZoom>;
  isCurrent: boolean;
  isMorphTarget: boolean;
  hasMorphSettled: boolean;
}) {
  // INFO: DESIGN.md § 7.10. The slide the viewer opened on is already where the reader meant to be, so it waits for nothing but the morph — every other one is arrived at, and may be arrived at on the way past.
  const [isOpeningSlide] = useState(isCurrent);
  // WARN: REQUIREMENTS.md § 10. The slide on screen and no other reaches for its original — a neighbour stays on the thumbnail it is already drawn from.
  const src = useDecodedOriginal(
    cell,
    hasMorphSettled && isCurrent,
    isOpeningSlide ? 0 : ARRIVAL_DWELL,
  );

  return (
    // WARN: REQUIREMENTS.md § 18. #6. The gesture surface, and it never scales — the hook measures its box for the pan bounds, so the transform belongs to the element inside it.
    // WARN: `h-full` on both wrappers, never `max-h-full`. A percentage `max-height` resolves to `none` against a content-derived parent, so a chain of them is dead from the second link down and the image's own clamp did nothing — a portrait photo took its stored ratio's height and overflowed the screen.
    <div className="flex h-full w-full items-center justify-center" {...zoom?.surfaceProps}>
      <div className="flex h-full w-full items-center justify-center" style={zoom?.contentStyle}>
        {/* INFO: The stored ratio gives the placeholder a box to fill while the original downloads — the grid tile the user tapped came from a thumbnail, so this request starts cold. */}
        {/* INFO: The hash describes that same thumbnail, which is what makes it a stand-in for a full-size object it was never encoded from. */}
        <PreloadImage
          className="max-h-full w-full"
          imgClassName="size-full object-contain"
          // INFO: DESIGN.md § 7.10. Already decoded by the time it is named here — the hook below is what holds the thumbnail until then, so this element never enters a loading state for the original at all.
          src={src}
          // INFO: DESIGN.md § 7.10. The thumbnail the grid tile — or the chat bubble — has already decoded, so the slide opens on the picture instead of on its blur while the original arrives, and stands under it again across the swap.
          previewSrc={cell.previewUrl}
          // WARN: DESIGN.md § 7.8. No skeleton on this surface, and it is the second half of the swap being invisible. `Skeleton` is an opaque `surface-strong` pulse filling the ratio box, where the picture inside it is `object-contain` — so on a portrait photo clamped by `max-h-full` it paints the letterbox the photo leaves, beside a thumbnail that is covering the middle perfectly well. A row with a hash never reached it; one without showed a plate down both sides for the length of the swap.
          hasSkeleton={false}
          blurhash={cell.blurhash}
          blurhashRatio={toCellRatio(cell)}
          // WARN: DESIGN.md § 7.8. `contain`, matching the slide's own `object-contain` — the box carries the stored ratio but `max-h-full` clamps a portrait one on a short screen, and a `cover` blur would fill the width the letterboxed photo leaves as scrim.
          blurhashFit="contain"
          // INFO: The one surface that earns the sentence — a reader who opened a slide asked for this picture at full size, where a grid tile was only scrolled past.
          hasOfflineNotice
          alt=""
          // INFO: DESIGN.md § 4.7.3. The name rides the ratio box, so the morph lands on a rectangle that exists before a single byte of the original has arrived — the blurhash is what fills it, and the tile the reader tapped is the same picture.
          style={{
            aspectRatio: toCellRatio(cell),
            viewTransitionName: isMorphTarget ? MEDIA_MORPH_NAME : undefined,
          }}
        />
      </div>
    </div>
  );
}

/**
 * DESIGN.md § 7.10. The source a slide draws: its thumbnail, and then the stored
 * original — but **only once that original has actually decoded**.
 *
 * WARN: The swap is what this exists to hide, and pointing `src` at the original is what used to start it. `PreloadImage` resets to `loading` on a changed source, so the element gave up the picture it was holding and went back to a placeholder for the length of the download — which is exactly backwards, since a perfectly good copy of that photograph was already on screen. Decoded first, the element is handed a URL the browser can paint in the same frame.
 * WARN: DESIGN.md § 4.7.3. Held until the opening morph has landed. Started at mount the decode finishes mid-flight, and the swap arrives as a pop at the instant the transition ends rather than as a photo sharpening under a reader already looking at it.
 * WARN: No `crossOrigin`, deliberately — AGENTS.md § 5.3. `/api/media/{id}` answers a 302 into R2, and a CORS-mode request is cached separately from the plain one every `<img>` makes, so asking for one here would download the photograph twice.
 * WARN: Only a **resolved** decode is promoted. A rejection used to settle the same way, on the argument that the failure belonged to `PreloadImage` and its § 7.8. ending — but the element's own load then succeeds off the same bytes and reports the right `naturalWidth`, so that ending never arrives: it goes to `loaded`, drops the preview and fades the blur out over a picture the browser has run out of room to paint. Held here the reader keeps the thumbnail, and 원본 저장 still reaches the object.
 * WARN: `dwell` is what tells arriving from passing through, and the abort below cannot stand in for it — see `ARRIVAL_DWELL`.
 */
function useDecodedOriginal(cell: MediaCell, isEnabled: boolean, dwell: number): Nullable<string> {
  const [decoded, setDecoded] = useState<Nullable<string>>(null);
  const original = cell.originalUrl;

  useEffect(() => {
    if (!isEnabled || !original) {
      return;
    }

    let isActive = true;
    const image = new Image();

    const timer = window.setTimeout(() => {
      image.src = original;
      void image.decode().then(
        () => isActive && setDecoded(original),
        // INFO: The cleanup below rejects every decode it interrupts, so the swallow is the ordinary path out rather than the failure one.
        () => undefined,
      );
    }, dwell);

    // WARN: The source is dropped, never just the flag. A slide left behind mid-download keeps fetching and decoding an object of up to `MAX_IMAGE_SIZE` otherwise, and DESIGN.md § 7.10.'s scrub crosses slides faster than any of them finishes — a strip dragged across a bubble of nine left WebKit holding every original the reader passed, which it answers by killing the tab.
    return () => {
      isActive = false;
      clearTimeout(timer);
      image.removeAttribute("src");
    };
  }, [isEnabled, original, dwell]);

  return decoded ?? cell.previewUrl;
}

/**
 * WARN: REQUIREMENTS.md § 9. Videos are stored exactly as the phone produced them,
 * so a desktop browser without an HEVC decoder legitimately cannot play one. The
 * element reports that as an `error`, and the download link is the fallback rather
 * than a blank black rectangle.
 */
type VideoSlideProps = {
  className?: string;
  cell: MediaCell;
  isMorphTarget: boolean;
  onPlayingChange: (isPlaying: boolean) => void;
};

function VideoSlide({ className, cell, isMorphTarget, onPlayingChange }: VideoSlideProps) {
  const [hasFailed, setHasFailed] = useState(false);

  if (hasFailed) {
    return (
      <div className={cn("flex flex-col items-center gap-sm text-center", className)}>
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
    // WARN: `w-full` with the stored ratio, exactly as `ImageSlide` is framed — `max-w-full` capped the element at the clip's own pixel width instead, so anything narrower than the shell sat inside gutters the photo beside it does not have. `object-contain` is what keeps a portrait clip from stretching once `max-h-full` clamps the box.
    <video
      // INFO: AGENTS.md § 4.2. The transport is the platform's own, and the pointer affordance every other control in the app carries has to be given to it by hand — the `button` rule in the base layer cannot reach UA shadow DOM.
      className={cn("max-h-full w-full media-controls-pointer object-contain", className)}
      src={cell.originalUrl ?? undefined}
      poster={cell.previewUrl ?? undefined}
      controls
      playsInline
      preload="metadata"
      // INFO: DESIGN.md § 4.7.3. A clip morphs out of its tile as a photo does — the poster is the same frame the tile drew, so the capture has a picture in it before playback has started.
      style={{
        aspectRatio: toCellRatio(cell),
        viewTransitionName: isMorphTarget ? MEDIA_MORPH_NAME : undefined,
      }}
      onError={() => setHasFailed(true)}
      onPlay={() => onPlayingChange(true)}
      onPause={() => onPlayingChange(false)}
    />
  );
}
