"use client";

import { isSnowflake, type EmoticonItemId } from "@/shared/lib";
import { useCallback } from "react";
import { useStorageState } from "synced-storage/react";

const STORAGE_KEY = "jandh:recent-emoticons";

const MAX_RECENTS = 16;

const NO_RECENTS: EmoticonItemId[] = [];

/**
 * REQUIREMENTS.md § 13.6. The 최근 사용 section, per device.
 *
 * INFO: `localStorage` through `synced-storage`, which § 5.2. bans for auth state only — this is a per-device convenience with nothing to leak.
 */
export function useRecentEmoticons() {
  const [stored, setRecentIds] = useStorageState<EmoticonItemId[]>(STORAGE_KEY, NO_RECENTS, {
    strategy: "localStorage",
  });

  // WARN: The stored value is whatever a previous build wrote, so it is validated rather than trusted — a shape change must not throw inside the picker's first render.
  const recentIds = Array.isArray(stored) ? stored.filter(isId) : NO_RECENTS;

  const remember = useCallback(
    (id: EmoticonItemId) => {
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

// WARN: REQUIREMENTS.md § 6. Shape-checked, not merely typed — the stored list is whatever a previous build wrote, and a uuid left there by one is not an id any row answers to any more.
function isId(value: unknown): value is EmoticonItemId {
  return typeof value === "string" && isSnowflake(value);
}
