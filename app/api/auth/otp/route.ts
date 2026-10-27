import "server-only";

import { apiError } from "@/shared/api";
import {
  formatTotpUri,
  generateTotpQrSvg,
  generateTotpSecret,
  getSessionContext,
} from "@/shared/auth";
import { getDb, users } from "@/shared/db";
import { eq } from "drizzle-orm";
import { NextResponse } from "next/server";

export async function GET() {
  const context = await getSessionContext();
  if (!context) {
    return apiError("unauthorized");
  }

  if (!context.user.totpSecret || !context.user.totpEnabled) {
    const secret = context.user.totpSecret || generateTotpSecret();
    await getDb()
      .update(users)
      .set({
        totpSecret: secret,
        totpEnabled: true,
      })
      .where(eq(users.id, context.user.id));
  }

  return NextResponse.json({
    hasOtp: true,
  });
}

// INFO: Generates a fresh TOTP secret in pending state (totpEnabled: false) and returns URI and SVG QR code.
export async function POST() {
  const context = await getSessionContext();
  if (!context) {
    return apiError("unauthorized");
  }

  const secret = generateTotpSecret();
  const uri = formatTotpUri(context.user.email, secret);
  const qrSvg = generateTotpQrSvg(uri);

  await getDb()
    .update(users)
    .set({
      totpSecret: secret,
      totpEnabled: false,
      totpFailedAttempts: 0,
      totpLockedUntil: null,
    })
    .where(eq(users.id, context.user.id));

  return NextResponse.json({
    secret,
    uri,
    qrSvg,
  });
}

// INFO: Disables TOTP authentication for the current user.
export async function DELETE() {
  const context = await getSessionContext();
  if (!context) {
    return apiError("unauthorized");
  }

  await getDb()
    .update(users)
    .set({
      totpSecret: null,
      totpEnabled: false,
      totpFailedAttempts: 0,
      totpLockedUntil: null,
      lastUsedTotpStep: null,
    })
    .where(eq(users.id, context.user.id));

  return NextResponse.json({ ok: true });
}
