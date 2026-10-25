import "server-only";

import { getDb, users } from "@/shared/db";
import type { Nullable, UserId } from "@/shared/lib";
import { eq } from "drizzle-orm";
import { cookies } from "next/headers";
import {
  createCipheriv,
  createDecipheriv,
  createECDH,
  createHash,
  randomBytes,
  scrypt,
  timingSafeEqual,
  type ECDH,
} from "node:crypto";
import { requireSessionOrRedirect } from "./session";

export const PIN_MAX_ATTEMPTS = 5;
export const PIN_LOCKOUT_MS = 60_000;
const PIN_RESET_COOKIE_NAME = "jandh_pin_reset";

export async function hashPin(pin: string): Promise<string> {
  const salt = randomBytes(16);
  const key = await new Promise<Buffer>((resolve, reject) => {
    scrypt(pin, salt, 64, (err, derivedKey) => {
      if (err) {
        reject(err);
      } else {
        resolve(derivedKey);
      }
    });
  });

  return `${salt.toString("hex")}:${key.toString("hex")}`;
}

export async function verifyPin(pin: string, storedHash: string): Promise<boolean> {
  const [saltHex, keyHex] = storedHash.split(":");
  if (!saltHex || !keyHex) {
    return false;
  }

  const salt = Buffer.from(saltHex, "hex");
  const storedKey = Buffer.from(keyHex, "hex");

  const derivedKey = await new Promise<Buffer>((resolve, reject) => {
    scrypt(pin, salt, 64, (err, key) => {
      if (err) {
        reject(err);
      } else {
        resolve(key);
      }
    });
  });

  if (derivedKey.length !== storedKey.length) {
    return false;
  }

  return timingSafeEqual(derivedKey, storedKey);
}

export function encryptServerString(keyB64: string, plaintext: string): string {
  const keyBuf = Buffer.from(keyB64, "base64url");
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", keyBuf, iv);
  const ciphertext = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  const combined = Buffer.concat([iv, ciphertext, tag]);

  return combined.toString("base64url");
}

export function decryptServerString(keyB64: string, token: string): Nullable<string> {
  try {
    const combined = Buffer.from(token, "base64url");
    // INFO: 12-byte IV + 16-byte auth tag = 28 bytes minimum.
    if (combined.length <= 28) {
      return null;
    }

    const keyBuf = Buffer.from(keyB64, "base64url");
    const iv = combined.subarray(0, 12);
    const ciphertext = combined.subarray(12, combined.length - 16);
    const tag = combined.subarray(combined.length - 16);

    const decipher = createDecipheriv("aes-256-gcm", keyBuf, iv);
    decipher.setAuthTag(tag);

    return Buffer.concat([decipher.update(ciphertext), decipher.final()]).toString("utf8");
  } catch {
    return null;
  }
}

function getSessionEcdh(sessionKeyB64: string): ECDH {
  const ecdh = createECDH("prime256v1");
  const privateKey = createHash("sha256")
    .update(sessionKeyB64)
    .update("jandh-ecdh-p256-v1")
    .digest();
  ecdh.setPrivateKey(privateKey);

  return ecdh;
}

export function getServerEcdhPublicKey(sessionKeyB64: string): string {
  const ecdh = getSessionEcdh(sessionKeyB64);

  return ecdh.getPublicKey().toString("base64url");
}

export function deriveServerEcdhKey(sessionKeyB64: string, clientPubB64: string): Nullable<string> {
  try {
    const ecdh = getSessionEcdh(sessionKeyB64);
    const clientPubBuf = Buffer.from(clientPubB64, "base64url");
    const sharedSecret = ecdh.computeSecret(clientPubBuf);

    return createHash("sha256").update(sharedSecret).digest().toString("base64url");
  } catch {
    return null;
  }
}

export async function encryptServerPayload<T>(data: T): Promise<string> {
  const context = await requireSessionOrRedirect();

  return encryptServerString(context.session.encryptionKey!, JSON.stringify(data));
}

export function encryptSseData(sessionKeyB64: string, plainJson: string): string {
  return JSON.stringify({ e: encryptServerString(sessionKeyB64, plainJson) });
}

export async function setPinResetCookie(): Promise<void> {
  const cookieJar = await cookies();
  cookieJar.set(PIN_RESET_COOKIE_NAME, "1", {
    httpOnly: true,
    sameSite: "lax",
    path: "/",
    maxAge: 600,
    secure: process.env.NODE_ENV === "production",
  });
}

export async function consumePinResetCookie(): Promise<boolean> {
  const cookieJar = await cookies();
  const val = cookieJar.get(PIN_RESET_COOKIE_NAME)?.value;
  if (val === "1") {
    cookieJar.delete(PIN_RESET_COOKIE_NAME);
    return true;
  }

  return false;
}

export async function clearUserPin(userId: UserId): Promise<void> {
  await getDb()
    .update(users)
    .set({
      pinHash: null,
      pinFailedAttempts: 0,
      pinLockedUntil: null,
    })
    .where(eq(users.id, userId));
}
