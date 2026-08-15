"use client";

import { useWriteSnapshot } from "@/shared/snapshot";
import { useMemo } from "react";
import type { CalendarSnapshot } from "./types";

/**
 * Keeps the `calendar` snapshot level with the loaded month.
 *
 * INFO: The identity is rebuilt here rather than asked of the caller, because the screen re-renders on every day selection and the store's write is keyed on the payload it was handed.
 */
export function useWriteCalendarSnapshot({
  summary,
  monthKey,
  occurrences,
  holidays,
}: CalendarSnapshot): void {
  const snapshot = useMemo<CalendarSnapshot>(
    () => ({ summary, monthKey, occurrences, holidays }),
    [summary, monthKey, occurrences, holidays],
  );

  useWriteSnapshot("calendar", snapshot);
}
