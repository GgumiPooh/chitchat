import { OfflinePage } from "@/pages/offline";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "오프라인",
};

// WARN: REQUIREMENTS.md § 16. Statically rendered on purpose — the service worker precaches this response, so anything dynamic would be frozen at the moment of the install rather than re-read.
// WARN: `dynamic = "force-static"` is removed because `cacheComponents` rejects it; the staticness is now held by the page reading nothing at runtime, which the build's prerender summary proves. Nothing here may ever read `cookies()`, `headers()` or `searchParams` — a `<Suspense>` fallback is exactly what would be frozen into that precached response.
export default function Page() {
  return <OfflinePage />;
}
