"use client";

import type { EmoticonPackId } from "@/shared/lib";
import { useCallback } from "react";
import { useStorageState } from "synced-storage/react";

export const OFFICE_MODE_HIDDEN_PACKS_STORAGE_KEY = "jandh:office-mode-hidden-packs";

const NO_HIDDEN_PACKS: string[] = [];

/**
 * Returns whether a pack is marked as hidden in Office Mode synchronously.
 * Safe to call in browser environments. Defaults to false.
 */
export function getIsPackHiddenInOfficeMode(packId: string): boolean {
  if (typeof window === "undefined") {
    return false;
  }
  try {
    const raw = window.localStorage.getItem(OFFICE_MODE_HIDDEN_PACKS_STORAGE_KEY);
    if (!raw) {
      return false;
    }
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) && parsed.includes(packId);
  } catch {
    return false;
  }
}

/**
 * Hook for reading and toggling emoticon packs hidden in Office Mode.
 * Stored in localStorage so it remains a per-device quiet setting.
 */
export function useOfficeModeHiddenPacks() {
  const [storedPackIds, setStoredPackIds] = useStorageState<string[]>(
    OFFICE_MODE_HIDDEN_PACKS_STORAGE_KEY,
    NO_HIDDEN_PACKS,
    { strategy: "localStorage" },
  );

  const hiddenPackIds = storedPackIds ?? NO_HIDDEN_PACKS;

  const isPackHidden = useCallback(
    (packId: EmoticonPackId | string) => hiddenPackIds.includes(packId),
    [hiddenPackIds],
  );

  const togglePackHidden = useCallback(
    (packId: EmoticonPackId | string) => {
      setStoredPackIds((current = []) =>
        current.includes(packId) ? current.filter((id) => id !== packId) : [...current, packId],
      );
    },
    [setStoredPackIds],
  );

  const setPackHidden = useCallback(
    (packId: EmoticonPackId | string, hidden: boolean) => {
      setStoredPackIds((current = []) => {
        const has = current.includes(packId);
        if (hidden && !has) {
          return [...current, packId];
        }
        if (!hidden && has) {
          return current.filter((id) => id !== packId);
        }
        return current;
      });
    },
    [setStoredPackIds],
  );

  return {
    hiddenPackIds,
    isPackHidden,
    togglePackHidden,
    setPackHidden,
  };
}
