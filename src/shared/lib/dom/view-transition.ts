"use client";

import { flushSync } from "react-dom";
import type { Nullable } from "../nullish";

/**
 * DESIGN.md § 4.7.3. The name the **picture** wears — the tile a reader tapped on the
 * way in, and the slide they left on the way out.
 *
 * WARN: One name for the whole app rather than one per media id, and the two halves must never wear it at the same instant: a duplicate name aborts the transition outright, and the tile stays mounted behind the viewer that covers it. The two functions below are the only writers, and each releases its own half at the one moment the other is not holding it.
 */
export const MEDIA_MORPH_NAME = "media-morph";

/**
 * DESIGN.md § 4.7.3. The name the **viewer itself** wears, so its scrim and chrome
 * resolve rather than cutting in and out around the travelling picture.
 *
 * WARN: The slide inside it carries `MEDIA_MORPH_NAME`, which lifts it out of this snapshot and into a group of its own — that is what lets the photo travel at full strength while everything around it fades. Removing either name silently changes the other's behaviour.
 * INFO: The viewer's floating discs are `backdrop-blur-sm` and a captured group has no backdrop left to sample (§ 4.7.1.), so they flatten for the length of the transition. It is invisible here and only here: what sits behind them is the viewer's own **opaque** `scrim` (§ 7.10.), and a blur of a flat colour is that colour.
 */
export const MEDIA_VIEWER_NAME = "media-viewer";

/**
 * DESIGN.md § 4.7.3. Opens the media viewer by **expanding the thumbnail that was
 * tapped** into the slide it becomes, rather than cutting to a full-screen overlay.
 *
 * `origin` is the element the picture leaves — 보관함's grid tile, or a chat bubble's
 * cell — and `open` is the state change that mounts the viewer. Falls back to the
 * plain open wherever the morph cannot run, so no caller has to branch.
 *
 * WARN: DESIGN.md § 4.7.1. Only the named elements are ever captured. `:root` is stripped of its own name in `globals.css`, because a root capture takes the floating bars (§ 3.5.) into the top layer with it and their `backdrop-filter` collapses to a flat plate — the whole argument § 4.7.1. records against a view transition on route changes.
 * WARN: `flushSync`, or the callback returns before React has mounted the viewer and the new state is captured with nothing in it. It also runs `MediaViewer`'s layout effects, which is what puts the track on the slide the reader asked for before that capture is taken (§ 4.7.3. on why the open offset had to stop being passive).
 * WARN: The origin is released **inside** the callback. The old snapshot is already taken by then and the new one is not, so this is the one moment neither half is needed — released any later the tile and the slide would both be holding the name when the new state is read, which is the duplicate the constant above warns about.
 */
export function startMediaMorph(origin: Nullable<HTMLElement>, open: () => void): void {
  if (!origin || !canTransition()) {
    open();

    return;
  }

  claimName(origin);

  run(
    "open",
    () => {
      flushSync(open);
      releaseName(origin);
    },
    () => releaseName(origin),
  );
}

/**
 * DESIGN.md § 4.7.3. Closes the viewer by **collapsing the slide back into the
 * thumbnail it came from** — the same journey in reverse, and the mirror of the
 * sequencing above: the name is put on after the update rather than before it, since
 * here the tile is the arriving half.
 *
 * `target` is where the picture lands, resolved by the caller from the slide the
 * reader ended on — which is rarely the one they opened (`REQUIREMENTS.md § 8.1.`).
 *
 * WARN: A target that is not **on screen** is dropped rather than morphed into, and the transition runs as a `dismiss` rather than a `close`. Morphed into anyway, the photo flies off the edge of the screen to a place the reader is not looking at. 보관함 keeps its grid on the reader's own slide so this is rare there (§ 4.7.3.); 채팅 leaves the room where it was, and reaches it on any long swipe.
 * WARN: The two are **not** interchangeable in the stylesheet, and reading them as one is what left the picture hanging in mid-air. A `close` has a pair, so the flash rule strips the UA's fade off both halves; a `dismiss` has only the old snapshot, and stripped of its fade it sat at full strength over a scrim draining underneath it and then cut to nothing at the end.
 */
export function endMediaMorph(target: Nullable<HTMLElement>, close: () => void): void {
  if (!canTransition()) {
    close();

    return;
  }

  const landing = target && isOnScreen(target) ? target : null;

  run(
    landing ? "close" : "dismiss",
    () => {
      flushSync(close);

      if (landing) {
        claimName(landing);
      }
      // WARN: Released on `finished` and never inside the callback, unlike the open. The tile is the half being animated *to*, so it has to hold the name for the whole flight — dropped early the group loses its destination mid-animation.
    },
    () => {
      if (landing) {
        releaseName(landing);
      }
    },
  );
}

/**
 * Moves `MEDIA_MORPH_NAME` onto one element, taking it off whoever held it.
 *
 * WARN: The holder is tracked module-wide because the name is, and this pair is what keeps a superseded transition from corrupting the one that replaced it. `finished` **rejects** when a second morph starts over a first, on a microtask that lands after the second has already claimed its element — a release written as a bare `removeProperty` then stripped the name off the *second's* half whenever the two were the same node, and the morph silently degraded to a fade.
 * WARN: Claiming always clears the previous holder, which is the other half of it. Left to the superseded transition's own cleanup the name leaks onto an element nothing will visit again, and every later morph aborts on the duplicate the constant at the top of this file warns about.
 */
function claimName(element: HTMLElement): void {
  named?.style.removeProperty("view-transition-name");
  element.style.viewTransitionName = MEDIA_MORPH_NAME;
  named = element;
}

function releaseName(element: HTMLElement): void {
  if (named !== element) {
    return;
  }

  element.style.removeProperty("view-transition-name");
  named = null;
}

let named: Nullable<HTMLElement> = null;

/**
 * DESIGN.md § 4.7.3. Resolves once the morph the viewer is arriving on has landed —
 * or at once where there is no morph at all.
 *
 * INFO: What waits on it is the slide's swap from the thumbnail to the stored original (§ 7.10.). A request started before this lands finishes mid-flight, and the picture is replaced under an animation the live DOM is not even painting — so the reader sees the swap as a pop at the moment the transition ends rather than as a photo sharpening.
 * WARN: Read from a mount effect inside the update callback, which is why the promise is recorded **synchronously** after `startViewTransition` returns rather than from inside it — the callback runs a frame later, and a viewer that mounted before the assignment would wait on the previous transition or on nothing.
 * WARN: **Consumed once, and only an opening morph ever leaves one.** It used to answer with whatever the last transition left, which any viewer mounting anywhere would then wait on — and § 7.7.'s profile viewer opens from an avatar with no morph at all. Tapped during the 300ms a *closing* morph was still running, it mounted with `hasMorphSettled` false: no scrim, and chrome that was `opacity-0` with its pointers revoked. A photo floating over the live conversation with a 닫기 that could be neither seen nor pressed.
 * INFO: Taking it clears it, which is exact rather than defensive — one viewer mounts per opening morph, and it is the one inside that morph's own update callback.
 */
export function whenMediaMorphSettled(): Promise<void> {
  const pending = opening;

  opening = null;

  return pending ?? Promise.resolve();
}

// INFO: Set by an `open` alone, and held only until the viewer that morph is carrying reads it.
let opening: Nullable<Promise<void>> = null;

/**
 * Runs the transition, and tells the stylesheet which way it is going.
 *
 * WARN: The direction is not decoration. `globals.css` keeps exactly one of the two snapshots — always the viewer's, since the other is a thumbnail — and which of `old` / `new` that is swaps between opening and closing. There is no way to read the direction from inside a `::view-transition-*` rule, so it arrives as an attribute on the document element.
 * WARN: The attribute is torn down **only by the run that still owns it**. `finished` rejects when a second morph supersedes a first, on a microtask that lands after the second has written its own direction — so an unguarded cleanup removed the attribute out from under the transition that was actually animating. Neither `display: none` nor `animation: none` then matched, and the two halves cross-faded with exactly the `plus-lighter` brightening those rules exist to remove. Reachable by pressing `Escape` inside the 300ms opening flight.
 * INFO: `release` runs either way and needs no such guard — `releaseName` already refuses to act for an element that is no longer the holder.
 */
function run(direction: MorphDirection, update: () => void, release: () => void): void {
  const root = document.documentElement;
  const token = (latestRun += 1);

  const settle = () => {
    release();

    if (token === latestRun) {
      root.removeAttribute(DIRECTION_ATTRIBUTE);
    }
  };

  root.setAttribute(DIRECTION_ATTRIBUTE, direction);

  let transition;

  try {
    transition = document.startViewTransition(update);
  } catch {
    // WARN: The state change still has to happen. A throw here leaves the reader on a tap that did nothing at all — and, before `claimName` tracked the holder, a name stranded on the tile that aborted every morph after it.
    update();
    settle();

    return;
  }

  const done = transition.finished.then(settle, settle);

  if (direction === "open") {
    opening = done;
  }
}

let latestRun = 0;

/**
 * INFO: `dismiss` is a close with nowhere to land — see `endMediaMorph`. A third value
 * rather than the absence of one, because the stylesheet has to tell it from a `close`
 * and neither case can be inferred from the other once the transition is running.
 */
type MorphDirection = "open" | "close" | "dismiss";

const DIRECTION_ATTRIBUTE = "data-media-morph";

/**
 * INFO: DESIGN.md § 4.7. Positional motion is the common motion-sensitivity trigger,
 * and this is the app's largest. Answered by skipping the capture outright rather than
 * by a `0s` duration, so nothing is lifted into the top layer at all.
 */
function canTransition(): boolean {
  return (
    typeof document.startViewTransition === "function" &&
    !window.matchMedia("(prefers-reduced-motion: reduce)").matches
  );
}

/**
 * WARN: `width` is tested as well as the box's position. A tile inside a windowed row
 * that has been recycled reports a zero rect rather than an off-screen one, and a
 * zero-sized group is a photo collapsing to a point.
 */
function isOnScreen(element: HTMLElement): boolean {
  const box = element.getBoundingClientRect();

  return box.width > 0 && box.bottom > 0 && box.top < window.innerHeight;
}
