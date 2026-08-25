"use client";

import { flushSync } from "react-dom";
import { ARCHIVE_TILE_ID_ATTRIBUTE } from "./use-archive-sweep";

// WARN: `document.activeViewTransition` has no lib.dom typing yet — read through this cast rather than widening `Document` app-wide.
type DocumentWithActiveViewTransition = Document & { activeViewTransition?: ViewTransition };

// WARN: A fallback for browsers with `startViewTransition` but no `activeViewTransition` (Safari) — cleared in the `finished.finally` below, mirroring what that property would report.
let isTransitionInFlight = false;

/**
 * AGENTS.md § 4.1. Morphs the grid between column counts — every tile still on
 * screen keeps its own view-transition name for the length of the transition, so a
 * step (pinch, or the 열 개수 slider) reads as tiles resizing in place. One name per
 * tile, unlike `startMediaMorph`'s shared name, since many tiles travel at once.
 * Queries `document` directly rather than taking a container, since the slider
 * lives in a sheet outside `ArchiveGrid`'s own tree.
 *
 * WARN: Coalesced rather than queued. A slider drag or a pinch fires this every
 * frame it moves, and `startViewTransition` while one is already running throws —
 * a step mid-transition applies directly instead, so the slider still updates live.
 */
export function runColumnsTransition(apply: () => void): void {
  if (
    typeof document.startViewTransition !== "function" ||
    window.matchMedia("(prefers-reduced-motion: reduce)").matches ||
    ((document as DocumentWithActiveViewTransition).activeViewTransition ?? isTransitionInFlight)
  ) {
    apply();

    return;
  }

  const tiles = [...document.querySelectorAll<HTMLElement>(`[${ARCHIVE_TILE_ID_ATTRIBUTE}]`)];

  for (const tile of tiles) {
    tile.style.viewTransitionName = `archive-tile-${tile.getAttribute(ARCHIVE_TILE_ID_ATTRIBUTE)}`;
    // WARN: `globals.css`'s timing rule selects on this class, not the name — there's no `archive-tile-*` wildcard a `::view-transition-group()` selector can match.
    tile.style.viewTransitionClass = "archive-tile";
  }

  isTransitionInFlight = true;

  document
    .startViewTransition(() => flushSync(apply))
    .finished.finally(() => {
      isTransitionInFlight = false;

      for (const tile of tiles) {
        tile.style.removeProperty("view-transition-name");
        tile.style.removeProperty("view-transition-class");
      }
    });
}
