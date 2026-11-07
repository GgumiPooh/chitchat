import {
  clearOAuthCookies,
  getGoogleClient,
  GOOGLE_CALENDAR_SCOPES,
  setOAuthCookies,
} from "@/shared/auth";
import { generateCodeVerifier, generateState } from "arctic";
import { type NextRequest, NextResponse } from "next/server";

export async function GET(request: NextRequest) {
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

  await clearOAuthCookies();
  await setOAuthCookies(state, codeVerifier);

  return NextResponse.redirect(authorizationUrl);
}
