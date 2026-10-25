"use client";

import { useStorageState } from "synced-storage/react";

export const OFFICE_MODE_STORAGE_KEY = "jandh:office-mode";

/**
 * Returns whether Office Mode is enabled in localStorage synchronously.
 * Safe to call in browser environments.
 */
export function getIsOfficeMode(): boolean {
  if (typeof window === "undefined") {
    return false;
  }
  try {
    return window.localStorage.getItem(OFFICE_MODE_STORAGE_KEY) === "true";
  } catch {
    return false;
  }
}

/**
 * Hook for reading and toggling Office Mode.
 * Office Mode blocks media downloads (photos, videos, files, voice),
 * resets custom chat background to default canvas, and restricts access to the archive.
 */
export function useOfficeMode() {
  const [storedValue, setStoredValue] = useStorageState<boolean>(OFFICE_MODE_STORAGE_KEY, false, {
    strategy: "localStorage",
  });

  return {
    isOfficeMode: Boolean(storedValue),
    setOfficeMode: setStoredValue,
  };
}
