// INFO: REQUIREMENTS.md § 13.6. A sliver of whatever is past the revealed item stays visible, so the scroller still reads as having more in that direction.
const REVEAL_MARGIN = 8;

/**
 * Scrolls `item` into view inside `scroller`, on whichever axes it is clipped on.
 *
 * WARN: Never `scrollIntoView` or `focus()`'s own scroll, which both walk *every*
 * scrollable ancestor — REQUIREMENTS.md § 13.6.'s strip is clipped by an
 * `overflow: hidden` box mid-collapse, and DESIGN.md § 7.10.'s filmstrip sits inside
 * an overlay whose ancestors include the app's own document scroller.
 *
 * WARN: An axis with no room to move is never asked to. The margin is added to the
 * clipping test, so a scroller whose item merely sits inside its padding still
 * produces a non-zero term on that axis — and `scrollBy` moves an `overflow: hidden`
 * box just as readily as a scrolling one. On the § 13.6. strip that was a few pixels
 * of **vertical** travel on every tab pulled in from off the end, which is the wobble
 * reported under the thumb on iOS.
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

  scroller.scrollBy({
    behavior,
    top: canScrollY
      ? toScrollStep(
          scrollerBox.top + REVEAL_MARGIN - itemBox.top,
          itemBox.bottom + REVEAL_MARGIN - scrollerBox.bottom,
        )
      : 0,
    left: canScrollX
      ? toScrollStep(
          scrollerBox.left + REVEAL_MARGIN - itemBox.left,
          itemBox.right + REVEAL_MARGIN - scrollerBox.right,
        )
      : 0,
  });
}

// INFO: Both are positive only where the item is larger than the scroller, and either answer then reveals one edge by hiding the other — the leading one is the one the eye reads from.
function toScrollStep(clippedStart: number, clippedEnd: number): number {
  if (clippedStart > 0) {
    return -clippedStart;
  }

  return clippedEnd > 0 ? clippedEnd : 0;
}
