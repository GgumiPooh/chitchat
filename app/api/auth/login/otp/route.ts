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
import { getDb, users, type User } from "@/shared/db";
import type { Nullable } from "@/shared/lib";
import { eq } from "drizzle-orm";
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

export async function POST(request: NextRequest) {
  const now = Date.now();
  pruneIpAttempts(now);

  const ip = getClientIp(request);
  const ipRecord = ipAttemptMap.get(ip);

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
    return NextResponse.json(
      {
        ok: false,
        error: hasReplayed ? "replayed" : "invalid_code",
        remainingAttempts: TOTP_MAX_ATTEMPTS - attempts,
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
  const { token, encryptionKey } = await createSessionWithKey(matchingUser.id, deviceLabel);
  await setSessionCookie(token);

  const redirectUrl = await takePostLoginRoute();

  return NextResponse.json({
    ok: true,
    sessionKey: encryptionKey,
    redirectUrl,
  });
}
