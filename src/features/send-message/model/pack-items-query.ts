import type { Emoticon } from "@/entities/emoticon";
import { A_MINUTE, type Nullable } from "@/shared/lib";
import { skipToken, type SkipToken } from "@tanstack/react-query";
import { fetchPackItems } from "../api/fetch-pack-items";

/**
 * WARN: Spelled out rather than inferred. `skipToken` is a `unique symbol`, and a
 * function that only *returns* one widens it to `symbol` — which React Query's own
 * overloads then refuse.
 */
type EmoticonPackItemsQuery = {
  queryKey: readonly ["emoticon-pack-items", Nullable<string>];
  queryFn: SkipToken | (() => Promise<Emoticon[]>);
  staleTime: number;
};

/**
 * REQUIREMENTS.md § 13.6. One description of a pack's items, keyed by the pack.
 *
 * WARN: Never restate the key at a call site, exactly as `packs-query.ts` says. Three
 * readers ask for the same pack — the open tab, § 13.9.'s fallback and the preload —
 * and two spellings would fetch it two or three times over.
 *
 * INFO: `skipToken` rather than an `enabled` flag, so a caller with no pack in hand
 * needs no second field: 최근 사용 and 검색 are tabs that are not packs, and § 13.9.'s
 * fallback is only reached once the words have found nothing.
 *
 * INFO: A stale window, unlike `packs-query.ts` — items change from § 13.4.'s
 * authoring screens, which are routes of their own, and § 13.6.'s swipe walks a tab
 * at a time. Without it, crossing the strip is a request per tab passed through.
 */
export function toEmoticonPackItemsQuery(packId: Nullable<string>): EmoticonPackItemsQuery {
  return {
    queryKey: ["emoticon-pack-items", packId] as const,
    queryFn: packId === null ? skipToken : () => fetchPackItems(packId),
    staleTime: A_MINUTE,
  };
}
