"use client";

import { useCallback } from "react";
import { useStorageState } from "synced-storage/react";

const STORAGE_KEY = "jandh:recent-emoticons";

const MAX_RECENTS = 16;

const NO_RECENTS: string[] = [];

/**
 * REQUIREMENTS.md § 13.6. The 최근 사용 section, per device.
 *
 * INFO: `localStorage` through `synced-storage`, which § 5.2. bans for auth state only — this is a per-device convenience with nothing to leak.
 */
export function useRecentEmoticons() {
  const [stored, setRecentIds] = useStorageState<string[]>(STORAGE_KEY, NO_RECENTS, {
    strategy: "localStorage",
  });

  // WARN: The stored value is whatever a previous build wrote, so it is validated rather than trusted — a shape change must not throw inside the picker's first render.
  const recentIds = Array.isArray(stored) ? stored.filter(isId) : NO_RECENTS;

  const remember = useCallback(
    (id: string) => {
      setRecentIds((previous) =>
        [
          id,
          ...(Array.isArray(previous) ? previous.filter(isId) : []).filter((known) => known !== id),
        ].slice(0, MAX_RECENTS),
      );
    },
    [setRecentIds],
  );

  return { recentIds, remember };
}

function isId(value: unknown): value is string {
  return typeof value === "string";
}
