import { upsertGoogleUser } from "@/entities/user";
import { redirectTo } from "@/shared/api";
import {
  createSession,
  isAllowedEmail,
  setSessionCookie,
  takePostLoginRoute,
  toDeviceLabel,
} from "@/shared/auth";
import { IS_DEV_LOGIN_ENABLED, LOGIN_ROUTE } from "@/shared/config";
import { NextResponse, type NextRequest } from "next/server";

// INFO: REQUIREMENTS.md § 5.4. The login screen turns these into the same Korean copy the OAuth callback uses.
type DevLoginError = "failed" | "not_allowed";

// WARN: 303, not the 307 `redirectTo` defaults to — a 307 would replay this POST against the target page.
function toLoginRedirect(error: DevLoginError) {
  return redirectTo(`${LOGIN_ROUTE}?error=${error}`, 303);
}

export async function POST(request: NextRequest) {
  if (!IS_DEV_LOGIN_ENABLED) {
    return new NextResponse(null, { status: 404 });
  }

  const email = String((await request.formData()).get("email") ?? "")
    .trim()
    .toLowerCase();

  if (!isAllowedEmail(email)) {
    return toLoginRedirect("not_allowed");
  }

  try {
    // WARN: A synthetic `google_sub` — signing in through Google afterwards relinks the same row back to the real subject id (`upsertGoogleUser`), so the two paths cannot fork into two users.
    const user = await upsertGoogleUser({ sub: `dev:${email}`, email });

    await setSessionCookie(
      await createSession(user.id, toDeviceLabel(request.headers.get("user-agent"))),
    );

    return redirectTo(await takePostLoginRoute(), 303);
  } catch (error) {
    console.error("Dev login failed", error);

    return toLoginRedirect("failed");
  }
}
