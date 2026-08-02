import { GOOGLE_SCOPES, getGoogleClient, setOAuthCookies } from "@/shared/auth";
import { generateCodeVerifier, generateState } from "arctic";
import { NextResponse } from "next/server";

export async function GET() {
  const state = generateState();
  const codeVerifier = generateCodeVerifier();
  const authorizationUrl = getGoogleClient().createAuthorizationURL(
    state,
    codeVerifier,
    GOOGLE_SCOPES,
  );

  await setOAuthCookies(state, codeVerifier);

  return NextResponse.redirect(authorizationUrl);
}
