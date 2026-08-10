import { AN_HOUR } from "@/shared/lib";
import { fetchEmoticonKeywords } from "../api/fetch-keywords";

/**
 * REQUIREMENTS.md § 13.8. The one description of the underline's keyword set.
 *
 * INFO: A long stale window, because a keyword is only written from § 13.4.'s sheet
 * and § 13.8.1.'s suggester — authoring screens, which are routes of their own and
 * not ones a composer is on. Being an hour behind costs a word not yet underlined.
 *
 * INFO: The window is on the descriptor rather than the caller, which is the
 * opposite of `packs-query.ts` — that list has a preload wanting it warm and a panel
 * wanting it fresh, where both readers of this one want the same thing.
 *
 * WARN: § 13.6. `useEmoticonPreload` is the only reader that fetches it. The composer
 * takes it from the cache with `enabled: false`, because it mounts with the room and
 * an enabled query there is a request on every room entry — which is the cost that
 * moved the pack list onto that hook's idle callback in the first place.
 */
export function toEmoticonKeywordsQuery() {
  return {
    queryKey: ["emoticon-keywords"] as const,
    queryFn: fetchEmoticonKeywords,
    staleTime: AN_HOUR,
  };
}
