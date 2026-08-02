import { clearSessionCookie, getCurrentUser } from "@/shared/auth";
import { HOME_ROUTE, LOGIN_ROUTE } from "@/shared/config";
import { NextResponse, type NextRequest } from "next/server";

export async function GET(request: NextRequest) {
  // WARN: A cross-site `<img src>` can reach this route with the cookie attached, so a still-valid session must survive it — otherwise any page on the web could log the user out.
  if (await getCurrentUser()) {
    return NextResponse.redirect(new URL(HOME_ROUTE, request.url));
  }

  await clearSessionCookie();

  return NextResponse.redirect(new URL(LOGIN_ROUTE, request.url));
}
