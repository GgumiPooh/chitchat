import { OfflineMirrorPage } from "@/pages/offline-mirror";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "오프라인",
};

/**
 * REQUIREMENTS.md § 16. The cached document the service worker answers a failed
 * navigation with, for every path that has a mirror.
 *
 * WARN: Static, and it has to stay that way — the worker precaches this response, so
 * a cookie, a header or a `searchParams` read would both make it dynamic and freeze
 * whatever it read at the moment of the install. The screen is chosen in the browser
 * from `location.pathname` instead.
 *
 * WARN: Under `/offline` deliberately. `proxy.ts`'s matcher excludes that first
 * segment, and anything outside it is answered with a 307 to `/login` — which
 * `cache.add` stores as a redirected response, and returning one of those for a
 * navigation is a network error rather than a page.
 */
export const dynamic = "force-static";

export default function Page() {
  return <OfflineMirrorPage />;
}
