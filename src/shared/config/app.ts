import { A_DAY, A_SECOND } from "@/shared/lib";

export const APP_NAME = "J&H";

export const APP_URL = process.env.APP_URL ?? "http://localhost:3000";

/**
 * The one and only conversation (REQUIREMENTS.md § 6.). Fixed rather than looked
 * up, so no query is needed to address it.
 */
export const CONVERSATION_ID = "00000000-0000-4000-8000-000000000001";

/**
 * The `(main)` layout's scroll container. The document itself cannot scroll
 * (DESIGN.md § 3.4.), so anything that reads or restores a scroll position has
 * to address this element instead of `window`.
 */
export const APP_SCROLL_ID = "app-scroll";

/**
 * The `(main)` layout's floating-bar stack (DESIGN.md § 3.5.). A screen that
 * anchors a bar of its own to `--bottom-inset` observes this element, because
 * the stack resizing moves that bar without ever resizing it.
 */
export const BOTTOM_OVERLAY_ID = "bottom-overlay";

/** The four tab routes, in tab-bar order. REQUIREMENTS.md § 7. */
export const CHAT_ROUTE = "/chat";

export const CALENDAR_ROUTE = "/calendar";

export const GALLERY_ROUTE = "/gallery";

export const SETTINGS_ROUTE = "/settings";

/** REQUIREMENTS.md § 8.2. One cursor page of messages. */
export const MESSAGE_PAGE_SIZE = 30;

// WARN: Caps what a caller may ask for; the request-side limit is clamped to it rather than rejected.
export const MAX_MESSAGE_PAGE_SIZE = 50;

export const MAX_MESSAGE_LENGTH = 2_000;

/** REQUIREMENTS.md § 8.4. The one `EventSource` the chat client holds open. */
export const CHAT_STREAM_PATH = "/api/chat/stream";

// INFO: A comment line often enough that no proxy between Vercel and the browser reads an idle conversation as a dead connection.
export const SSE_HEARTBEAT_INTERVAL = 25 * A_SECOND;

// WARN: REQUIREMENTS.md § 8.4. A `bigserial` id is handed out at INSERT but becomes visible at COMMIT, so replay starts this far below the reconnect cursor and lets id-deduplication drop the overlap. `id > cursor` alone loses the message that committed late.
export const SSE_REPLAY_MARGIN = 20;

// INFO: Caps one reconnect's replay. Anything beyond it is covered by the catch-up the client runs on every connect (§ 8.4.), which pages from its own cursor rather than from what the replay delivered.
export const SSE_REPLAY_LIMIT = 200;

// INFO: REQUIREMENTS.md § 8.4. `EventSource` stops retrying after a fatal error (a 401, a body that is not `text/event-stream`), so the client reopens by hand this long after one.
export const SSE_RETRY_DELAY = 5 * A_SECOND;

/** Route a signed-in user lands on. REQUIREMENTS.md § 5.2. */
export const HOME_ROUTE = CHAT_ROUTE;

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
