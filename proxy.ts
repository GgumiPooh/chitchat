import {
  CHAT_ROUTE,
  HOME_ROUTE,
  LOGIN_ROUTE,
  MAX_PENDING_SHARE_BYTES,
  PENDING_SHARE_COOKIE_NAME,
  PENDING_SHARE_COOKIE_OPTIONS,
  ROOT_ROUTE,
  SESSION_COOKIE_NAME,
  SESSION_COOKIE_OPTIONS,
  SHARE_TARGET_PARAMS,
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
    if (isLoginRoute) {
      return NextResponse.next();
    }

    const response = NextResponse.redirect(new URL(LOGIN_ROUTE, request.url));

    rememberPendingShare(request, response);

    return response;
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

/**
 * REQUIREMENTS.md § 7. A share sheet reaches this app whether or not a session
 * cookie is there, and login lands on `HOME_ROUTE` with nothing of the share left on
 * it — so the query is parked here and `takePostLoginRoute` spends it.
 *
 * WARN: The search string alone, never the path. The destination is `HOME_ROUTE`
 * either way, which is what keeps a cookie an attacker can write from becoming an
 * open redirect.
 *
 * WARN: The **cookie** being absent, which is not the same as the session being dead
 * (§ 5.2.) — a share arriving on a cookie whose row is gone is bounced by
 * `requireUserOrRedirect` to `SESSION_EXPIRE_ROUTE`, which this never sees, and is
 * lost. Parking it on that branch too would resend the share of anyone who logs out
 * and back in within `PENDING_SHARE_COOKIE_OPTIONS`' window.
 */
function rememberPendingShare(request: NextRequest, response: NextResponse): void {
  const { pathname, search, searchParams } = request.nextUrl;
  // WARN: Anchored on the share target's own path (`app/manifest.ts`), never on the parameter names alone — `text` and `url` are ordinary words, and the matcher covers § 13.7.'s zone, whose query strings this repository does not own.
  const isShare =
    pathname === CHAT_ROUTE &&
    Object.values(SHARE_TARGET_PARAMS).some((name) => searchParams.has(name));

  // WARN: Dropped rather than truncated past the 4096 bytes a cookie may carry, which `set` percent-encodes into at up to 9 bytes per Hangul syllable — over it the browser discards the whole `Set-Cookie` silently, and a half-share is worse than the login landing bare.
  if (!isShare || encodeURIComponent(search).length > MAX_PENDING_SHARE_BYTES) {
    return;
  }

  response.cookies.set(PENDING_SHARE_COOKIE_NAME, search, PENDING_SHARE_COOKIE_OPTIONS);
}

export const config = {
  // WARN: `/api/auth/*` must stay out — the callback sets the cookie, so gating it would deadlock login.
  // WARN: `robots.txt` must stay out too, or crawlers get a redirect to `/login` instead of `Disallow: /` (REQUIREMENTS.md § 14.).
  // WARN: So must `sw.js` — the browser fetches the worker without following redirects, so gating it fails registration outright and silently takes push with it (§ 16.1.).
  // WARN: And so must `offline` — it is what the worker answers a failed navigation with, so gating it would redirect the fallback to a `/login` that is equally unreachable (§ 16.).
  // WARN: The exclusions above are anchored at the first segment, so they do not cover the multi-zone's copies of them — `emoticons/_next` and `emoticons/api` are named again or every asset that zone serves runs through this gate and redirects to `/login` while signed out (§ 13.7.).
  // WARN: `ffmpeg` is § 9.'s wasm core, fetched by `toBlobURL` — gated, an expired session answers the `/login` HTML with a 200 that gets wrapped as the wasm and handed to ffmpeg. Both zones' copies are named, for the multi-zone reason above.
  // INFO: `/emoticons` pages are deliberately left in. The gate belongs on this side of the rewrite: answering the redirect here saves a round trip to the other origin only to be sent back.
  matcher: [
    "/((?!api|emoticons/_next|emoticons/api|emoticons/ffmpeg|ffmpeg|_next/static|_next/image|icons|favicon.ico|icon.svg|robots.txt|sw.js|offline|manifest.webmanifest).*)",
  ],
};
