import "server-only";

import { apiError } from "@/shared/api";
import {
  computeTotp,
  generateTotpSecret,
  getSessionContext,
  TOTP_STEP_SECONDS,
} from "@/shared/auth";
import { getDb, users } from "@/shared/db";
import { eq } from "drizzle-orm";
import { NextResponse } from "next/server";

export async function GET() {
  const context = await getSessionContext();
  if (!context) {
    return apiError("unauthorized");
  }

  let secret = context.user.totpSecret;

  // INFO: Auto-provision in-app OTP credentials if not already provisioned.
  if (!secret || !context.user.totpEnabled) {
    secret = secret || generateTotpSecret();
    await getDb()
      .update(users)
      .set({
        totpSecret: secret,
        totpEnabled: true,
        totpFailedAttempts: 0,
        totpLockedUntil: null,
      })
      .where(eq(users.id, context.user.id));
  }

  const nowSec = Math.floor(Date.now() / 1000);
  const currentStep = Math.floor(nowSec / TOTP_STEP_SECONDS);
  const code = computeTotp(secret, currentStep);
  const remainingSeconds = TOTP_STEP_SECONDS - (nowSec % TOTP_STEP_SECONDS);

  return NextResponse.json({
    code,
    period: TOTP_STEP_SECONDS,
    remainingSeconds,
  });
}
