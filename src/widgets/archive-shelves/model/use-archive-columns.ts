"use client";

import { ARCHIVE_COLUMNS_COOKIE_NAME, DESKTOP_MEDIA_QUERY } from "@/shared/config";
import { A_DAY, A_SECOND, useIsomorphicLayoutEffect } from "@/shared/lib";
import { useCookieState } from "synced-storage/react";
import type { ArchiveColumnCount } from "./use-pinch-columns";

const MAX_AGE = (365 * A_DAY) / A_SECOND;

/**
 * AGENTS.md § 4.1. 보관함's column count (1–7) — one cookie for every width, the
 * pinch's and the 열 개수 slider's shared state, synced with SSR (`app/(main)/layout.tsx`).
 * The server always answers `3` for an unset cookie since it can't know the
 * client's width; a `md`+ client with no cookie at all corrects that once before
 * paint and persists it, but a client with any existing cookie is never touched.
 */
export function useArchiveColumns() {
  const [columns, setColumns] = useCookieState<ArchiveColumnCount>(ARCHIVE_COLUMNS_COOKIE_NAME, 3, {
    strategy: "cookie",
    path: "/",
    sameSite: "lax",
    maxAge: MAX_AGE,
  });

  // WARN: `useIsomorphicLayoutEffect`, not a passive effect — this has to land before the first client paint, or a `md`+ first-timer sees the narrower default flash to 5 a frame later.
  useIsomorphicLayoutEffect(() => {
    if (hasArchiveColumnsCookie() || !window.matchMedia(DESKTOP_MEDIA_QUERY).matches) {
      return;
    }

    setColumns(5);
  }, []);

  return { columns, setColumns };
}

// WARN: `document.cookie` directly, never `useCookieState`'s own return — that hook cannot tell "absent, defaulted to 3" from "present, explicitly 3", and only the raw cookie answers which one this is.
function hasArchiveColumnsCookie(): boolean {
  return document.cookie
    .split("; ")
    .some((entry) => entry.startsWith(`${ARCHIVE_COLUMNS_COOKIE_NAME}=`));
}
