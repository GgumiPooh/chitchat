import { A_DAY, A_MINUTE, A_SECOND, type Maybe } from "@/shared/lib";
import { z } from "zod";

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

/**
 * REQUIREMENTS.md § 10. A message the conversation is to open on, carried by
 * 보관함's 대화에서 보기 — the id, where § 11.5.'s calendar link carries a day.
 *
 * INFO: An id is right here and wrong there. A tile's message is the whole
 * destination and is still on the row when the link is drawn, while a delete
 * notice outlives the `events` row it would have named.
 */
export const CHAT_MESSAGE_PARAM = "message";

/**
 * REQUIREMENTS.md § 10. A photo 보관함 is to open on, carried by 채팅's own viewer —
 * the mirror of `CHAT_MESSAGE_PARAM` above, and the whole contract between the two.
 *
 * INFO: A `media` id, so the grid can load the page that photo is actually on. The library keyset-pages from the newest (§ 10.), so an older photo is not merely off screen — it is not loaded, and a scroll cannot reach what was never fetched.
 */
export const ARCHIVE_TARGET_PARAM = "target";

export const CALENDAR_ROUTE = "/calendar";

/**
 * REQUIREMENTS.md § 7., § 10. 보관함's **prefix**, and not a screen of its own.
 *
 * WARN: Nothing renders here — `app/(main)/archive/page.tsx` redirects to
 * `ARCHIVE_GALLERY_ROUTE`. This constant exists for `isUnderRoute`, which is what
 * keeps the tab bar's fill on 보관함 across all three shelves and what
 * `RouteTransition` reads the slide direction from (DESIGN.md § 4.7.1.). **It is not
 * a link target**: `widgets/tab-bar` points the tab at the 사진 shelf so a tab tap
 * does not spend a redirect.
 */
export const ARCHIVE_ROUTE = "/archive";

/**
 * REQUIREMENTS.md § 10. The 사진 segment of 보관함.
 *
 * INFO: All three shelves take a segment, including this one. With three of them,
 * leaving 사진 on the bare `/archive` would read as the other two being nested
 * *inside* it rather than beside it — the same thing that made `/gallery/files` wrong
 * (§ 7.).
 *
 * WARN: The path says `gallery` where the chip says `사진`, and that is the user's
 * call rather than an oversight. Do not "tidy" it to `/archive/photos`.
 */
export const ARCHIVE_GALLERY_ROUTE = `${ARCHIVE_ROUTE}/gallery`;

/**
 * REQUIREMENTS.md § 10. The 파일 segment of 보관함.
 *
 * INFO: Nested under `ARCHIVE_ROUTE`, so `isUnderRoute` keeps the tab filled and
 * `RouteTransition` resolves all three segments to one tab — a segment switch is not
 * a sideways move and must not slide (DESIGN.md § 4.7.1.).
 */
export const ARCHIVE_FILES_ROUTE = `${ARCHIVE_ROUTE}/files`;

/** REQUIREMENTS.md § 10. The 음성 segment — the same nesting, for the same reasons as the line above. */
export const ARCHIVE_VOICE_ROUTE = `${ARCHIVE_ROUTE}/voice`;

export const SETTINGS_ROUTE = "/settings";

// INFO: REQUIREMENTS.md § 13.5. Nested under settings, so the tab bar keeps 설정 active while the management screens are open.
export const EMOTICON_SETTINGS_ROUTE = "/settings/emoticons";

// INFO: REQUIREMENTS.md § 12. The device list, nested for the reason the line above is.
export const DEVICE_SETTINGS_ROUTE = "/settings/devices";

/**
 * jandh-emoticons' URL 임포트 screen, served from this origin as a multi-zone
 * (`next.config.ts`'s rewrite).
 *
 * WARN: Same origin but **another app**, so this is reached with a document
 * navigation — never `<Link>` or `router.push`. Next would try to fetch an RSC
 * payload for a route this app's tree does not contain.
 *
 * WARN: Not built from `EMOTICON_SETTINGS_ROUTE`. That one is 설정's own screen at
 * `/settings/emoticons`; this prefix is the zone's, and it is fixed by
 * `basePath` in the other repo rather than chosen here.
 */
export const EMOTICON_IMPORT_ROUTE = "/emoticons/import";

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
export const TAB_ROUTES = [CHAT_ROUTE, CALENDAR_ROUTE, ARCHIVE_ROUTE, SETTINGS_ROUTE] as const;

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

/** REQUIREMENTS.md § 12. One logged-in device, for the revocation the list offers. */
export const SESSIONS_PATH = "/api/sessions";

// INFO: REQUIREMENTS.md § 8.7. The name every bubble and system sentence is rendered from, so it is bounded by what a chat row can show rather than by the column.
export const MAX_NICKNAME_LENGTH = 20;

/** REQUIREMENTS.md § 8.2. One cursor page of messages. */
export const MESSAGE_PAGE_SIZE = 30;

// WARN: Caps what a caller may ask for; the request-side limit is clamped to it rather than rejected.
export const MAX_MESSAGE_PAGE_SIZE = 50;

export const MAX_MESSAGE_LENGTH = 2_000;

/**
 * REQUIREMENTS.md § 8.13. What a withdrawn message reads in the place it keeps.
 *
 * WARN: Shared between the bubble and the § 8.3. row estimate on purpose. The
 * estimate measures this exact string, so a copy edit that reached only one of the
 * two would be drift the reader watches accumulate rather than a wording change.
 *
 * INFO: 해요체, matching the quote's `삭제된 메시지예요` (§ 8.10.). KakaoTalk's
 * `삭제된 메시지입니다` would be the one 합쇼체 string in the app.
 */
export const DELETED_MESSAGE_TEXT = "삭제된 메시지예요";

/** REQUIREMENTS.md § 8.13.1. Which of a resuming client's loaded rows have been edited or deleted since it last saw them. */
export const CHANGED_MESSAGES_PATH = "/api/messages/changed";

// INFO: REQUIREMENTS.md § 8.13.1. A page size, and the client walks its upper bound down until a short page comes back. It cannot be a bare cap: what a truncation drops is the *oldest* changes inside the loaded window, and nothing else recovers those — `loadOlder` only ever fetches rows older than that window's start.
export const CHANGED_MESSAGES_LIMIT = 200;

/** REQUIREMENTS.md § 8.6. Substring search over `messages.text`, newest first. */
export const MESSAGE_SEARCH_PATH = "/api/messages/search";

// INFO: Smaller than a message page — a result row is two clamped lines, so a screenful is fewer rows than a screenful of bubbles.
export const SEARCH_PAGE_SIZE = 20;

// WARN: The query is a `LIKE` pattern the caller composes; bounding it here is what keeps a pathological one out of the scan the § 8.6. index cannot serve.
export const MAX_SEARCH_QUERY_LENGTH = 100;

// INFO: DESIGN.md § 6.8. The result row clamps to two lines, so the server sends a window around the hit rather than a 2000-character message the clamp would cut the match out of.
export const SEARCH_EXCERPT_MAX_LENGTH = 120;

// INFO: How much of the sentence before the hit rides along, so the match is not flush against the left edge with no context in front of it.
export const SEARCH_EXCERPT_LEAD = 24;

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

/**
 * REQUIREMENTS.md § 8.13. A row the reader already holds, changed — corrected by
 * its sender, or withdrawn by them and now a tombstone. **One** event for both:
 * either way the payload is the whole row and the client replaces what it has, so
 * a second event name would only be a verdict the row already carries in
 * `isDeleted`.
 *
 * WARN: Its own name, never `message`. An arrival carries side effects a change
 * must not fire — the unread count moves, § 13.6.'s emoticon sound plays, and
 * § 8.8.'s cursor is written. None of that is true of a row already on screen.
 *
 * WARN: It carries no `id:` field. That is the reconnect cursor (§ 8.4.), and a
 * change names a row of any age — stamping it would walk the cursor backwards and
 * buy every reconnect a replay it already has.
 */
export const CHANGE_EVENT = "change";

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
 * REQUIREMENTS.md § 8.4.2. What `sw.js` posts to open windows on a push, so the
 * tab-bar badge still moves on the three tabs that hold no stream.
 *
 * WARN: Duplicated as a literal in `public/sw.js` — a worker is served raw from
 * `public/`, outside the bundle, and cannot import this. The two have to move
 * together.
 */
export const UNREAD_COUNT_MESSAGE = "unread-count";

export const unreadCountMessageSchema = z.object({
  type: z.literal(UNREAD_COUNT_MESSAGE),
  unreadCount: z.number().int().min(0),
});

/**
 * REQUIREMENTS.md § 8.4.1. The kill switch for the idle close and its overlay.
 *
 * WARN: Default **on** — absent, blank, or anything but an explicit off leaves it
 * enabled, so the cost control cannot be lost by forgetting a variable in a new
 * environment. Only `false`, `0` or `off` turn it off.
 *
 * WARN: `NEXT_PUBLIC_` and read as a literal member access. Next inlines these at
 * build time, so a computed lookup resolves to `undefined` in the browser bundle
 * and the switch would silently read as on everywhere.
 */
export const IS_SSE_IDLE_SLEEP_ENABLED = !["false", "0", "off"].includes(
  (process.env.NEXT_PUBLIC_SSE_IDLE_SLEEP ?? "").trim().toLowerCase(),
);

// INFO: REQUIREMENTS.md § 8.4.1. How long a focused window may go untouched before the stream is dropped. § 8.4.'s background close fires only when the app goes away, which a desktop PWA left open behind another window never does.
export const SSE_IDLE_TIMEOUT = A_MINUTE;

// INFO: REQUIREMENTS.md § 8.4.1. How often a deadline that has come due re-asks whether the recording, clip or open sheet holding it off has finished.
export const SSE_BUSY_RECHECK_INTERVAL = 30 * A_SECOND;

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

/** REQUIREMENTS.md § 8.12. 입력 중 — a broadcast with no row behind it. */
export const CHAT_TYPING_PATH = "/api/chat/typing";

/** REQUIREMENTS.md § 12.2. The wallpaper both participants see. Under `/api/chat` rather than `/api/users/me`, because it belongs to the room and not to whoever set it. */
export const CHAT_BACKGROUND_PATH = "/api/chat/background";

/**
 * The `typing` payload, on the `pg_notify` hop and on the wire alike.
 *
 * WARN: One definition for all three sides — publisher, stream, client. Spelled
 * out separately they drift, and the client's copy fails **closed**: `safeParse`
 * simply stops matching and the indicator quietly never appears again, with no
 * error raised anywhere to say why.
 */
export const typingEventSchema = z.object({ userId: z.uuid(), isTyping: z.boolean() });

export type TypingEvent = z.infer<typeof typingEventSchema>;

// INFO: REQUIREMENTS.md § 8.12. A keystroke does not send; this is how often one is resent while composing continues, which is what keeps the receiver's expiry from firing.
export const TYPING_PING_INTERVAL = 3 * A_SECOND;

// WARN: REQUIREMENTS.md § 8.12. Composing is measured from the last *edit*, never from the field being non-empty. A draft is a thing that sits there — someone who typed a line and walked away is not typing, and a signal keyed on emptiness would broadcast 입력 중 at them for as long as the tab stayed open.
export const TYPING_IDLE_AFTER = 4 * A_SECOND;

// WARN: REQUIREMENTS.md § 8.12. Comfortably more than one ping interval plus network slack, and the *only* thing that clears the indicator — a sender who is frozen, offline or closed sends no stop, so anything shorter blinks under a slow round trip and anything derived from a stop event sticks forever.
export const TYPING_TIMEOUT = 8 * A_SECOND;

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

/** REQUIREMENTS.md § 16. What the service worker answers a failed navigation with. */
// WARN: Must stay out of `proxy.ts`'s matcher and hold no user data — it is served from the cache to whoever asks, including a signed-out browser and the next account to use it.
export const OFFLINE_ROUTE = "/offline";

/** Clears a cookie whose session no longer validates, then lands on `LOGIN_ROUTE`. REQUIREMENTS.md § 5.2. */
export const SESSION_EXPIRE_ROUTE = "/api/auth/session/expire";

/** REQUIREMENTS.md § 5.4. Email-only login, so a dev machine needs no Google consent screen. */
export const DEV_LOGIN_ROUTE = "/api/auth/login/dev";

// WARN: `NODE_ENV` is compiled in, not read at runtime — a production build cannot flip this on however the environment is set.
export const IS_DEV_LOGIN_ENABLED = process.env.NODE_ENV === "development";

// WARN: Same compile-time guarantee as `IS_DEV_LOGIN_ENABLED`. Kept separate because it gates developer tooling rather than an auth path, and the two must be free to diverge.
export const IS_DEV = process.env.NODE_ENV === "development";

/**
 * Name of the httpOnly cookie holding the opaque session token.
 *
 * WARN: REQUIREMENTS.md § 5.2. jandh-emoticons issues this same name over the
 * same parent domain, so one login covers both apps — renaming it on one side
 * only signs the user out of the other.
 *
 * WARN: Deliberately not the `jandh_session` this app used to issue. That one is
 * host-only in browsers that already hold it, and a host-only cookie survives
 * beside a domain-scoped one of the same name: reads would pick between two
 * values, and a logout could clear only one of the two and bounce off the proxy
 * forever.
 *
 * WARN: A generic name over a whole domain. Every subdomain of `jeheecheon.com`
 * receives this cookie, and `session` is what several frameworks call theirs by
 * default — so anything else hosted there reads this token, and a host-only
 * `session` of its own would shadow this one exactly as the paragraph above
 * describes. The domain is ours and holds these two apps, which is the whole of
 * why the name is safe.
 */
export const SESSION_COOKIE_NAME = "session";

/**
 * Parent domain the session cookie is issued to — `.jeheecheon.com` in
 * production, which is what makes a login here a login at jandh-emoticons too
 * (REQUIREMENTS.md § 5.2.).
 *
 * WARN: Unset means a host-only cookie, and that is what development wants:
 * `localhost` accepts no `Domain` at all, and the tunnel origin sits under the
 * production domain, so a shared cookie there would overwrite the production
 * session with one no deployed database can resolve.
 *
 * WARN: Server-only, like `BUILD_ID` — a browser bundle reads a
 * non-`NEXT_PUBLIC_` variable as `undefined`, which would silently make the
 * cookie host-only rather than fail.
 */
export const SESSION_COOKIE_DOMAIN = process.env.SESSION_COOKIE_DOMAIN?.trim() || undefined;

// INFO: REQUIREMENTS.md § 5.2. Long-lived by design — the pair opens this app in bursts, not daily.
export const SESSION_DURATION = 180 * A_DAY;

// WARN: The proxy re-issues the cookie on every page request; without that the browser drops it 180 days after login however active the user was.
export const SESSION_COOKIE_OPTIONS = {
  httpOnly: true,
  secure: process.env.NODE_ENV === "production",
  sameSite: "lax",
  path: "/",
  domain: SESSION_COOKIE_DOMAIN,
  maxAge: SESSION_DURATION / A_SECOND,
} as const;
