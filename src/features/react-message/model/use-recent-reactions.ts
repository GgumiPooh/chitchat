"use client";

import type { EmoticonItemId } from "@/shared/lib";
import { useCallback } from "react";
import { useStorageState } from "synced-storage/react";

const STORAGE_KEY = "jandh:recent-reactions";
const MAX_RECENTS = 24;

export type StoredRecentReaction =
  { kind: "emoji"; value: string } | { kind: "emoticon"; value: EmoticonItemId };

const NO_RECENTS: StoredRecentReaction[] = [];

export function useRecentReactions() {
  const [storedReactions, setStoredReactions] = useStorageState<StoredRecentReaction[]>(
    STORAGE_KEY,
    NO_RECENTS,
    { strategy: "localStorage" },
  );

  const recentReactions = Array.isArray(storedReactions) ? storedReactions : NO_RECENTS;

  const remember = useCallback(
    (reaction: StoredRecentReaction) => {
      setStoredReactions((previous) => {
        const list = Array.isArray(previous) ? previous : [];
        const filtered = list.filter(
          (item) => !(item.kind === reaction.kind && item.value === reaction.value),
        );
        return [reaction, ...filtered].slice(0, MAX_RECENTS);
      });
    },
    [setStoredReactions],
  );

  return { recentReactions, rememberReaction: remember };
}
