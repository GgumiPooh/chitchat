import "server-only";

import { A_MINUTE, A_SECOND, type Nullable } from "@/shared/lib";
import { cookies } from "next/headers";

const STATE_COOKIE_NAME = "jandh_oauth_state";
const CODE_VERIFIER_COOKIE_NAME = "jandh_oauth_verifier";

// INFO: Only has to outlive the Google consent screen; a long-lived value would widen the replay window.
const OAUTH_COOKIE_MAX_AGE = 10 * A_MINUTE;

// WARN: No `domain`, unlike the session cookie (REQUIREMENTS.md § 5.2.). jandh-emoticons writes these same two names, and shared over the parent domain a login started in one app would overwrite the `state` and verifier of a login started in the other.
const OAUTH_COOKIE_OPTIONS = {
  httpOnly: true,
  secure: process.env.NODE_ENV === "production",
  sameSite: "lax",
  path: "/",
  maxAge: OAUTH_COOKIE_MAX_AGE / A_SECOND,
} as const;

export async function setOAuthCookies(state: string, codeVerifier: string): Promise<void> {
  const cookieStore = await cookies();

  cookieStore.set(STATE_COOKIE_NAME, state, OAUTH_COOKIE_OPTIONS);
  cookieStore.set(CODE_VERIFIER_COOKIE_NAME, codeVerifier, OAUTH_COOKIE_OPTIONS);
}

export async function readOAuthCookies(): Promise<{
  state: Nullable<string>;
  codeVerifier: Nullable<string>;
}> {
  const cookieStore = await cookies();

  return {
    state: cookieStore.get(STATE_COOKIE_NAME)?.value ?? null,
    codeVerifier: cookieStore.get(CODE_VERIFIER_COOKIE_NAME)?.value ?? null,
  };
}

export async function clearOAuthCookies(): Promise<void> {
  const cookieStore = await cookies();

  cookieStore.delete(STATE_COOKIE_NAME);
  cookieStore.delete(CODE_VERIFIER_COOKIE_NAME);
}
