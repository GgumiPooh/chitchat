import { OfflinePage } from "@/pages/offline";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "오프라인",
};

// WARN: REQUIREMENTS.md § 16. Statically rendered on purpose — the service worker precaches this response, so anything dynamic would be frozen at the moment of the install rather than re-read.
export const dynamic = "force-static";

export default function Page() {
  return <OfflinePage />;
}
