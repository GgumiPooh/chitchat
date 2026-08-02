import "server-only";

import { ensureEnv } from "@/shared/config";
import { Google } from "arctic";
import { createRemoteJWKSet, jwtVerify } from "jose";

// INFO: REQUIREMENTS.md § 5.3. Fixed path, no `[provider]` segment — there will only ever be Google.
export const GOOGLE_CALLBACK_PATH = "/api/auth/callback/google";

export const GOOGLE_SCOPES = ["openid", "email", "profile"];

const GOOGLE_ISSUERS = ["https://accounts.google.com", "accounts.google.com"];

const jwks = createRemoteJWKSet(new URL("https://www.googleapis.com/oauth2/v3/certs"));

function getGoogleClientId(): string {
  return ensureEnv("GOOGLE_CLIENT_ID");
}

export function getGoogleClient(): Google {
  // WARN: Not the `APP_URL` constant — its localhost default would silently ship a `redirect_uri` that only fails on Google's own screen.
  return new Google(
    getGoogleClientId(),
    ensureEnv("GOOGLE_CLIENT_SECRET"),
    `${ensureEnv("APP_URL")}${GOOGLE_CALLBACK_PATH}`,
  );
}

export type GoogleIdentity = {
  sub: string;
  email: string;
  emailVerified: boolean;
  name?: string;
};

/**
 * Verifies the `id_token` signature against Google's JWKS (REQUIREMENTS.md § 5.1.).
 * Decoding the payload without verification would accept a forged token, so this
 * never uses arctic's `decodeIdToken`.
 */
export async function verifyGoogleIdToken(idToken: string): Promise<GoogleIdentity> {
  const { payload } = await jwtVerify(idToken, jwks, {
    issuer: GOOGLE_ISSUERS,
    audience: getGoogleClientId(),
  });

  const { sub, email, email_verified: emailVerified, name } = payload;

  if (typeof sub !== "string" || typeof email !== "string") {
    throw new Error("Google id_token is missing sub or email");
  }

  return {
    sub,
    email: email.trim().toLowerCase(),
    emailVerified: emailVerified === true,
    name: typeof name === "string" ? name : undefined,
  };
}

/**
 * Exact match against `ALLOWED_EMAILS` (REQUIREMENTS.md § 5.1.). Both sides are
 * lowercased; no domain or prefix matching, because the user set is fixed at two.
 */
export function isAllowedEmail(email: string): boolean {
  const allowed = (process.env.ALLOWED_EMAILS ?? "")
    .split(",")
    .map((entry) => entry.trim().toLowerCase())
    .filter(Boolean);

  return allowed.includes(email);
}
