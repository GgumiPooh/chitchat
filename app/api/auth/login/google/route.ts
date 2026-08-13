import { GOOGLE_SCOPES, getGoogleClient, setOAuthCookies } from "@/shared/auth";
import { generateCodeVerifier, generateState } from "arctic";
import { NextResponse, type NextRequest } from "next/server";

export async function GET(request: NextRequest) {
  const state = generateState();
  const codeVerifier = generateCodeVerifier();
  const authorizationUrl = getGoogleClient(request.nextUrl.origin).createAuthorizationURL(
    state,
    codeVerifier,
    GOOGLE_SCOPES,
  );

  await setOAuthCookies(state, codeVerifier);

  return NextResponse.redirect(authorizationUrl);
}
