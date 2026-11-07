import "server-only";

import { ensureEnv } from "@/shared/config";
import type { Nullable } from "@/shared/lib";
import { createHash } from "node:crypto";
import { decryptServerString, encryptServerString } from "./pin-crypto";

function getCalendarTokenKey(): string {
  return createHash("sha256")
    .update(ensureEnv("GOOGLE_CLIENT_SECRET"))
    .update("jandh-google-calendar-token-v1")
    .digest("base64url");
}

export function encryptGoogleCalendarToken(plaintext: string): string {
  return encryptServerString(getCalendarTokenKey(), plaintext);
}

export function decryptGoogleCalendarToken(ciphertext: string): Nullable<string> {
  return decryptServerString(getCalendarTokenKey(), ciphertext);
}
