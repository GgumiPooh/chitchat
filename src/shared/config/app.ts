export const APP_NAME = "J&H";

export const APP_URL = process.env.APP_URL ?? "http://localhost:3000";

/** Route a signed-in user lands on. REQUIREMENTS.md § 5.2. */
export const HOME_ROUTE = "/chat";

export const LOGIN_ROUTE = "/login";

/** Clears a cookie whose session no longer validates, then lands on `LOGIN_ROUTE`. REQUIREMENTS.md § 5.2. */
export const SESSION_EXPIRE_ROUTE = "/api/auth/session/expire";

/** Name of the httpOnly cookie holding the opaque session token. */
export const SESSION_COOKIE_NAME = "jandh_session";
