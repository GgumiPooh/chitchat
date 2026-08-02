"use client";

import { useMedia } from "react-use";

/** AGENTS.md § 4.2. Interaction details only — never branch layout on this. */
export function useIsCoarsePointer(): boolean {
  return useMedia("(pointer: coarse)", false);
}
