import { upsertGoogleUser } from "@/entities/user";
import { redirectTo } from "@/shared/api";
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
import type { NextRequest } from "next/server";

// INFO: REQUIREMENTS.md § 14. The login screen turns these into Korean copy; nothing internal is exposed.
type CallbackError = "denied" | "failed" | "not_allowed" | "unverified";

function toLoginRedirect(error: CallbackError) {
  return redirectTo(`${LOGIN_ROUTE}?error=${error}`);
}

export async function GET(request: NextRequest) {
  const { searchParams } = request.nextUrl;
  const code = searchParams.get("code");
  const state = searchParams.get("state");
  const { state: storedState, codeVerifier } = await readOAuthCookies();

  await clearOAuthCookies();

  if (searchParams.get("error")) {
    return toLoginRedirect("denied");
  }
  if (!code || !state || !storedState || !codeVerifier || state !== storedState) {
    return toLoginRedirect("failed");
  }

  try {
    const tokens = await getGoogleClient().validateAuthorizationCode(code, codeVerifier);
    const identity = await verifyGoogleIdToken(tokens.idToken());

    if (!identity.emailVerified) {
      return toLoginRedirect("unverified");
    }
    if (!isAllowedEmail(identity.email)) {
      return toLoginRedirect("not_allowed");
    }

    const user = await upsertGoogleUser(identity);

    const token = await createSession(user.id, toDeviceLabel(request.headers.get("user-agent")));

    await setSessionCookie(token);

    return redirectTo(HOME_ROUTE);
  } catch (error) {
    // INFO: The user only ever sees the generic Korean copy (REQUIREMENTS.md § 14.), so without this a failed login is undiagnosable.
    console.error("Google OAuth callback failed", error);

    return toLoginRedirect("failed");
  }
}
