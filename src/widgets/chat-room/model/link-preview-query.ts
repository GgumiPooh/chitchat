import { withoutFragment } from "@/shared/lib";
import { fetchLinkPreview } from "../api/fetch-link-preview";

/**
 * REQUIREMENTS.md § 8.9. The one description of the lookup, shared by the card that
 * renders a preview and the prefetch that has to reach it first (§ 8.3.).
 */
export function toLinkPreviewQuery(url: string) {
  // INFO: The card still links to the URL as it was typed; only the lookup drops the fragment, so two bubbles pointing at different anchors of one page share a cache entry instead of a round trip each.
  const target = withoutFragment(url);

  return {
    queryKey: ["link-preview", target] as const,
    queryFn: () => fetchLinkPreview(target),
    // WARN: The answer is already cached server-side for days (§ 8.9.), so a refetch on mount would be a request per scroll back onto the bubble that can only return what it returned before.
    staleTime: Infinity,
    gcTime: Infinity,
    retry: false,
  };
}
