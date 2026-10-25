"use client";

import { OFFICE_MODE_COOKIE_NAME, OFFICE_MODE_COOKIE_OPTIONS } from "@/shared/config";
import { useCallback } from "react";
import { useCookieState } from "synced-storage/react";

export const OFFICE_MODE_STORAGE_KEY = OFFICE_MODE_COOKIE_NAME;

/**
 * Returns whether Office Mode is enabled synchronously.
 * Safe to call in browser environments. Defaults to true.
 */
export function getIsOfficeMode(): boolean {
  if (typeof window === "undefined") {
    return true;
  }
  try {
    const cookie = document.cookie
      .split("; ")
      .find((row) => row.startsWith(`${OFFICE_MODE_COOKIE_NAME}=`))
      ?.split("=")[1];
    if (cookie !== undefined) {
      return cookie !== "false";
    }
    const local = window.localStorage.getItem(OFFICE_MODE_STORAGE_KEY);
    if (local !== null) {
      return local !== "false";
    }
    return true;
  } catch {
    return true;
  }
}

/**
 * Hook for reading and toggling Office Mode.
 * Defaults to true (enabled) on every device until explicitly turned off.
 * Office Mode blocks media downloads (photos, videos, files, voice, profile & background photos),
 * resets custom chat background to default canvas, and restricts access to the archive.
 */
export function useOfficeMode() {
  const [storedValue, setStoredValue] = useCookieState<boolean>(OFFICE_MODE_COOKIE_NAME, true, {
    strategy: "cookie",
    ...OFFICE_MODE_COOKIE_OPTIONS,
  });

  const setOfficeMode = useCallback(
    (next: boolean) => {
      setStoredValue(next);
      try {
        window.localStorage.setItem(OFFICE_MODE_STORAGE_KEY, String(next));
      } catch {
        // Ignore
      }
    },
    [setStoredValue],
  );

  return {
    isOfficeMode: storedValue ?? true,
    setOfficeMode,
  };
}
