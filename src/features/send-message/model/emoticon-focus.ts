import type { Nullable, Optional } from "@/shared/lib";

/** REQUIREMENTS.md § 13.6. The grid's column count, which is also its vertical arrow step. */
export const EMOTICON_GRID_COLUMNS = 4;

/**
 * The attribute a focusable child carries its position in, so focus can be moved
 * without a ref per item.
 *
 * INFO: § 8.14. Shared by the grid, § 13.8.'s results row and the tab strip — each
 * reads it off its own subtree, so one spelling cannot reach another's items.
 */
export const FOCUS_INDEX_ATTRIBUTE = "data-emoticon-focus";

// INFO: § 13.6. A sliver past the revealed item, matching `TAB_REVEAL_MARGIN` — it says the scroller has more in that direction.
const REVEAL_MARGIN = 8;

/**
 * REQUIREMENTS.md § 8.14. Where an arrow key takes focus next, or `undefined` where
 * the key is not one this scroller owns.
 *
 * INFO: ARIA's grid pattern — focus **stops** at the edges rather than wrapping, so a
 * partial last row does not swallow `ArrowDown` into the row above it.
 *
 * @param columns `1` for a single row — § 13.8.'s results and the tab strip — where
 * the vertical arrows have nowhere to go and are left to the caller.
 */
export function toNextFocusIndex(
  key: string,
  { index, count, columns }: { index: number; count: number; columns: number },
): Optional<number> {
  const next = toCandidateIndex(key, { index, count, columns });

  if (next === undefined || next < 0 || next >= count) {
    return undefined;
  }

  return next;
}

function toCandidateIndex(
  key: string,
  { index, count, columns }: { index: number; count: number; columns: number },
): Optional<number> {
  switch (key) {
    case "ArrowRight":
      return index + 1;
    case "ArrowLeft":
      return index - 1;
    case "ArrowDown":
      return columns > 1 ? index + columns : undefined;
    case "ArrowUp":
      return columns > 1 ? index - columns : undefined;
    case "Home":
      return 0;
    case "End":
      return count - 1;
    default:
      return undefined;
  }
}

/** Which item an event started on, or `undefined` for one that started somewhere else. */
export function readFocusIndex(target: Nullable<EventTarget>): Optional<number> {
  if (!(target instanceof Element)) {
    return undefined;
  }

  const item = target.closest(`[${FOCUS_INDEX_ATTRIBUTE}]`);

  if (!item) {
    return undefined;
  }

  const index = Number(item.getAttribute(FOCUS_INDEX_ATTRIBUTE));

  return Number.isInteger(index) ? index : undefined;
}

/**
 * Moves focus to the item at `index` and brings it into view.
 *
 * WARN: REQUIREMENTS.md § 13.6. `preventScroll` and a scroll made by hand, never
 * `focus()`'s own or `scrollIntoView` — both walk *every* scrollable ancestor, and the
 * strip clipping this panel is `overflow: hidden`, which mid-collapse counts as one.
 * That is the same trap `revealActiveTab` is written by hand for.
 */
export function focusItem(scroller: HTMLElement, index: number): void {
  const item = scroller.querySelector<HTMLElement>(`[${FOCUS_INDEX_ATTRIBUTE}="${index}"]`);

  if (!item) {
    return;
  }

  item.focus({ preventScroll: true });
  reveal(scroller, item);
}

function reveal(scroller: HTMLElement, item: HTMLElement): void {
  const scrollerBox = scroller.getBoundingClientRect();
  const itemBox = item.getBoundingClientRect();

  scroller.scrollBy({
    top: toScrollStep(
      scrollerBox.top + REVEAL_MARGIN - itemBox.top,
      itemBox.bottom + REVEAL_MARGIN - scrollerBox.bottom,
    ),
    left: toScrollStep(
      scrollerBox.left + REVEAL_MARGIN - itemBox.left,
      itemBox.right + REVEAL_MARGIN - scrollerBox.right,
    ),
  });
}

// INFO: Both are positive only where the item is larger than the scroller, and either answer then reveals one edge by hiding the other — the leading one is the one the eye reads from.
function toScrollStep(clippedStart: number, clippedEnd: number): number {
  if (clippedStart > 0) {
    return -clippedStart;
  }

  return clippedEnd > 0 ? clippedEnd : 0;
}
