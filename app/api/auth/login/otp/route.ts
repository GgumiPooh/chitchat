import "server-only";

import { apiError } from "@/shared/api";
import {
  clearUserPin,
  consumePinResetCookie,
  createSessionWithKey,
  setSessionCookie,
  takePostLoginRoute,
  toDeviceLabel,
  TOTP_LOCKOUT_MS,
  TOTP_MAX_ATTEMPTS,
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
import type { Nullable } from "@/shared/lib";
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

type IpAttemptRecord = {
  attempts: number;
  lockedUntil: Nullable<number>;
};

// SEC: In-memory IP-based brute-force throttle for 6-digit OTP logins.
const ipAttemptMap = new Map<string, IpAttemptRecord>();
let lastIpPruneAt = Date.now();
const PRUNE_INTERVAL_MS = 60_000;

// SEC: Global Circuit Breaker — prevents distributed botnet brute force across rotating IPs.
// If total failed OTP attempts across all IPs exceed 5 in 60s, shut down OTP login for 15 minutes.
const GLOBAL_MAX_FAILED_ATTEMPTS = 5;
const GLOBAL_WINDOW_MS = 60_000;
const GLOBAL_LOCKOUT_MS = 15 * 60 * 1000;

let globalRecentFails: number[] = [];
let globalLockedUntil: Nullable<number> = null;

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

function pruneGlobalCircuitBreaker(now: number): void {
  if (globalLockedUntil !== null && globalLockedUntil <= now) {
    globalLockedUntil = null;
    globalRecentFails = [];
  }
  globalRecentFails = globalRecentFails.filter((ts) => now - ts < GLOBAL_WINDOW_MS);
}

function pruneIpAttempts(now: number): void {
  if (now - lastIpPruneAt < PRUNE_INTERVAL_MS && ipAttemptMap.size < 1000) {
    return;
  }
  lastIpPruneAt = now;
  for (const [ip, record] of ipAttemptMap) {
    if (record.lockedUntil !== null && record.lockedUntil <= now) {
      ipAttemptMap.delete(ip);
    }
  }
}

export async function GET(request: NextRequest) {
  const now = Date.now();
  pruneGlobalCircuitBreaker(now);
  pruneIpAttempts(now);

  const ip = getClientIp(request);
  const ipRecord = ipAttemptMap.get(ip);

  let activeLockedUntil: Nullable<number> = null;
  if (globalLockedUntil && globalLockedUntil > now) {
    activeLockedUntil = globalLockedUntil;
  }
  if (ipRecord?.lockedUntil && ipRecord.lockedUntil > now) {
    activeLockedUntil = activeLockedUntil
      ? Math.max(activeLockedUntil, ipRecord.lockedUntil)
      : ipRecord.lockedUntil;
  }

  if (activeLockedUntil) {
    const remainingSeconds = Math.ceil((activeLockedUntil - now) / 1000);
    return NextResponse.json({
      isLocked: true,
      remainingSeconds,
      lockedUntil: new Date(activeLockedUntil).toISOString(),
      remainingAttempts: 0,
    });
  }

  const ipAttempts = ipRecord?.attempts ?? 0;
  const ipRemaining = Math.max(0, TOTP_MAX_ATTEMPTS - ipAttempts);
  const globalRemaining = Math.max(0, GLOBAL_MAX_FAILED_ATTEMPTS - globalRecentFails.length);
  const remainingAttempts = Math.min(ipRemaining, globalRemaining);

  return NextResponse.json({
    isLocked: false,
    remainingAttempts,
    lockedUntil: null,
  });
}

export async function POST(request: NextRequest) {
  const now = Date.now();
  pruneGlobalCircuitBreaker(now);
  pruneIpAttempts(now);

  const ip = getClientIp(request);
  const ipRecord = ipAttemptMap.get(ip);

  // SEC: Check global circuit breaker first
  if (globalLockedUntil && globalLockedUntil > now) {
    const remainingSeconds = Math.ceil((globalLockedUntil - now) / 1000);
    return NextResponse.json(
      {
        ok: false,
        error: "too_many_attempts",
        remainingSeconds,
        lockedUntil: new Date(globalLockedUntil).toISOString(),
      },
      { status: 429 },
    );
  }

  // SEC: Check per-IP lockout
  if (ipRecord?.lockedUntil && ipRecord.lockedUntil > now) {
    const remainingSeconds = Math.ceil((ipRecord.lockedUntil - now) / 1000);
    return NextResponse.json(
      {
        ok: false,
        error: "too_many_attempts",
        remainingSeconds,
        lockedUntil: new Date(ipRecord.lockedUntil).toISOString(),
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
    // SEC: Global fail tracking
    globalRecentFails = globalRecentFails.filter((ts) => now - ts < GLOBAL_WINDOW_MS);
    globalRecentFails.push(now);

    if (globalRecentFails.length >= GLOBAL_MAX_FAILED_ATTEMPTS) {
      globalLockedUntil = now + GLOBAL_LOCKOUT_MS;
      globalRecentFails = [];
      return NextResponse.json(
        {
          ok: false,
          error: "too_many_attempts",
          remainingSeconds: Math.ceil(GLOBAL_LOCKOUT_MS / 1000),
          lockedUntil: new Date(globalLockedUntil).toISOString(),
        },
        { status: 429 },
      );
    }

    const attempts = (ipRecord?.attempts ?? 0) + 1;
    if (attempts >= TOTP_MAX_ATTEMPTS) {
      const lockedUntil = now + TOTP_LOCKOUT_MS;
      ipAttemptMap.set(ip, { attempts: 0, lockedUntil });
      return NextResponse.json(
        {
          ok: false,
          error: "too_many_attempts",
          remainingSeconds: Math.ceil(TOTP_LOCKOUT_MS / 1000),
          lockedUntil: new Date(lockedUntil).toISOString(),
        },
        { status: 429 },
      );
    }

    ipAttemptMap.set(ip, { attempts, lockedUntil: null });
    const remainingAttempts = Math.min(
      TOTP_MAX_ATTEMPTS - attempts,
      GLOBAL_MAX_FAILED_ATTEMPTS - globalRecentFails.length,
    );
    return NextResponse.json(
      {
        ok: false,
        error: hasReplayed ? "replayed" : "invalid_code",
        remainingAttempts: Math.max(0, remainingAttempts),
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

  // INFO: Reset IP throttle upon successful verification.
  ipAttemptMap.delete(ip);

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
