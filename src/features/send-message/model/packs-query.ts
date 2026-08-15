import { fetchEmoticonPacks } from "../api/fetch-packs";

/**
 * REQUIREMENTS.md § 13.6. The one description of the pack list, shared by the panel
 * that draws its tabs and the preload that has to reach it first.
 *
 * WARN: Never restate the key at a call site. Two spellings of it are two caches, and the preload would then warm a list the panel never reads — leaving the stutter it exists to remove exactly where it was.
 * WARN: `0` is declared rather than omitted, and the omission was a bug. `getQueryClient` defaults every query to `A_MINUTE`, so the § 13.5. guarantee that a rename, a reorder or a hide lands the next time the panel opens held only once a minute had passed.
 *
 * WARN: **The panel no longer relies on this**, and a reader changing it must know why. § 13.6. mounts the picker on an idle frame rather than on the tap, so a `0` honoured at *its* mount is a packs request per visit to a room nobody opened the panel in. The picker overrides this window and re-asks on the open's own rising edge instead. What the `0` still governs is every other reader — and it stays declared, since an omitted one is `getQueryClient`'s minute rather than none.
 */
export function toEmoticonPacksQuery() {
  return {
    queryKey: ["emoticon-packs"] as const,
    queryFn: fetchEmoticonPacks,
    staleTime: 0,
  };
}
