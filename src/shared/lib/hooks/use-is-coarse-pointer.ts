"use client";

import { useMedia } from "react-use";

/** AGENTS.md § 4.2. Interaction details only — never branch layout on this. */
export function useIsCoarsePointer(): boolean {
  return useMedia("(pointer: coarse)", false);
}

/**
 * AGENTS.md § 4.2. Whether a mouse is driving this, for the same narrow purpose.
 *
 * WARN: **Not** the negation of `useIsCoarsePointer`, and the difference is the
 * default rather than the query. Both answer `false` before the media query has been
 * read, so the pair is written to fail towards the phone: that one withholds a
 * hardware-keyboard behaviour until it is sure, and this one withholds a
 * hardware-keyboard *hint* until it is sure. Negating either would paint the desktop's
 * answer on a phone for a frame and then take it away.
 */
export function useIsFinePointer(): boolean {
  return useMedia("(pointer: fine)", false);
}
