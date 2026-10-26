import "server-only";

import type { Nullable } from "@/shared/lib";
import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";
import { generateQrSvg } from "./qr";

const RFC_BASE32_ALPHABET = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";
export const TOTP_STEP_SECONDS = 30;
export const TOTP_WINDOW_STEPS = 1;
export const TOTP_MAX_ATTEMPTS = 5;
export const TOTP_LOCKOUT_MS = 15 * 60 * 1000;

export function base32Encode(buffer: Buffer): string {
  let bits = 0;
  let value = 0;
  let output = "";

  for (let i = 0; i < buffer.length; i++) {
    value = (value << 8) | buffer[i]!;
    bits += 8;

    while (bits >= 5) {
      output += RFC_BASE32_ALPHABET[(value >>> (bits - 5)) & 31];
      bits -= 5;
    }
  }

  if (bits > 0) {
    output += RFC_BASE32_ALPHABET[(value << (5 - bits)) & 31];
  }

  return output;
}

export function base32Decode(str: string): Buffer {
  const clean = str.toUpperCase().replace(/[\s=-]+/g, "");
  let bits = 0;
  let value = 0;
  const bytes: number[] = [];

  for (let i = 0; i < clean.length; i++) {
    const val = RFC_BASE32_ALPHABET.indexOf(clean[i]!);
    if (val === -1) {
      throw new Error(`Invalid Base32 character: ${clean[i]}`);
    }
    value = (value << 5) | val;
    bits += 5;

    if (bits >= 8) {
      bytes.push((value >>> (bits - 8)) & 0xff);
      bits -= 8;
    }
  }

  return Buffer.from(bytes);
}

// INFO: Generates standard 160-bit (20 bytes) random secret in Base32.
export function generateTotpSecret(bytes = 20): string {
  return base32Encode(randomBytes(bytes));
}

// INFO: RFC 6238 TOTP computation using HMAC-SHA1 and dynamic truncation.
export function computeTotp(secretBase32: string, step: number): string {
  const counterBuf = Buffer.alloc(8);
  counterBuf.writeBigInt64BE(BigInt(step), 0);

  const secretBuf = base32Decode(secretBase32);
  const hmac = createHmac("sha1", secretBuf).update(counterBuf).digest();

  const offset = hmac[hmac.length - 1]! & 0x0f;
  const code =
    ((hmac[offset]! & 0x7f) << 24) |
    ((hmac[offset + 1]! & 0xff) << 16) |
    ((hmac[offset + 2]! & 0xff) << 8) |
    (hmac[offset + 3]! & 0xff);

  return (code % 1_000_000).toString().padStart(6, "0");
}

export type VerifyTotpResult =
  | { ok: true; matchedStep: number }
  | { ok: false; error: "invalid_code" | "replayed" | "invalid_secret" };

export function verifyTotp(
  code: string,
  secretBase32: string,
  options?: {
    window?: number;
    currentSec?: number;
    lastUsedStep?: Nullable<number>;
  },
): VerifyTotpResult {
  const cleanCode = code.trim();
  if (!/^\d{6}$/.test(cleanCode)) {
    return { ok: false, error: "invalid_code" };
  }

  const currentSec = options?.currentSec ?? Math.floor(Date.now() / 1000);
  const currentStep = Math.floor(currentSec / TOTP_STEP_SECONDS);
  const window = options?.window ?? TOTP_WINDOW_STEPS;
  const lastUsedStep = options?.lastUsedStep ?? null;

  let matchedStep: Nullable<number> = null;

  for (let offset = -window; offset <= window; offset++) {
    const step = currentStep + offset;
    try {
      const expected = computeTotp(secretBase32, step);
      if (
        cleanCode.length === expected.length &&
        timingSafeEqual(Buffer.from(cleanCode), Buffer.from(expected))
      ) {
        matchedStep = step;
        break;
      }
    } catch {
      return { ok: false, error: "invalid_secret" };
    }
  }

  if (matchedStep === null) {
    return { ok: false, error: "invalid_code" };
  }

  // SEC: Anti-replay protection prevents re-submitting a code that was already used.
  if (lastUsedStep !== null && matchedStep <= lastUsedStep) {
    return { ok: false, error: "replayed" };
  }

  return { ok: true, matchedStep };
}

export function formatTotpUri(accountName: string, secretBase32: string, issuer = "jandh"): string {
  const cleanIssuer = encodeURIComponent(issuer.trim());
  const cleanAccount = encodeURIComponent(accountName.trim());
  return `otpauth://totp/${cleanIssuer}:${cleanAccount}?secret=${secretBase32}&issuer=${cleanIssuer}&algorithm=SHA1&digits=6&period=${TOTP_STEP_SECONDS}`;
}

export function generateTotpQrSvg(uri: string): string {
  return generateQrSvg(uri, 3);
}
