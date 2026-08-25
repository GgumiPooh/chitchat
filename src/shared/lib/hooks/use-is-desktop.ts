"use client";

import { DESKTOP_MEDIA_QUERY } from "@/shared/config";
import { useMedia } from "react-use";

/**
 * AGENTS.md § 4.1. Component-choice branches only (sheet → modal, action sheet →
 * popover, inline event form) — every geometry change is a Tailwind `md:` class so
 * both trees mount and CSS hides one, which is what keeps first paint flash-free.
 *
 * WARN: `false` on SSR and until the media query has been read — never gate a
 * mount that must be visible on first paint behind this.
 */
export function useIsDesktop(): boolean {
  return useMedia(DESKTOP_MEDIA_QUERY, false);
}
