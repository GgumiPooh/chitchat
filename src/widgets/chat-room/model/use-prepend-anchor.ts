"use client";

import type { Optional } from "@/shared/lib";
import { useState } from "react";
import type { ChatRow } from "./types";

// INFO: Virtuoso counts `firstItemIndex` downward from here, so this only has to exceed any plausible prepend total.
const START_INDEX = 1_000_000;

type Anchor = {
  index: number;
  anchorKey: Optional<string>;
};

/**
 * Virtuoso's `firstItemIndex` for the current rows (REQUIREMENTS.md § 8.3.) —
 * decremented by however many rows were prepended, which is what holds the
 * viewport still while older history loads in above it.
 *
 * WARN: Derived during render, not in an effect: Virtuoso requires the index and the data to change in the same commit, and an effect lands one commit late, which reads as a scroll jump.
 */
export function usePrependAnchor(rows: ChatRow[]): number {
  const [anchor, setAnchor] = useState<Anchor>(() => ({
    index: START_INDEX,
    anchorKey: toAnchorKey(rows),
  }));
  const anchorKey = toAnchorKey(rows);

  if (anchorKey === anchor.anchorKey) {
    return anchor.index;
  }

  // INFO: The previous anchor row is still in the list after a prepend — its new position is exactly how many rows arrived above it.
  const prependedCount =
    anchor.anchorKey === undefined
      ? 0
      : Math.max(
          rows.findIndex((row) => row.key === anchor.anchorKey),
          0,
        );
  const next: Anchor = { index: anchor.index - prependedCount, anchorKey };

  setAnchor(next);

  return next.index;
}

// WARN: Never `rows[0]` — that is always a date divider, and a page of older messages from the same day leaves its key untouched, so the prepend goes unnoticed and the viewport jumps a full page.
function toAnchorKey(rows: ChatRow[]): Optional<string> {
  return rows.find((row) => row.kind !== "date")?.key;
}
