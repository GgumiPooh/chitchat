import "server-only";

import { authThrottles, getDb } from "@/shared/db";
import type { Nullable } from "@/shared/lib";
import { inArray, sql } from "drizzle-orm";

export const OTP_GLOBAL_THROTTLE_KEY = "otp:global";
export const OTP_GLOBAL_WINDOW_MS = 10 * 60 * 1000; // 10 minutes
export const OTP_GLOBAL_MAX_FAILS = 5;
export const OTP_GLOBAL_LOCK_MS = 15 * 60 * 1000; // 15 minutes

export const OTP_IP_WINDOW_MS = 15 * 60 * 1000; // 15 minutes
export const OTP_IP_STEP1_FAILS = 3;
export const OTP_IP_STEP1_LOCK_MS = 60 * 1000; // 1 minute
export const OTP_IP_STEP2_FAILS = 5;
export const OTP_IP_STEP2_LOCK_MS = 15 * 60 * 1000; // 15 minutes

export function getOtpIpThrottleKey(ip: string): string {
  return `otp:ip:${ip.trim()}`;
}

export type ThrottleCheckResult = {
  isLocked: boolean;
  lockedUntil: Nullable<string>;
  remainingAttempts: number;
  remainingSeconds: number;
};

/**
 * Multi-instance check against PostgreSQL UNLOGGED auth_throttles.
 */
export async function checkOtpThrottle(ip: string): Promise<ThrottleCheckResult> {
  const db = getDb();
  const now = Date.now();
  const globalKey = OTP_GLOBAL_THROTTLE_KEY;
  const ipKey = getOtpIpThrottleKey(ip);

  const rows = await db
    .select()
    .from(authThrottles)
    .where(inArray(authThrottles.key, [globalKey, ipKey]));

  const globalRow = rows.find((r) => r.key === globalKey);
  const ipRow = rows.find((r) => r.key === ipKey);

  let activeLockedUntil: Nullable<number> = null;

  if (globalRow?.lockedUntil && globalRow.lockedUntil.getTime() > now) {
    activeLockedUntil = globalRow.lockedUntil.getTime();
  }
  if (ipRow?.lockedUntil && ipRow.lockedUntil.getTime() > now) {
    const ipUntil = ipRow.lockedUntil.getTime();
    activeLockedUntil = activeLockedUntil ? Math.max(activeLockedUntil, ipUntil) : ipUntil;
  }

  if (activeLockedUntil !== null) {
    const remainingSeconds = Math.ceil((activeLockedUntil - now) / 1000);
    return {
      isLocked: true,
      remainingSeconds,
      lockedUntil: new Date(activeLockedUntil).toISOString(),
      remainingAttempts: 0,
    };
  }

  const isGlobalWindowActive =
    globalRow && now - globalRow.windowStartedAt.getTime() < OTP_GLOBAL_WINDOW_MS;
  const globalAttempts = isGlobalWindowActive ? globalRow.failedAttempts : 0;
  const globalRemaining = Math.max(0, OTP_GLOBAL_MAX_FAILS - globalAttempts);

  const isIpWindowActive = ipRow && now - ipRow.windowStartedAt.getTime() < OTP_IP_WINDOW_MS;
  const ipAttempts = isIpWindowActive ? ipRow.failedAttempts : 0;
  const ipRemaining = Math.max(0, OTP_IP_STEP2_FAILS - ipAttempts);

  const remainingAttempts = Math.min(globalRemaining, ipRemaining);

  return {
    isLocked: false,
    remainingSeconds: 0,
    lockedUntil: null,
    remainingAttempts,
  };
}

/**
 * Atomically records an OTP failure for both global circuit breaker and IP.
 * Executes on PostgreSQL UNLOGGED auth_throttles (shared RAM buffer, zero WAL fsync).
 */
export async function recordOtpThrottleFailure(ip: string): Promise<{
  isLocked: boolean;
  lockedUntil: Nullable<string>;
  remainingAttempts: number;
  remainingSeconds: number;
}> {
  const db = getDb();
  const now = Date.now();
  const globalKey = OTP_GLOBAL_THROTTLE_KEY;
  const ipKey = getOtpIpThrottleKey(ip);

  // 1. Atomically update global circuit breaker
  // Window: 10 minutes, Threshold: 5 fails -> 15 min lock
  const globalRows = await db.execute<{
    failed_attempts: number;
    locked_until: Nullable<Date>;
  }>(sql`
    INSERT INTO auth_throttles ("key", "failed_attempts", "window_started_at", "locked_until", "updated_at")
    VALUES (${globalKey}, 1, now(), NULL, now())
    ON CONFLICT ("key") DO UPDATE
    SET
      failed_attempts = CASE
        WHEN auth_throttles.window_started_at < now() - INTERVAL '10 minutes' THEN 1
        ELSE auth_throttles.failed_attempts + 1
      END,
      window_started_at = CASE
        WHEN auth_throttles.window_started_at < now() - INTERVAL '10 minutes' THEN now()
        ELSE auth_throttles.window_started_at
      END,
      locked_until = CASE
        WHEN (CASE WHEN auth_throttles.window_started_at < now() - INTERVAL '10 minutes' THEN 1 ELSE auth_throttles.failed_attempts + 1 END) >= ${OTP_GLOBAL_MAX_FAILS}
          THEN now() + INTERVAL '15 minutes'
        ELSE NULL
      END,
      updated_at = now()
    RETURNING failed_attempts, locked_until;
  `);

  // 2. Atomically update IP throttle
  // Window: 15 minutes; >=5 fails -> 15 min lock; >=3 fails -> 1 min cooldown
  const ipRows = await db.execute<{ failed_attempts: number; locked_until: Nullable<Date> }>(sql`
    INSERT INTO auth_throttles ("key", "failed_attempts", "window_started_at", "locked_until", "updated_at")
    VALUES (${ipKey}, 1, now(), NULL, now())
    ON CONFLICT ("key") DO UPDATE
    SET
      failed_attempts = CASE
        WHEN auth_throttles.window_started_at < now() - INTERVAL '15 minutes' THEN 1
        ELSE auth_throttles.failed_attempts + 1
      END,
      window_started_at = CASE
        WHEN auth_throttles.window_started_at < now() - INTERVAL '15 minutes' THEN now()
        ELSE auth_throttles.window_started_at
      END,
      locked_until = CASE
        WHEN (CASE WHEN auth_throttles.window_started_at < now() - INTERVAL '15 minutes' THEN 1 ELSE auth_throttles.failed_attempts + 1 END) >= ${OTP_IP_STEP2_FAILS}
          THEN now() + INTERVAL '15 minutes'
        WHEN (CASE WHEN auth_throttles.window_started_at < now() - INTERVAL '15 minutes' THEN 1 ELSE auth_throttles.failed_attempts + 1 END) >= ${OTP_IP_STEP1_FAILS}
          THEN now() + INTERVAL '1 minute'
        ELSE NULL
      END,
      updated_at = now()
    RETURNING failed_attempts, locked_until;
  `);

  const globalRow = globalRows[0];
  const ipRow = ipRows[0];

  const globalLockedUntil = globalRow?.locked_until
    ? new Date(globalRow.locked_until).getTime()
    : null;
  const ipLockedUntil = ipRow?.locked_until ? new Date(ipRow.locked_until).getTime() : null;

  let activeLockedUntil: Nullable<number> = null;
  if (globalLockedUntil && globalLockedUntil > now) {
    activeLockedUntil = globalLockedUntil;
  }
  if (ipLockedUntil && ipLockedUntil > now) {
    activeLockedUntil = activeLockedUntil
      ? Math.max(activeLockedUntil, ipLockedUntil)
      : ipLockedUntil;
  }

  if (activeLockedUntil !== null) {
    const remainingSeconds = Math.ceil((activeLockedUntil - now) / 1000);
    return {
      isLocked: true,
      remainingSeconds,
      lockedUntil: new Date(activeLockedUntil).toISOString(),
      remainingAttempts: 0,
    };
  }

  const globalAttempts = globalRow ? Number(globalRow.failed_attempts) : 0;
  const ipAttempts = ipRow ? Number(ipRow.failed_attempts) : 0;

  const remainingAttempts = Math.max(
    0,
    Math.min(OTP_GLOBAL_MAX_FAILS - globalAttempts, OTP_IP_STEP2_FAILS - ipAttempts),
  );

  return {
    isLocked: false,
    remainingSeconds: 0,
    lockedUntil: null,
    remainingAttempts,
  };
}

/**
 * Resets IP throttle upon successful verification.
 */
export async function resetOtpIpThrottle(ip: string): Promise<void> {
  const db = getDb();
  const ipKey = getOtpIpThrottleKey(ip);
  await db.delete(authThrottles).where(sql`${authThrottles.key} = ${ipKey}`);
}
