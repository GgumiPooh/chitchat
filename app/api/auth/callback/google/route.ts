import { upsertGoogleUser } from "@/entities/user";
import {
  clearOAuthCookies,
  createSession,
  getGoogleClient,
  isAllowedEmail,
  readOAuthCookies,
  setSessionCookie,
  toDeviceLabel,
  verifyGoogleIdToken,
} from "@/shared/auth";
import { HOME_ROUTE, LOGIN_ROUTE } from "@/shared/config";
import { NextResponse, type NextRequest } from "next/server";

// INFO: REQUIREMENTS.md § 14. The login screen turns these into Korean copy; nothing internal is exposed.
type CallbackError = "denied" | "failed" | "not_allowed" | "unverified";

function toLoginRedirect(request: NextRequest, error: CallbackError) {
  const url = new URL(LOGIN_ROUTE, request.url);

  url.searchParams.set("error", error);

  return NextResponse.redirect(url);
}

export async function GET(request: NextRequest) {
  const { searchParams } = request.nextUrl;
  const code = searchParams.get("code");
  const state = searchParams.get("state");
  const { state: storedState, codeVerifier } = await readOAuthCookies();

  await clearOAuthCookies();

  if (searchParams.get("error")) {
    return toLoginRedirect(request, "denied");
  }
  if (!code || !state || !storedState || !codeVerifier || state !== storedState) {
    return toLoginRedirect(request, "failed");
  }

  try {
    const tokens = await getGoogleClient().validateAuthorizationCode(code, codeVerifier);
    const identity = await verifyGoogleIdToken(tokens.idToken());

    if (!identity.emailVerified) {
      return toLoginRedirect(request, "unverified");
    }
    if (!isAllowedEmail(identity.email)) {
      return toLoginRedirect(request, "not_allowed");
    }

    const user = await upsertGoogleUser(identity);
    const token = await createSession(user.id, toDeviceLabel(request.headers.get("user-agent")));

    await setSessionCookie(token);

    return NextResponse.redirect(new URL(HOME_ROUTE, request.url));
  } catch (error) {
    // INFO: The user only ever sees the generic Korean copy (REQUIREMENTS.md § 14.), so without this a failed login is undiagnosable.
    console.error("Google OAuth callback failed", error);

    return toLoginRedirect(request, "failed");
  }
}
