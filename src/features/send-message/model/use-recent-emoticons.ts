"use client";

import type { EmoticonPackType } from "@/shared/config";
import { isSnowflake, type EmoticonItemId } from "@/shared/lib";
import { useCallback } from "react";
import { useStorageState } from "synced-storage/react";

/**
 * REQUIREMENTS.md § 13.6. One stored list per kind, and the emoticon one keeps the key
 * it has always had — every device already holding recents goes on reading them.
 *
 * WARN: Two lists rather than one read through the open menu's kind, which is what this
 * was. The kinds share a screen but not a size: a run of minis filled all `MAX_RECENTS`
 * slots and 이모티콘's 최근 사용 came back empty, having been evicted by pictures it
 * never draws.
 */
const STORAGE_KEYS: Record<EmoticonPackType, string> = {
  emoticon: "jandh:recent-emoticons",
  mini: "jandh:recent-minis",
};

// INFO: § 13.6. Per kind, so neither can starve the other however hard it is used.
const MAX_RECENTS = 16;

const NO_RECENTS: EmoticonItemId[] = [];

/**
 * REQUIREMENTS.md § 13.6. The 최근 사용 sections, per device.
 *
 * INFO: `localStorage` through `synced-storage`, which § 5.2. bans for auth state only — this is a per-device convenience with nothing to leak.
 */
export function useRecentEmoticons() {
  const [storedEmoticons, setEmoticonIds] = useStorageState<EmoticonItemId[]>(
    STORAGE_KEYS.emoticon,
    NO_RECENTS,
    { strategy: "localStorage" },
  );
  const [storedMinis, setMiniIds] = useStorageState<EmoticonItemId[]>(
    STORAGE_KEYS.mini,
    NO_RECENTS,
    { strategy: "localStorage" },
  );

  const recentIds: Record<EmoticonPackType, EmoticonItemId[]> = {
    emoticon: toIds(storedEmoticons),
    mini: toIds(storedMinis),
  };

  /**
   * WARN: § 13.6. The kind is the caller's to state, because a stored id carries none —
   * and it is read off what the send *carried* rather than off the menu the picture was
   * picked from: § 2.2. puts a mini in `messages.text` as a fragment and an emoticon in
   * `messages.emoticon_item_id`, and neither payload can hold the other kind.
   */
  const remember = useCallback(
    (id: EmoticonItemId, type: EmoticonPackType) => {
      const setIds = type === "mini" ? setMiniIds : setEmoticonIds;

      setIds((previous) =>
        [id, ...toIds(previous).filter((known) => known !== id)].slice(0, MAX_RECENTS),
      );
    },
    [setEmoticonIds, setMiniIds],
  );

  return { recentIds, remember };
}

// WARN: The stored value is whatever a previous build wrote, so it is validated rather than trusted — a shape change must not throw inside the picker's first render.
function toIds(stored: unknown): EmoticonItemId[] {
  return Array.isArray(stored) ? stored.filter(isId) : NO_RECENTS;
}

// WARN: REQUIREMENTS.md § 6. Shape-checked, not merely typed — the stored list is whatever a previous build wrote, and a uuid left there by one is not an id any row answers to any more.
function isId(value: unknown): value is EmoticonItemId {
  return typeof value === "string" && isSnowflake(value);
}
