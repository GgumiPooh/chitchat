import { ensureConversation } from "@/entities/conversation";
import { upsertGoogleUser } from "@/entities/user";
import { createSession, isAllowedEmail, setSessionCookie, toDeviceLabel } from "@/shared/auth";
import { HOME_ROUTE, IS_DEV_LOGIN_ENABLED, LOGIN_ROUTE } from "@/shared/config";
import { NextResponse, type NextRequest } from "next/server";

// INFO: REQUIREMENTS.md § 5.4. The login screen turns these into the same Korean copy the OAuth callback uses.
type DevLoginError = "failed" | "not_allowed";

// WARN: 303, not the `NextResponse.redirect` default of 307 — a 307 would replay this POST against the target page.
function toRedirect(request: NextRequest, path: string, error?: DevLoginError) {
  const url = new URL(path, request.url);

  if (error) {
    url.searchParams.set("error", error);
  }

  return NextResponse.redirect(url, 303);
}

export async function POST(request: NextRequest) {
  if (!IS_DEV_LOGIN_ENABLED) {
    return new NextResponse(null, { status: 404 });
  }

  const email = String((await request.formData()).get("email") ?? "")
    .trim()
    .toLowerCase();

  if (!isAllowedEmail(email)) {
    return toRedirect(request, LOGIN_ROUTE, "not_allowed");
  }

  try {
    await ensureConversation();

    // WARN: A synthetic `google_sub` — signing in through Google afterwards relinks the same row back to the real subject id (`upsertGoogleUser`), so the two paths cannot fork into two users.
    const user = await upsertGoogleUser({ sub: `dev:${email}`, email });

    await setSessionCookie(
      await createSession(user.id, toDeviceLabel(request.headers.get("user-agent"))),
    );

    return toRedirect(request, HOME_ROUTE);
  } catch (error) {
    console.error("Dev login failed", error);

    return toRedirect(request, LOGIN_ROUTE, "failed");
  }
}
