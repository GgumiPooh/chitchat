import { connectGoogleCalendarAccount, syncUserGoogleCalendar } from "@/entities/google-calendar";
import { upsertGoogleUser } from "@/entities/user";
import { redirectTo } from "@/shared/api";
import {
  clearOAuthCookies,
  clearUserPin,
  consumeCalendarOAuthIntent,
  consumePinResetCookie,
  createSession,
  getCurrentUser,
  getGoogleClient,
  GOOGLE_CALENDAR_SCOPE,
  isAllowedEmail,
  readOAuthCookies,
  setSessionCookie,
  takePostLoginRoute,
  toDeviceLabel,
  verifyGoogleIdToken,
} from "@/shared/auth";
import { CALENDAR_SETTINGS_ROUTE, LOGIN_ROUTE } from "@/shared/config";
import { safelyRunAsync } from "@/shared/lib";
import { after, type NextRequest } from "next/server";

// INFO: REQUIREMENTS.md § 14. The login screen turns these into Korean copy; nothing internal is exposed.
type CallbackError = "denied" | "failed" | "not_allowed" | "unverified";

function toLoginRedirect(error: CallbackError) {
  return redirectTo(`${LOGIN_ROUTE}?error=${error}`);
}

export async function GET(request: NextRequest) {
  const { searchParams } = request.nextUrl;
  const code = searchParams.get("code");
  const state = searchParams.get("state");
  const calendarIntentUserId = await consumeCalendarOAuthIntent();
  const { state: storedState, codeVerifier } = await readOAuthCookies();

  await clearOAuthCookies();

  if (calendarIntentUserId !== null) {
    const currentUser = await getCurrentUser();

    if (!currentUser || currentUser.id !== calendarIntentUserId) {
      return redirectTo(LOGIN_ROUTE);
    }

    if (searchParams.get("error")) {
      return redirectTo(`${CALENDAR_SETTINGS_ROUTE}?error=denied`);
    }

    if (!code || !state || !storedState || !codeVerifier || state !== storedState) {
      return redirectTo(`${CALENDAR_SETTINGS_ROUTE}?error=failed`);
    }

    try {
      const tokens = await getGoogleClient(request.headers.get("host")).validateAuthorizationCode(
        code,
        codeVerifier,
      );

      if (!tokens.hasScopes() || !tokens.scopes().includes(GOOGLE_CALENDAR_SCOPE)) {
        await getGoogleClient(request.headers.get("host"))
          .revokeToken(tokens.accessToken())
          .catch(() => undefined);

        return redirectTo(`${CALENDAR_SETTINGS_ROUTE}?error=missing_scope`);
      }

      const identity = await verifyGoogleIdToken(tokens.idToken());

      if (!identity.emailVerified) {
        return redirectTo(`${CALENDAR_SETTINGS_ROUTE}?error=unverified`);
      }

      const refreshToken = tokens.hasRefreshToken() ? tokens.refreshToken() : undefined;
      const accessToken = tokens.accessToken();
      const accessTokenExpiresAt = tokens.accessTokenExpiresAt();

      const connected = await connectGoogleCalendarAccount({
        accessToken,
        accessTokenExpiresAt,
        googleEmail: identity.email,
        refreshToken,
        userId: currentUser.id,
      });

      if (!connected) {
        return redirectTo(`${CALENDAR_SETTINGS_ROUTE}?error=no_refresh_token`);
      }

      after(() =>
        safelyRunAsync(async () => {
          await syncUserGoogleCalendar(currentUser.id);
        }),
      );

      return redirectTo(`${CALENDAR_SETTINGS_ROUTE}?connected=1`);
    } catch (error) {
      console.error("Google Calendar OAuth callback failed", error);

      return redirectTo(`${CALENDAR_SETTINGS_ROUTE}?error=failed`);
    }
  }

  if (searchParams.get("error")) {
    return toLoginRedirect("denied");
  }
  if (!code || !state || !storedState || !codeVerifier || state !== storedState) {
    return toLoginRedirect("failed");
  }

  try {
    const tokens = await getGoogleClient(request.headers.get("host")).validateAuthorizationCode(
      code,
      codeVerifier,
    );
    const identity = await verifyGoogleIdToken(tokens.idToken());

    if (!identity.emailVerified) {
      return toLoginRedirect("unverified");
    }
    if (!isAllowedEmail(identity.email)) {
      return toLoginRedirect("not_allowed");
    }

    const user = await upsertGoogleUser(identity);

    if (tokens.hasScopes() && tokens.scopes().includes(GOOGLE_CALENDAR_SCOPE)) {
      const refreshToken = tokens.hasRefreshToken() ? tokens.refreshToken() : undefined;
      const accessToken = tokens.accessToken();
      const accessTokenExpiresAt = tokens.accessTokenExpiresAt();

      const connected = await connectGoogleCalendarAccount({
        accessToken,
        accessTokenExpiresAt,
        googleEmail: identity.email,
        refreshToken,
        userId: user.id,
      });

      if (connected) {
        after(() =>
          safelyRunAsync(async () => {
            await syncUserGoogleCalendar(user.id);
          }),
        );
      }
    }

    if (await consumePinResetCookie()) {
      await clearUserPin(user.id);
    }

    const token = await createSession(user.id, toDeviceLabel(request.headers.get("user-agent")));

    await setSessionCookie(token);

    return redirectTo(await takePostLoginRoute());
  } catch (error) {
    // INFO: The user only ever sees the generic Korean copy (REQUIREMENTS.md § 14.), so without this a failed login is undiagnosable.
    console.error("Google OAuth callback failed", error);

    return toLoginRedirect("failed");
  }
}
