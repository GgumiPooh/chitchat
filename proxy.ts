import { HOME_ROUTE, LOGIN_ROUTE, SESSION_COOKIE_NAME } from "@/shared/config";
import { NextResponse, type NextRequest } from "next/server";

/**
 * Optimistic gate only — it checks that the cookie exists, never that it is valid
 * (REQUIREMENTS.md § 5.2.). Real validation is a database read, which belongs in
 * Server Components and Route Handlers.
 */
export function proxy(request: NextRequest) {
  const hasSessionCookie = request.cookies.has(SESSION_COOKIE_NAME);
  const isLoginRoute = request.nextUrl.pathname === LOGIN_ROUTE;

  if (!hasSessionCookie && !isLoginRoute) {
    return NextResponse.redirect(new URL(LOGIN_ROUTE, request.url));
  }
  if (hasSessionCookie && isLoginRoute) {
    return NextResponse.redirect(new URL(HOME_ROUTE, request.url));
  }

  return NextResponse.next();
}

export const config = {
  // WARN: `/api/auth/*` must stay out — the callback sets the cookie, so gating it would deadlock login.
  matcher: ["/((?!api|_next/static|_next/image|favicon.ico|icon.svg|manifest.webmanifest).*)"],
};
