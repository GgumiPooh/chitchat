import "server-only";

import { apiError } from "@/shared/api";
import { getSessionContext, verifyTotp } from "@/shared/auth";
import { getDb, users } from "@/shared/db";
import { eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import { z } from "zod";

const verifyBodySchema = z.object({
  code: z
    .string()
    .trim()
    .regex(/^\d{6}$/),
});

export async function POST(request: Request) {
  const context = await getSessionContext();
  if (!context) {
    return apiError("unauthorized");
  }

  if (!context.user.totpSecret) {
    return apiError("invalid_request");
  }

  const rawJson = await request.json().catch(() => null);
  const parsed = verifyBodySchema.safeParse(rawJson);
  if (!parsed.success) {
    return apiError("invalid_request");
  }

  const result = verifyTotp(parsed.data.code, context.user.totpSecret, {
    lastUsedStep: context.user.lastUsedTotpStep,
  });

  if (!result.ok) {
    return NextResponse.json(
      {
        ok: false,
        error: result.error,
      },
      { status: 400 },
    );
  }

  await getDb()
    .update(users)
    .set({
      totpEnabled: true,
      lastUsedTotpStep: result.matchedStep,
      totpFailedAttempts: 0,
      totpLockedUntil: null,
    })
    .where(eq(users.id, context.user.id));

  return NextResponse.json({ ok: true });
}
