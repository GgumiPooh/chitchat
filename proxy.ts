import {
  HOME_ROUTE,
  LOGIN_ROUTE,
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

  const response = NextResponse.next();

  // INFO: The client half of the sliding renewal in `getSessionContext` — the row's new expiry is invisible to the browser without it.
  response.cookies.set(SESSION_COOKIE_NAME, sessionToken, SESSION_COOKIE_OPTIONS);

  return response;
}

export const config = {
  // WARN: `/api/auth/*` must stay out — the callback sets the cookie, so gating it would deadlock login.
  // WARN: `robots.txt` must stay out too, or crawlers get a redirect to `/login` instead of `Disallow: /` (REQUIREMENTS.md § 14.).
  // WARN: So must `sw.js` — the browser fetches the worker without following redirects, so gating it fails registration outright and silently takes push with it (§ 16.1.).
  matcher: [
    "/((?!api|_next/static|_next/image|icons|favicon.ico|icon.svg|robots.txt|sw.js|manifest.webmanifest).*)",
  ],
};
