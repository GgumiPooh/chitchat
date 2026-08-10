import {
  HOME_ROUTE,
  LOGIN_ROUTE,
  ROOT_ROUTE,
  SESSION_COOKIE_NAME,
  SESSION_COOKIE_OPTIONS,
} from "@/shared/config";
import { NextResponse, type NextRequest } from "next/server";

/**
 * Optimistic gate only — it checks that the cookie exists, never that it is valid
 * (REQUIREMENTS.md § 5.2.). Real validation is a database read, which belongs in
 * Server Components and Route Handlers.
 */
export function proxy(request: NextRequest) {
  const sessionToken = request.cookies.get(SESSION_COOKIE_NAME)?.value;
  const isLoginRoute = request.nextUrl.pathname === LOGIN_ROUTE;

  if (!sessionToken) {
    return isLoginRoute
      ? NextResponse.next()
      : NextResponse.redirect(new URL(LOGIN_ROUTE, request.url));
  }
  if (isLoginRoute) {
    return NextResponse.redirect(new URL(HOME_ROUTE, request.url));
  }
  /**
   * REQUIREMENTS.md § 5.2. `/` is a prefix with no screen, and the hop belongs here
   * rather than in a Server Component.
   *
   * WARN: It was `app/page.tsx` calling `redirect()` after `requireUserOrRedirect()`.
   * Under § 1.1.'s flag that route is `◐` — a 200 document with a painted spinner and
   * then a client navigation, where it used to be one 307. The cookie is already
   * proven present above, and `HOME_ROUTE`'s own layout still validates the session
   * against the database, so nothing is weakened by answering here: an invalid session
   * lands on `SESSION_EXPIRE_ROUTE` one hop later exactly as it did before.
   */
  if (request.nextUrl.pathname === ROOT_ROUTE) {
    return NextResponse.redirect(new URL(HOME_ROUTE, request.url));
  }

  const response = NextResponse.next();

  // INFO: The client half of the sliding renewal in `getSessionContext` — the row's new expiry is invisible to the browser without it.
  response.cookies.set(SESSION_COOKIE_NAME, sessionToken, SESSION_COOKIE_OPTIONS);

  return response;
}

export const config = {
  // WARN: `/api/auth/*` must stay out — the callback sets the cookie, so gating it would deadlock login.
  // WARN: `robots.txt` must stay out too, or crawlers get a redirect to `/login` instead of `Disallow: /` (REQUIREMENTS.md § 14.).
  // WARN: So must `sw.js` — the browser fetches the worker without following redirects, so gating it fails registration outright and silently takes push with it (§ 16.1.).
  // WARN: And so must `offline` — it is what the worker answers a failed navigation with, so gating it would redirect the fallback to a `/login` that is equally unreachable (§ 16.).
  // WARN: The exclusions above are anchored at the first segment, so they do not cover the multi-zone's copies of them — `emoticons/_next` and `emoticons/api` are named again or every asset that zone serves runs through this gate and redirects to `/login` while signed out (§ 13.7.).
  // INFO: `/emoticons` pages are deliberately left in. The gate belongs on this side of the rewrite: answering the redirect here saves a round trip to the other origin only to be sent back.
  matcher: [
    "/((?!api|emoticons/_next|emoticons/api|_next/static|_next/image|icons|favicon.ico|icon.svg|robots.txt|sw.js|offline|manifest.webmanifest).*)",
  ],
};
