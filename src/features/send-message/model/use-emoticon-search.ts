"use client";

import type { Emoticon } from "@/entities/emoticon";
import { splitKeywordQuery } from "@/shared/config";
import { A_SECOND } from "@/shared/lib";
import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { toEmoticonSearchQuery } from "./emoticon-search-query";

/**
 * INFO: REQUIREMENTS.md § 13.9. Long enough that a Korean field — which commits a
 * jamo at a time, so `고민` is typed as `ㄱ`, `고`, `곰`, `고미`, `고민` — asks once
 * rather than five times, and short enough that the row still lands inside the same
 * glance as the keystroke.
 */
const SEARCH_DEBOUNCE = A_SECOND / 5;

// WARN: Hoisted so a search with nothing to show answers the same array every render — an inline `= []` mints a new identity, which the picker then passes to a memoized row as a change.
const NO_RESULTS: Emoticon[] = [];

export type EmoticonSearch = {
  results: Emoticon[];
  /**
   * Whether the field has asked something the results do not yet answer
   * (REQUIREMENTS.md § 13.9.).
   *
   * WARN: False for an empty field, which has asked nothing. § 13.9.'s fallback to
   * the revealed item's own pack is gated on this, and an item with no keywords is
   * exactly the case that fallback exists for — reported as pending, its row would
   * stay empty forever.
   *
   * WARN: False once the request has failed, and that is not the same as answered.
   * The search is a request now, so a failure leaves `data` undefined for good —
   * reported as pending, the pane would sit blank with no verdict and no error, which
   * is what it did.
   */
  isPending: boolean;
  /**
   * Whether the last thing the field asked came back an error
   * (REQUIREMENTS.md § 13.9.1.).
   */
  hasFailed: boolean;
};

/**
 * REQUIREMENTS.md § 13.9. The search tab's results, answered by the server
 * (§ 13.9.1.).
 *
 * WARN: `isActive` is the tab rather than the panel. The picker never unmounts, so a
 * finished search left in the field would otherwise keep re-asking for it from
 * whatever pack the user walked to next.
 *
 * WARN: § 13.9. `hasReveal` is not a filter on the results — it is what tells a
 * keystroke from a jump, and the previous answer is only worth keeping across the
 * first of those.
 */
export function useEmoticonSearch(
  query: string,
  isActive: boolean,
  hasReveal: boolean,
): EmoticonSearch {
  const debounced = useDebounced(query);
  const hasQuery = splitKeywordQuery(query).length > 0;
  const isAsked = isActive && splitKeywordQuery(debounced).length > 0;
  const { data, isFetching, isError } = useQuery({
    ...toEmoticonSearchQuery(debounced),
    enabled: isAsked,
    // INFO: § 13.8. The row keeps the previous word's answer while the next one is fetched — blanked between keystrokes it flickers once per character on the app's narrowest surface.
    // WARN: § 13.9. And **not** across a 따라하기, which is the one query change that is not a keystroke. A reveal replaces the field wholesale with another emoticon's words, so the answer being held over is the previous search's — drawn behind the tapped item and inside its ring, it reads as "these are related", which is the one thing it is not. Typing releases the reveal, so nothing keyed on it can flicker per character.
    placeholderData: hasReveal ? undefined : keepPreviousData,
  });
  // WARN: § 13.9.1. Gated on the **debounced** query matching the field, because `isError` belongs to the debounced one. Read off the raw field, `검색하지 못했어요` stayed up over a word the search had not been asked for yet — and `!hasFailed` below held pending down with it.
  const hasFailed = isAsked && debounced === query && isError;

  return {
    // WARN: Emptied on an emptied field rather than left holding the last answer. `단어를 입력해 보세요` is what an empty field shows, and a row of results under it reads as the field having been ignored.
    results: hasQuery ? (data ?? NO_RESULTS) : NO_RESULTS,
    // WARN: `!hasFailed` is what unlatches this. `data` stays undefined after an error and `isFetching` goes false, so the two terms beside it would hold pending forever — and `toEmptyMessage` answers the empty string for the whole of pending.
    isPending: !hasFailed && hasQuery && (debounced !== query || isFetching || data === undefined),
    hasFailed,
  };
}

/**
 * INFO: The field is the source and this trails it, so the caller can still compare
 * the two — which is how "typed but not yet asked" is told from "asked and answered".
 */
function useDebounced(query: string): string {
  const [settled, setSettled] = useState(query);

  useEffect(() => {
    const timer = setTimeout(() => setSettled(query), SEARCH_DEBOUNCE);

    return () => clearTimeout(timer);
  }, [query]);

  return settled;
}
