// INFO: REQUIREMENTS.md § 13.6. A sliver of whatever is past the revealed item stays visible, so the scroller still reads as having more in that direction.
const REVEAL_MARGIN = 8;

/**
 * Scrolls `item` into view inside `scroller`, on whichever axes it is clipped on.
 *
 * WARN: Never `scrollIntoView` or `focus()`'s own scroll, which both walk *every*
 * scrollable ancestor — REQUIREMENTS.md § 13.6.'s strip is clipped by an
 * `overflow: hidden` box mid-collapse, and walking out of one reaches the app's own
 * document scroller (DESIGN.md § 3.3.).
 *
 * WARN: An axis with no room to move is never asked to. The margin is added to the
 * clipping test, so a scroller whose item merely sits inside its padding still
 * produces a non-zero term on that axis — and `scrollBy` moves an `overflow: hidden`
 * box just as readily as a scrolling one. On the § 13.6. strip that was a few pixels
 * of **vertical** travel on every tab pulled in from off the end, which is the wobble
 * reported under the thumb on iOS.
 *
 * WARN: § 13.6. Clipped bounds are clamped against the scroller's own physical scroll
 * range (`[0, maxScroll]`). At `scrollLeft === 0`, an unconditional margin-based offset
 * would produce a negative delta (`-4px` for `ml-2xs`) on fully visible items, which
 * triggers elastic overscroll rubber-banding or 0-clamping jitter on iOS and Android.
 * When neither axis needs travel (`< 1px`), `scrollBy` is skipped entirely.
 */
export function revealWithin(
  scroller: HTMLElement,
  item: HTMLElement,
  behavior: ScrollBehavior = "auto",
): void {
  const scrollerBox = scroller.getBoundingClientRect();
  const itemBox = item.getBoundingClientRect();

  const canScrollY = scroller.scrollHeight > scroller.clientHeight;
  const canScrollX = scroller.scrollWidth > scroller.clientWidth;

  const rawStepY = canScrollY
    ? toScrollStep(
        itemBox.top < scrollerBox.top,
        scrollerBox.top + REVEAL_MARGIN - itemBox.top,
        itemBox.bottom > scrollerBox.bottom,
        itemBox.bottom + REVEAL_MARGIN - scrollerBox.bottom,
      )
    : 0;

  const rawStepX = canScrollX
    ? toScrollStep(
        itemBox.left < scrollerBox.left,
        scrollerBox.left + REVEAL_MARGIN - itemBox.left,
        itemBox.right > scrollerBox.right,
        itemBox.right + REVEAL_MARGIN - scrollerBox.right,
      )
    : 0;

  const maxScrollY = scroller.scrollHeight - scroller.clientHeight;
  const targetScrollY = Math.max(0, Math.min(maxScrollY, scroller.scrollTop + rawStepY));
  const stepY = targetScrollY - scroller.scrollTop;

  const maxScrollX = scroller.scrollWidth - scroller.clientWidth;
  const targetScrollX = Math.max(0, Math.min(maxScrollX, scroller.scrollLeft + rawStepX));
  const stepX = targetScrollX - scroller.scrollLeft;

  if (Math.abs(stepX) < 1 && Math.abs(stepY) < 1) {
    return;
  }

  scroller.scrollBy({
    behavior,
    top: stepY,
    left: stepX,
  });
}

// INFO: Both are true only where the item is larger than the scroller, and either answer then reveals one edge by hiding the other — the leading one is the one the eye reads from.
function toScrollStep(
  isStartClipped: boolean,
  startDiff: number,
  isEndClipped: boolean,
  endDiff: number,
): number {
  if (isStartClipped) {
    return -startDiff;
  }

  if (isEndClipped) {
    return endDiff;
  }

  return 0;
}
