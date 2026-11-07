import { redirectTo } from "@/shared/api";
import {
  getCurrentUser,
  getGoogleClient,
  GOOGLE_CALENDAR_SCOPES,
  setCalendarOAuthIntent,
  setOAuthCookies,
} from "@/shared/auth";
import { LOGIN_ROUTE } from "@/shared/config";
import { generateCodeVerifier, generateState } from "arctic";
import { NextResponse, type NextRequest } from "next/server";

export async function GET(request: NextRequest) {
  const user = await getCurrentUser();

  if (!user) {
    return redirectTo(LOGIN_ROUTE);
  }

  const state = generateState();
  const codeVerifier = generateCodeVerifier();
  const authorizationUrl = getGoogleClient(request.headers.get("host")).createAuthorizationURL(
    state,
    codeVerifier,
    GOOGLE_CALENDAR_SCOPES,
  );

  authorizationUrl.searchParams.set("access_type", "offline");
  authorizationUrl.searchParams.set("prompt", "consent select_account");
  authorizationUrl.searchParams.set("include_granted_scopes", "true");

  await setOAuthCookies(state, codeVerifier);
  await setCalendarOAuthIntent(user.id);

  return NextResponse.redirect(authorizationUrl);
}
