import type { Emoticon } from "@/entities/emoticon";
import { A_MINUTE } from "@/shared/lib";
import { keepPreviousData, skipToken, type SkipToken } from "@tanstack/react-query";
import { fetchEmoticonsByIds } from "../api/fetch-emoticons";

// WARN: Spelled out rather than inferred, for `pack-items-query.ts`'s reason — a returned `skipToken` widens to `symbol`.
type EmoticonsByIdsQuery = {
  queryKey: readonly ["emoticon-items", string[]];
  queryFn: SkipToken | (() => Promise<Emoticon[]>);
  staleTime: number;
  placeholderData: typeof keepPreviousData;
};

/**
 * REQUIREMENTS.md § 13.6. One description of the items behind a list of ids, which is
 * how 최근 사용 resolves what it stored.
 *
 * WARN: Sorted, and the key is the sorted list. 최근 사용 re-orders itself on every
 * send, and keyed on its own order each send would mint a fresh cache entry and
 * re-ask for the same sixteen items — the caller reapplies its order over the answer.
 *
 * INFO: A stale window for `pack-items-query.ts`'s reason: an item changes only from
 * § 13.4.'s authoring screens, and the list is asked again whenever a send puts an id
 * in it that was not there before.
 *
 * WARN: § 13.6. Every send mints a fresh key, so without `keepPreviousData` the tab
 * emptied on each one — the panel's own guard reads `isPending` and draws nothing at
 * all, which is a blank 최근 사용 after every emoticon sent. What is held over is the
 * same fifteen items the new key asks for again plus one, so nothing here is shown
 * under a heading it does not belong to; the caller maps its ids through the answer
 * and the id still resolving is simply absent for a round trip.
 */
export function toEmoticonsByIdsQuery(ids: string[]): EmoticonsByIdsQuery {
  const sorted = [...ids].sort();

  return {
    queryKey: ["emoticon-items", sorted] as const,
    queryFn: sorted.length === 0 ? skipToken : () => fetchEmoticonsByIds(sorted),
    staleTime: A_MINUTE,
    placeholderData: keepPreviousData,
  };
}
