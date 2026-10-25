import { apiError } from "@/shared/api";
import {
  PIN_LOCKOUT_MS,
  PIN_MAX_ATTEMPTS,
  decryptServerString,
  deriveServerEcdhKey,
  encryptServerString,
  ensureSessionEncryptionKey,
  getServerEcdhPublicKey,
  getSessionContext,
  hashPin,
  verifyPin,
} from "@/shared/auth";
import { getDb, users } from "@/shared/db";
import type { UserId } from "@/shared/lib";
import { eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import { z } from "zod";

const outerBodySchema = z.object({
  clientPublicKey: z.string().min(1),
  payload: z.string().min(1),
});

const pinRegex = /^\d{6}$/;

const innerPayloadSchema = z.discriminatedUnion("mode", [
  z.object({
    mode: z.literal("verify"),
    pin: z.string().regex(pinRegex),
  }),
  z.object({
    mode: z.literal("setup"),
    pin: z.string().regex(pinRegex),
  }),
  z.object({
    mode: z.literal("change"),
    currentPin: z.string().regex(pinRegex),
    newPin: z.string().regex(pinRegex),
  }),
]);

async function handleFailedAttempt(
  userId: UserId,
  currentAttempts: number,
  now: number,
): Promise<NextResponse> {
  const attempts = currentAttempts + 1;

  if (attempts >= PIN_MAX_ATTEMPTS) {
    const lockedUntil = new Date(now + PIN_LOCKOUT_MS);
    await getDb()
      .update(users)
      .set({
        pinFailedAttempts: 0,
        pinLockedUntil: lockedUntil,
      })
      .where(eq(users.id, userId));

    return NextResponse.json(
      {
        error: "too_many_attempts",
        lockedUntil: lockedUntil.toISOString(),
        remainingAttempts: 0,
      },
      { status: 429 },
    );
  }

  await getDb().update(users).set({ pinFailedAttempts: attempts }).where(eq(users.id, userId));

  return NextResponse.json(
    {
      error: "unauthorized",
      remainingAttempts: PIN_MAX_ATTEMPTS - attempts,
      lockedUntil: null,
    },
    { status: 401 },
  );
}

export async function GET() {
  const context = await getSessionContext();
  if (!context) {
    return apiError("unauthorized");
  }

  const sessionKey = ensureSessionEncryptionKey(context.session);
  const serverPublicKey = getServerEcdhPublicKey(sessionKey);
  const now = Date.now();
  const isLocked = Boolean(
    context.user.pinLockedUntil && context.user.pinLockedUntil.getTime() > now,
  );
  const remainingAttempts = isLocked
    ? 0
    : Math.max(0, PIN_MAX_ATTEMPTS - context.user.pinFailedAttempts);

  return NextResponse.json({
    serverPublicKey,
    hasPin: context.user.pinHash !== null,
    isLocked,
    lockedUntil: context.user.pinLockedUntil?.toISOString() ?? null,
    remainingAttempts,
  });
}

export async function POST(request: Request) {
  const context = await getSessionContext();
  if (!context) {
    return apiError("unauthorized");
  }

  const outerParsed = outerBodySchema.safeParse(await request.json().catch(() => null));
  if (!outerParsed.success) {
    return apiError("invalid_request");
  }

  const sessionKey = ensureSessionEncryptionKey(context.session);
  const ecdhKey = deriveServerEcdhKey(sessionKey, outerParsed.data.clientPublicKey);
  if (!ecdhKey) {
    return apiError("invalid_request");
  }

  const decryptedText = decryptServerString(ecdhKey, outerParsed.data.payload);
  if (!decryptedText) {
    return apiError("invalid_request");
  }

  let innerJson: unknown;
  try {
    innerJson = JSON.parse(decryptedText);
  } catch {
    return apiError("invalid_request");
  }

  const innerParsed = innerPayloadSchema.safeParse(innerJson);
  if (!innerParsed.success) {
    return apiError("invalid_request");
  }

  const data = innerParsed.data;
  const now = Date.now();

  if (context.user.pinLockedUntil && context.user.pinLockedUntil.getTime() > now) {
    return NextResponse.json(
      {
        error: "too_many_attempts",
        lockedUntil: context.user.pinLockedUntil.toISOString(),
        remainingAttempts: 0,
      },
      { status: 429 },
    );
  }

  const effectiveAttempts =
    context.user.pinLockedUntil && context.user.pinLockedUntil.getTime() <= now
      ? 0
      : context.user.pinFailedAttempts;

  if (data.mode === "setup") {
    if (context.user.pinHash !== null) {
      return apiError("conflict");
    }

    const pinHash = await hashPin(data.pin);
    await getDb()
      .update(users)
      .set({
        pinHash,
        pinFailedAttempts: 0,
        pinLockedUntil: null,
      })
      .where(eq(users.id, context.user.id));
  } else if (data.mode === "verify") {
    if (context.user.pinHash === null) {
      return apiError("invalid_request");
    }

    const isValid = await verifyPin(data.pin, context.user.pinHash);
    if (!isValid) {
      return handleFailedAttempt(context.user.id, effectiveAttempts, now);
    }

    if (context.user.pinFailedAttempts > 0 || context.user.pinLockedUntil !== null) {
      await getDb()
        .update(users)
        .set({
          pinFailedAttempts: 0,
          pinLockedUntil: null,
        })
        .where(eq(users.id, context.user.id));
    }
  } else if (data.mode === "change") {
    if (context.user.pinHash === null) {
      return apiError("invalid_request");
    }

    const isValid = await verifyPin(data.currentPin, context.user.pinHash);
    if (!isValid) {
      return handleFailedAttempt(context.user.id, effectiveAttempts, now);
    }

    const newHash = await hashPin(data.newPin);
    await getDb()
      .update(users)
      .set({
        pinHash: newHash,
        pinFailedAttempts: 0,
        pinLockedUntil: null,
      })
      .where(eq(users.id, context.user.id));
  }

  const encryptedResult = encryptServerString(ecdhKey, JSON.stringify({ sessionKey }));

  return NextResponse.json({ payload: encryptedResult });
}
