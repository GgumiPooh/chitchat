import { fetchEmoticonPacks } from "../api/fetch-packs";

/**
 * REQUIREMENTS.md § 13.6. The one description of the pack list, shared by the panel
 * that draws its tabs and the preload that has to reach it first.
 *
 * WARN: Never restate the key at a call site. Two spellings of it are two caches, and the preload would then warm a list the panel never reads — leaving the stutter it exists to remove exactly where it was.
 * WARN: `0` is declared rather than omitted, and the omission was a bug. `getQueryClient` defaults every query to `A_MINUTE`, so the § 13.5. guarantee that a rename, a reorder or a hide lands the next time the panel opens held only once a minute had passed. The list changes from § 13.5.'s screens, which are routes of their own, so the panel remounting is the moment to re-ask — and it re-asks over data already on screen, which is what the preload bought.
 */
export function toEmoticonPacksQuery() {
  return {
    queryKey: ["emoticon-packs"] as const,
    queryFn: fetchEmoticonPacks,
    staleTime: 0,
  };
}
