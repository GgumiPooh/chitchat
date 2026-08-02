import { A_DAY, A_SECOND } from "@/shared/lib";

export const APP_NAME = "J&H";

export const APP_URL = process.env.APP_URL ?? "http://localhost:3000";

/**
 * The one and only conversation (REQUIREMENTS.md § 6.). Fixed rather than looked
 * up, so no query is needed to address it.
 */
export const CONVERSATION_ID = "00000000-0000-4000-8000-000000000001";

/** Route a signed-in user lands on. REQUIREMENTS.md § 5.2. */
export const HOME_ROUTE = "/chat";

export const LOGIN_ROUTE = "/login";

/** Clears a cookie whose session no longer validates, then lands on `LOGIN_ROUTE`. REQUIREMENTS.md § 5.2. */
export const SESSION_EXPIRE_ROUTE = "/api/auth/session/expire";

/** Name of the httpOnly cookie holding the opaque session token. */
export const SESSION_COOKIE_NAME = "jandh_session";

// INFO: REQUIREMENTS.md § 5.2. Long-lived by design — the pair opens this app in bursts, not daily.
export const SESSION_DURATION = 180 * A_DAY;

// WARN: The proxy re-issues the cookie on every page request; without that the browser drops it 180 days after login however active the user was.
export const SESSION_COOKIE_OPTIONS = {
  httpOnly: true,
  secure: process.env.NODE_ENV === "production",
  sameSite: "lax",
  path: "/",
  maxAge: SESSION_DURATION / A_SECOND,
} as const;
