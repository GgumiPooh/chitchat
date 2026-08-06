import { A_DAY, A_SECOND, type Maybe } from "@/shared/lib";

export const APP_NAME = "J&H";

export const APP_URL = process.env.APP_URL ?? "http://localhost:3000";

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

/**
 * The `(main)` layout's shell box — the positioning context both floating bars
 * and every full-screen overlay resolve against. A screen that has to cover the
 * header and the tab bar portals into this rather than going `fixed`
 * (AGENTS.md § 4.4.), because its own container is inside the scroller the bars
 * float over.
 */
export const APP_SHELL_ID = "app-shell";

/** The four tab routes, in tab-bar order. REQUIREMENTS.md § 7. */
export const CHAT_ROUTE = "/chat";

export const CALENDAR_ROUTE = "/calendar";

export const GALLERY_ROUTE = "/gallery";

export const SETTINGS_ROUTE = "/settings";

// INFO: REQUIREMENTS.md § 13.5. Nested under settings, so the tab bar keeps 설정 active while the management screens are open.
export const EMOTICON_SETTINGS_ROUTE = "/settings/emoticons";

/**
 * The tab routes in bar order — the single source of that order.
 *
 * DESIGN.md § 4.7.1. Which way a screen slides is read from this, so the bar's
 * own `TABS` builds itself from it rather than repeating it.
 *
 * WARN: `as const` so the member type is the four literals. Widened to `string[]`,
 * a route added here without a face in `TABS` is an `undefined` `Icon` that
 * typechecks and blanks the shell at render instead of failing the build.
 */
export const TAB_ROUTES = [CHAT_ROUTE, CALENDAR_ROUTE, GALLERY_ROUTE, SETTINGS_ROUTE] as const;

export type TabRoute = (typeof TAB_ROUTES)[number];

/**
 * Whether `pathname` is that tab's screen or something nested under it.
 *
 * WARN: DESIGN.md § 4.7.1. One rule for both readers. The bar fills a tab from it
 * and `RouteTransition` picks the slide direction from it — spelled out twice, a
 * change to one leaves the fill on one tab while the slide reads from the other.
 */
export function isUnderRoute(pathname: Maybe<string>, route: string): boolean {
  return pathname === route || (pathname?.startsWith(`${route}/`) ?? false);
}

/** REQUIREMENTS.md § 8.4. The whole participant set, cursorless. */
export const USERS_PATH = "/api/users";

/** REQUIREMENTS.md § 12. The signed-in user's own row — nickname and avatar. */
export const PROFILE_PATH = `${USERS_PATH}/me`;

// INFO: REQUIREMENTS.md § 8.7. The name every bubble and system sentence is rendered from, so it is bounded by what a chat row can show rather than by the column.
export const MAX_NICKNAME_LENGTH = 20;

/** REQUIREMENTS.md § 8.2. One cursor page of messages. */
export const MESSAGE_PAGE_SIZE = 30;

// WARN: Caps what a caller may ask for; the request-side limit is clamped to it rather than rejected.
export const MAX_MESSAGE_PAGE_SIZE = 50;

export const MAX_MESSAGE_LENGTH = 2_000;

// INFO: REQUIREMENTS.md § 8.10. The quote is clamped to one line, so the wire carries a slice rather than a 2000-character parent every reply would otherwise drag along.
export const REPLY_PREVIEW_MAX_LENGTH = 120;

/** DESIGN.md § 6.8. How long a jumped-to bubble holds its highlight before it fades. */
export const MESSAGE_FLASH_DURATION = 1.5 * A_SECOND;

/** REQUIREMENTS.md § 8.4. The one `EventSource` the chat client holds open. */
export const CHAT_STREAM_PATH = "/api/chat/stream";

/**
 * REQUIREMENTS.md § 8.4. How a message reached the client: as it happened, or as
 * part of the replay a reconnect opens with.
 *
 * INFO: The wire carries the two as separate event names, and the client acts on
 * the difference — a replayed row is not news, so § 13.6.'s emoticon sound stays
 * silent for it.
 */
export type MessageArrival = "live" | "backfill";

export const BACKFILL_EVENT = "backfill";

// INFO: A ping often enough that no proxy between Vercel and the browser reads an idle conversation as a dead connection.
export const SSE_HEARTBEAT_INTERVAL = 25 * A_SECOND;

// WARN: REQUIREMENTS.md § 8.4. iOS restores a frozen PWA with its `EventSource` still reporting `OPEN` over a socket the system already tore down, and a silence this long is the only way the client can tell that apart from an idle conversation.
export const SSE_STALE_AFTER = 2 * SSE_HEARTBEAT_INTERVAL;

// INFO: REQUIREMENTS.md § 8.4. `pageshow`, `focus`, and `visibilitychange` all fire on one iOS resume; this collapses them into a single catch-up.
export const SSE_SYNC_COALESCE_WINDOW = A_SECOND;

// WARN: REQUIREMENTS.md § 8.4. A `bigserial` id is handed out at INSERT but becomes visible at COMMIT, so replay starts this far below the reconnect cursor and lets id-deduplication drop the overlap. `id > cursor` alone loses the message that committed late.
export const SSE_REPLAY_MARGIN = 20;

// INFO: Caps one reconnect's replay. Anything beyond it is covered by the catch-up the client runs on every connect (§ 8.4.), which pages from its own cursor rather than from what the replay delivered.
export const SSE_REPLAY_LIMIT = 200;

// INFO: REQUIREMENTS.md § 8.4. `EventSource` stops retrying after a fatal error (a 401, a body that is not `text/event-stream`), so the client reopens by hand this long after one.
export const SSE_RETRY_DELAY = 5 * A_SECOND;

/**
 * REQUIREMENTS.md § 15.1. Identifies the running deployment, so a client that has
 * been suspended across a deploy can tell.
 *
 * WARN: Read on the server and delivered over the stream — never imported by
 * client code. A non-`NEXT_PUBLIC_` variable is `undefined` in a browser bundle,
 * and the two sides would then always disagree.
 */
export const BUILD_ID =
  process.env.VERCEL_DEPLOYMENT_ID ?? process.env.VERCEL_GIT_COMMIT_SHA ?? "development";

// INFO: REQUIREMENTS.md § 15.1. Long enough that a send in flight or a photo being picked finishes on its own; the check also runs on every backgrounding, which is what usually collects it first.
export const APP_REFRESH_RETRY_DELAY = 10 * A_SECOND;

/** REQUIREMENTS.md § 8.8. The read cursor, and the count the tab-bar badge reads. */
export const CHAT_READ_PATH = "/api/chat/read";

export const CHAT_UNREAD_PATH = "/api/chat/unread";

// INFO: REQUIREMENTS.md § 8.8. The cursor moves while the chat is on screen, so the write is throttled rather than run per message — every UPDATE fires `user_changed` at the other device.
export const READ_CURSOR_THROTTLE = 5 * A_SECOND;

/** REQUIREMENTS.md § 16.1. Web Push — the subscription endpoint and the push-only service worker. */
export const PUSH_SUBSCRIPTION_PATH = "/api/push/subscription";

// WARN: Must stay at the origin root. A worker served from a subdirectory controls only that subdirectory, and the push subscription is bound to the scope it was created under.
export const SERVICE_WORKER_PATH = "/sw.js";

// WARN: AGENTS.md § 6.2. `ensureEnv` cannot read this one — the client bundle has no `process.env`, so the key is inlined at build time and a missing one surfaces as a disabled toggle in Settings instead of a throw.
export const VAPID_PUBLIC_KEY = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY ?? "";

// INFO: Notification bodies are truncated by the OS anyway; cutting here keeps the encrypted payload well inside the 4KB the push services accept.
export const PUSH_BODY_MAX_LENGTH = 120;

/** Route a signed-in user lands on. REQUIREMENTS.md § 5.2. */
export const HOME_ROUTE = CHAT_ROUTE;

export const LOGIN_ROUTE = "/login";

/** Clears a cookie whose session no longer validates, then lands on `LOGIN_ROUTE`. REQUIREMENTS.md § 5.2. */
export const SESSION_EXPIRE_ROUTE = "/api/auth/session/expire";

/** REQUIREMENTS.md § 5.4. Email-only login, so a dev machine needs no Google consent screen. */
export const DEV_LOGIN_ROUTE = "/api/auth/login/dev";

// WARN: `NODE_ENV` is compiled in, not read at runtime — a production build cannot flip this on however the environment is set.
export const IS_DEV_LOGIN_ENABLED = process.env.NODE_ENV === "development";

// WARN: Same compile-time guarantee as `IS_DEV_LOGIN_ENABLED`. Kept separate because it gates developer tooling rather than an auth path, and the two must be free to diverge.
export const IS_DEV = process.env.NODE_ENV === "development";

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
