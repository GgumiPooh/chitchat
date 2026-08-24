import "server-only";

import { HOME_ROUTE, PENDING_SHARE_COOKIE_NAME } from "@/shared/config";
import { cookies } from "next/headers";

// WARN: REQUIREMENTS.md § 7. The cookie is written by `proxy.ts` and readable by nothing else, but a browser can still be handed one by hand — so the value is spent only in the shape a query string has, or it is a `Location` header the caller composes out of arbitrary text.
const SEARCH_PATTERN = /^\?[^\s]*$/;

/**
 * Where a finished login lands: `HOME_ROUTE`, carrying the § 7. share the proxy
 * parked if the sheet reached this app on an expired cookie.
 */
export async function takePostLoginRoute(): Promise<string> {
  const cookieStore = await cookies();
  const search = cookieStore.get(PENDING_SHARE_COOKIE_NAME)?.value;

  if (!search) {
    return HOME_ROUTE;
  }

  cookieStore.delete(PENDING_SHARE_COOKIE_NAME);

  return SEARCH_PATTERN.test(search) ? `${HOME_ROUTE}${search}` : HOME_ROUTE;
}
