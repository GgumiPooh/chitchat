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

// INFO: § 13.6. A sliver of whatever is past the revealed item stays visible, so the scroller still reads as having more in that direction.
const REVEAL_MARGIN = 8;

/**
 * REQUIREMENTS.md § 8.14. Where an arrow key takes focus next **inside this list**, or
 * `undefined` where the key leads out of it and the caller has to say where to.
 *
 * INFO: ARIA's grid pattern — focus **stops** at the edges rather than wrapping, so a
 * partial last row does not swallow `ArrowDown` into the row above it.
 *
 * WARN: § 8.14. A horizontal step never leaves its **row**, which is the stricter of
 * the two readings the grid pattern allows and the one the panel needs: `→` off the
 * fourth cell means the next pack, not the fifth cell, so the row's end has to be a
 * refusal here rather than a wrap into the row below.
 *
 * @param columns `1` for a single row — § 13.8.'s results and the tab strip — where
 * the whole list is one row and the vertical arrows are left to the caller.
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
      return isRowEnd({ index, count, columns }) ? undefined : index + 1;
    case "ArrowLeft":
      return isRowStart({ index, columns }) ? undefined : index - 1;
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

/**
 * INFO: § 8.14. `columns === 1` is a single **row**, not a column of one-cell rows —
 * § 13.8.'s results and the tab strip — so its row runs the whole length of the list.
 */
function isRowStart({ index, columns }: { index: number; columns: number }): boolean {
  return columns === 1 ? index === 0 : index % columns === 0;
}

function isRowEnd({
  index,
  count,
  columns,
}: {
  index: number;
  count: number;
  columns: number;
}): boolean {
  return columns === 1 ? index === count - 1 : (index + 1) % columns === 0;
}

/**
 * REQUIREMENTS.md § 8.14. Where `←`/`→` off the end of a row lands in the pack it
 * turns to: the **same row, opposite edge**, so the offset and the eye both stay put.
 *
 * INFO: A single row turns to the opposite end of the whole list instead, since that
 * row *is* the list.
 */
export function toCrossingIndex({
  index,
  columns,
  direction,
}: {
  index: number;
  columns: number;
  direction: 1 | -1;
}): number | "last" {
  if (columns === 1) {
    return direction === 1 ? 0 : "last";
  }

  const rowStart = index - (index % columns);

  return direction === 1 ? rowStart : rowStart + columns - 1;
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
export function focusItem(scroller: HTMLElement, index: number): boolean {
  const item = scroller.querySelector<HTMLElement>(`[${FOCUS_INDEX_ATTRIBUTE}="${index}"]`);

  if (!item) {
    return false;
  }

  item.focus({ preventScroll: true });
  revealWithin(scroller, item);

  return true;
}

/**
 * Scrolls `item` into view inside `scroller`, on whichever axes it is clipped on.
 *
 * INFO: § 13.6. Also what the tab strip's own reveal is built on — one copy of the
 * `overflow: hidden` workaround above, and one margin, rather than a pair per
 * scroller that a later change would have to find both of.
 */
export function revealWithin(
  scroller: HTMLElement,
  item: HTMLElement,
  behavior: ScrollBehavior = "auto",
): void {
  const scrollerBox = scroller.getBoundingClientRect();
  const itemBox = item.getBoundingClientRect();

  scroller.scrollBy({
    behavior,
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
