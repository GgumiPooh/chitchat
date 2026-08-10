import { HOME_ROUTE } from "@/shared/config";
import { redirect } from "next/navigation";

/**
 * REQUIREMENTS.md § 5.2. Unreachable in practice — `proxy.ts` answers `/` with the
 * same hop before routing, and it is in the matcher.
 *
 * WARN: It reads no session, and must not start. That is what keeps this route static
 * rather than `◐` (§ 1.1.): a `requireUserOrRedirect()` here would put a document and
 * a `<Suspense>` fallback in front of a redirect that renders nothing by design. The
 * validation lives on `HOME_ROUTE` itself, which every path through here reaches.
 */
export default function Page() {
  redirect(HOME_ROUTE);
}
