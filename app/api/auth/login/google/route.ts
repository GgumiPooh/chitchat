import { clearOAuthCookies, getGoogleClient, GOOGLE_SCOPES, setOAuthCookies } from "@/shared/auth";
import { generateCodeVerifier, generateState } from "arctic";
import { type NextRequest, NextResponse } from "next/server";

export async function GET(request: NextRequest) {
  const state = generateState();
  const codeVerifier = generateCodeVerifier();
  const authorizationUrl = getGoogleClient(request.headers.get("host")).createAuthorizationURL(
    state,
    codeVerifier,
    GOOGLE_SCOPES,
  );

  // INFO: REQUIREMENTS.md § 5.1. Without this Google skips the chooser for a single signed-in account, so a not_allowed login cannot be retried as anyone else.
  authorizationUrl.searchParams.set("prompt", "select_account");

  await clearOAuthCookies();
  await setOAuthCookies(state, codeVerifier);

  return NextResponse.redirect(authorizationUrl);
}
