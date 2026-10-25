"use client";

import { useOfficeMode, type EmoticonPackId, type Nullable } from "@/shared/lib";
import { useQuery } from "@tanstack/react-query";
import { useCallback, useMemo } from "react";
import { toEmoticonPacksQuery } from "./packs-query";

/**
 * Hook providing Office Mode pack-hiding checks across the emoticon feature.
 * When Office Mode is enabled, any pack with `hideInOffice: true` will be reported as hidden.
 */
export function useHiddenEmoticonPacks() {
  const { isOfficeMode } = useOfficeMode();
  const { data: packs = [] } = useQuery(toEmoticonPacksQuery());

  const hiddenPackIds = useMemo(() => {
    if (!isOfficeMode) {
      return new Set<EmoticonPackId>();
    }
    return new Set(packs.filter((pack) => pack.hideInOffice).map((pack) => pack.id));
  }, [isOfficeMode, packs]);

  const isPackHidden = useCallback(
    (packId: Nullable<EmoticonPackId | string> | undefined) => {
      if (!isOfficeMode || !packId) {
        return false;
      }
      return hiddenPackIds.has(packId as EmoticonPackId);
    },
    [isOfficeMode, hiddenPackIds],
  );

  return { isOfficeMode, hiddenPackIds, isPackHidden, packs };
}
