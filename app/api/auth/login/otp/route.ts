import "server-only";

import { apiError } from "@/shared/api";
import {
  checkOtpThrottle,
  clearUserPin,
  consumePinResetCookie,
  createSessionWithKey,
  recordOtpThrottleFailure,
  resetOtpIpThrottle,
  setSessionCookie,
  takePostLoginRoute,
  toDeviceLabel,
  verifyTotp,
  type VerifyTotpResult,
} from "@/shared/auth";
import {
  SESSION_COOKIE_DOMAIN,
  TEMP_SESSION_COOKIE_NAME,
  TEMP_SESSION_DURATION,
  TEMP_SESSION_MAX_AGE_SECONDS,
} from "@/shared/config";
import { getDb, users, type User } from "@/shared/db";
import { eq } from "drizzle-orm";
import { cookies } from "next/headers";
import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";

const loginBodySchema = z.object({
  code: z
    .string()
    .trim()
    .regex(/^\d{6}$/),
});

function getClientIp(request: NextRequest): string {
  const forwarded = request.headers.get("x-forwarded-for");
  if (forwarded) {
    const first = forwarded.split(",")[0]?.trim();
    if (first) {
      return first;
    }
  }
  return request.headers.get("x-real-ip")?.trim() || "127.0.0.1";
}

export async function GET(request: NextRequest) {
  const ip = getClientIp(request);
  const status = await checkOtpThrottle(ip);

  return NextResponse.json(status);
}

export async function POST(request: NextRequest) {
  const ip = getClientIp(request);

  // SEC: Check multi-instance PostgreSQL UNLOGGED auth_throttles status
  const throttle = await checkOtpThrottle(ip);
  if (throttle.isLocked) {
    return NextResponse.json(
      {
        ok: false,
        error: "too_many_attempts",
        remainingSeconds: throttle.remainingSeconds,
        lockedUntil: throttle.lockedUntil,
      },
      { status: 429 },
    );
  }

  const rawJson = await request.json().catch(() => null);
  const parsed = loginBodySchema.safeParse(rawJson);
  if (!parsed.success) {
    return apiError("invalid_request");
  }

  const { code } = parsed.data;
  const db = getDb();

  // INFO: Queries all users with active TOTP enrollment (maximum 2 participants).
  const enrolledUsers = await db.select().from(users).where(eq(users.totpEnabled, true));

  if (enrolledUsers.length === 0) {
    return NextResponse.json(
      {
        ok: false,
        error: "no_totp_enrolled",
      },
      { status: 400 },
    );
  }

  const now = Date.now();
  const matchedUsers: Array<{ user: User; result: Extract<VerifyTotpResult, { ok: true }> }> = [];
  let hasReplayed = false;

  for (const user of enrolledUsers) {
    if (!user.totpSecret) {
      continue;
    }

    if (user.totpLockedUntil && user.totpLockedUntil.getTime() > now) {
      continue;
    }

    const verification = verifyTotp(code, user.totpSecret, {
      lastUsedStep: user.lastUsedTotpStep,
    });

    if (verification.ok) {
      matchedUsers.push({ user, result: verification });
    } else if (verification.error === "replayed") {
      hasReplayed = true;
    }
  }

  if (matchedUsers.length === 0) {
    const failStatus = await recordOtpThrottleFailure(ip);

    if (failStatus.isLocked) {
      return NextResponse.json(
        {
          ok: false,
          error: "too_many_attempts",
          remainingSeconds: failStatus.remainingSeconds,
          lockedUntil: failStatus.lockedUntil,
        },
        { status: 429 },
      );
    }

    return NextResponse.json(
      {
        ok: false,
        error: hasReplayed ? "replayed" : "invalid_code",
        remainingAttempts: failStatus.remainingAttempts,
      },
      { status: 401 },
    );
  }

  if (matchedUsers.length > 1) {
    return NextResponse.json(
      {
        ok: false,
        error: "collision",
      },
      { status: 409 },
    );
  }

  const { user: matchingUser, result: verification } = matchedUsers[0]!;

  // INFO: Multi-instance reset of IP throttle upon successful verification.
  await resetOtpIpThrottle(ip);

  // SEC: Record the consumed step immediately to prevent replay attacks.
  await db
    .update(users)
    .set({
      lastUsedTotpStep: verification.matchedStep,
      totpFailedAttempts: 0,
      totpLockedUntil: null,
    })
    .where(eq(users.id, matchingUser.id));

  if (await consumePinResetCookie()) {
    await clearUserPin(matchingUser.id);
  }

  const deviceLabel = toDeviceLabel(request.headers.get("user-agent"));
  const { token, encryptionKey } = await createSessionWithKey(
    matchingUser.id,
    deviceLabel,
    TEMP_SESSION_DURATION,
  );
  await setSessionCookie(token, { maxAgeSeconds: TEMP_SESSION_MAX_AGE_SECONDS });

  const cookieStore = await cookies();
  cookieStore.set(TEMP_SESSION_COOKIE_NAME, "1", {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    domain: SESSION_COOKIE_DOMAIN,
    maxAge: TEMP_SESSION_MAX_AGE_SECONDS,
  });

  const redirectUrl = await takePostLoginRoute();

  return NextResponse.json({
    ok: true,
    sessionKey: encryptionKey,
    redirectUrl,
  });
}
