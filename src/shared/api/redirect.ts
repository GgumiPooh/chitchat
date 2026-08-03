import { NextResponse } from "next/server";

/**
 * A same-origin redirect, sent as a **relative** `Location` (RFC 7231 § 7.1.2.),
 * which the browser resolves against the address it actually asked for.
 *
 * WARN: Not `NextResponse.redirect(new URL(path, request.url))` — `next dev` builds `request.url` from the bound `localhost:3000` and takes only the scheme from `X-Forwarded-Proto`, so behind an HTTPS tunnel that redirects to a `https://localhost:3000` that speaks no TLS.
 */
export function redirectTo(path: string, status: 303 | 307 = 307): NextResponse {
  return new NextResponse(null, { status, headers: { location: path } });
}
