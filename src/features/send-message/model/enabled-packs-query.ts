import { fetchEnabledPacks } from "../api/fetch-enabled-packs";

/**
 * REQUIREMENTS.md § 13.6. The one description of the enabled-pack list, shared by
 * the panel that renders it and the preload that has to reach it first.
 *
 * WARN: Never restate the key at a call site. Two spellings of it are two caches, and the preload would then warm a list the panel never reads — leaving the stutter it exists to remove exactly where it was.
 * INFO: No `staleTime`. The list changes from § 13.5.'s screens, which are routes of their own, so the panel remounting is the moment to re-ask — and it re-asks over data that is already on screen, which is what the preload bought.
 */
export function toEnabledPacksQuery() {
  return {
    queryKey: ["emoticon-packs", "enabled"] as const,
    queryFn: fetchEnabledPacks,
  };
}
