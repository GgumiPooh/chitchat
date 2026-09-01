import {
  A_DAY,
  A_MINUTE,
  A_SECOND,
  safelyGet,
  type Maybe,
  type Optional,
  type UserId,
} from "@/shared/lib";
import { z } from "zod";
import { snowflakeSchema } from "./id";

export const APP_NAME = "ChitChat";

// INFO: AGENTS.md § 4.1. The one breakpoint the desktop layout branches component choice on — `useIsDesktop` reads it.
export const DESKTOP_MEDIA_QUERY = "(min-width: 768px)";
/** The side panel (`SidePanel`) shows from `lg`, one step above the rail. */
export const SIDE_PANEL_MEDIA_QUERY = "(min-width: 1024px)";

// INFO: Comma-separated so one deployment can answer under more than one origin (a custom domain alongside the platform-assigned one, or mid-migration between two domains).
export const APP_URLS = (process.env.APP_URLS ?? "")
  .split(",")
  .map((entry) => entry.trim())
  .filter(Boolean);

export const APP_URL = APP_URLS[0] ?? "http://localhost:3000";

/**
 * Picks the `APP_URLS` entry matching `requestHost`, for callers that must answer
 * with the same origin the request came in on (google.ts's OAuth `redirect_uri`).
 *
 * WARN: Takes the raw `Host` header (`request.headers.get("host")`), never
 * `request.nextUrl.origin`. Standalone `server.js` binds `HOSTNAME`/`PORT`
 * (`http://0.0.0.0:3000`, the container's own listen address) and builds
 * `nextUrl` from that rather than from the incoming request behind Caddy, so
 * `origin` is always the same wrong value no matter which domain was requested.
 * The `Host` header is what Caddy actually forwards untouched.
 *
 * WARN: Throws rather than falling back to `APP_URL` when `requestHost` is set
 * but matches none of them — silently answering with the wrong origin is exactly
 * what made the request ambiguous in the first place, and Google would only
 * reject it later with a less legible error.
 */
export function resolveAppUrl(requestHost?: Maybe<string>): string {
  if (!requestHost) {
    return APP_URL;
  }

  const match = APP_URLS.find((url) => new URL(url).host === requestHost);

  if (!match) {
    throw new Error(`${requestHost} is not one of APP_URLS: ${APP_URLS.join(", ")}`);
  }

  return match;
}

/**
 * The `(main)` layout's floating-bar stack (DESIGN.md § 3.5.). A screen that
 * anchors a bar of its own to `--bottom-inset` observes this element, because
 * the stack resizing moves that bar without ever resizing it.
 */
export const BOTTOM_OVERLAY_ID = "bottom-overlay";

/** The floating `AppHeader`, for a screen that has to measure what it covers (REQUIREMENTS.md § 13.6.'s expanded sheet). */
export const APP_HEADER_ID = "app-header";

/**
 * The `(main)` layout's shell column, and the node every full-screen overlay is
 * portalled into. A screen that has to cover the floating header and the tab bar
 * renders a `ShellOverlay` rather than stacking inside itself — the bars are in
 * another subtree (DESIGN.md § 3.5.) and no `z-index` there can reach them.
 *
 * WARN: The column is in flow and grows with the screen, so it is not the box an
 * overlay fills. `ShellOverlay` re-establishes that box against the visual
 * viewport itself (AGENTS.md § 4.4.).
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

// INFO: REQUIREMENTS.md § 16.1. Rides beside `CHAT_MESSAGE_PARAM`, binding the target's own mode to the URL for the server's initial window and for a reload or a shared link.
export const CHAT_MODE_PARAM = "mode";

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
 * a link target**: `widgets/tab-bar` points the tab at the 갤러리 shelf so a tab tap
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

// INFO: REQUIREMENTS.md § 13. 미니이모티콘's own management screen — a sibling route rather than a mode of the one above, so both keep a static path for their back button, their remembered tab and their streaming fallback.
export const MINI_SETTINGS_ROUTE = "/settings/minis";

// INFO: REQUIREMENTS.md § 12. The device list, nested for the reason the line above is.
export const DEVICE_SETTINGS_ROUTE = "/settings/devices";

// INFO: REQUIREMENTS.md § 12.4. The ops console — backups and the orphan sweep, nested for the reason the line above is.
export const SERVER_SETTINGS_ROUTE = "/settings/server";

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

// INFO: § 13. The same screen in the same zone, told which kind of pack to write — the kind rides the path rather than a query, so the two entries are two addresses a bfcache restore can tell apart.
export const MINI_IMPORT_ROUTE = "/emoticons/import/mini";

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

/**
 * REQUIREMENTS.md § 12.4. The backup list, the 백업 생성 trigger, and `${path}/{filename}`
 * for one backup's deletion.
 *
 * INFO: The list and the deletion read R2 here; only the run is proxied to jandh-ops,
 * which is where the one remaining ops token stays.
 */
export const OPS_BACKUPS_PATH = "/api/ops/backups";

/** REQUIREMENTS.md § 12.4. The orphan sweep, dry-run unless the body says otherwise. */
export const OPS_CLEANUP_PATH = "/api/ops/cleanup-orphans";

/** REQUIREMENTS.md § 9., § 12.4. The reclaim the ten-minute schedule runs, asked for by hand. */
export const OPS_PURGE_PATH = "/api/ops/purge-deleted";

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

/** REQUIREMENTS.md § 16.2. The route a client asks nothing of but an answer, to find out whether its requests reach anything. */
export const HEALTH_PATH = "/api/health";

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

/**
 * DESIGN.md § 6.8. The whole of a jump flash — the fade in, the hold and the long
 * fade out together, which `message-flash` divides between in keyframe percentages.
 *
 * WARN: Handed to that animation as `--message-flash-duration` rather than written
 * into the stylesheet, so this stays the one place the length is stated. The row
 * that wears the class also clears it from here, and the two lengths disagreeing is
 * a highlight that ends before or after the animation drawing it.
 *
 * WARN: Also the § 7.10. tile ring's lifetime in 보관함, which fades on a transition
 * of its own rather than on those keyframes. One duration because it is one gesture
 * landing (§ 10.'s 대화에서 보기 and the quote jump alike), not because the two
 * animate alike.
 */
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

// WARN: REQUIREMENTS.md § 8.4. A snowflake is taken at INSERT but becomes visible at COMMIT, so replay starts this far below the reconnect cursor and lets id-deduplication drop the overlap. `id > cursor` alone loses the message that committed late.
// INFO: § 6. A duration rather than the row count this was while ids came from a sequence — the window being covered is how long a write can stay uncommitted, and an id now carries the time it was minted at (`idFloorBefore`).
export const SSE_REPLAY_MARGIN = 5 * A_SECOND;

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
 * REQUIREMENTS.md § 8.4.1. The kill switch for the idle close, its overlay, and § 8.4.'s `blur` close.
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
export const typingEventSchema = z.object({
  userId: snowflakeSchema<UserId>(),
  isTyping: z.boolean(),
});

export type TypingEvent = z.infer<typeof typingEventSchema>;

// INFO: REQUIREMENTS.md § 8.12. A keystroke does not send; this is how often one is resent while composing continues, which is what keeps the receiver's expiry from firing.
export const TYPING_PING_INTERVAL = 3 * A_SECOND;

// WARN: REQUIREMENTS.md § 8.12. Composing is measured from the last *edit*, never from the field being non-empty. A draft is a thing that sits there — someone who typed a line and walked away is not typing, and a signal keyed on emptiness would broadcast 입력 중 at them for as long as the tab stayed open.
export const TYPING_IDLE_AFTER = 4 * A_SECOND;

// WARN: REQUIREMENTS.md § 8.12. Comfortably more than one ping interval plus network slack, and the *only* thing that clears the indicator — a sender who is frozen, offline or closed sends no stop, so anything shorter blinks under a slow round trip and anything derived from a stop event sticks forever.
export const TYPING_TIMEOUT = 8 * A_SECOND;

/** REQUIREMENTS.md § 16.1. Web Push — the subscription endpoint and the push-only service worker. */
export const PUSH_SUBSCRIPTION_PATH = "/api/push/subscription";
// INFO: REQUIREMENTS.md § 16.1. The last push state this installation settled on, kept in a cookie so the Settings rows render it server-side instead of waiting for the launch sync.
export const PUSH_STATE_COOKIE_NAME = "push-state";
// INFO: REQUIREMENTS.md § 16.1. Whether this installation has 알림 on, as the server last recorded it — set by the subscription route, never by a sync result, so a failed launch sync cannot close the self-heal.
export const PUSH_INTENT_COOKIE_NAME = "push-intent";
// WARN: Server-set on purpose — Safari caps a `document.cookie` write at 7 days whatever `maxAge` says, and the self-heal has to outlive a week away from the app.
export const PUSH_INTENT_COOKIE_OPTIONS = {
  secure: process.env.NODE_ENV === "production",
  sameSite: "lax",
  path: "/",
  maxAge: (365 * A_DAY) / A_SECOND,
} as const;

// INFO: AGENTS.md § 4.4. Collapsed vs open for the `lg` side panel, kept in a cookie so the layout can paint the collapsed width server-side instead of flashing open.
export const SIDE_PANEL_COOKIE_NAME = "jandh:side-panel";

// INFO: AGENTS.md § 4.4. Fired once the `lg` side panel's width transition ends, so a measurement deferred during the animation can re-run against the settled geometry.
export const SIDE_PANEL_SETTLED_EVENT = "jandh:side-panel-settled";

// INFO: AGENTS.md § 4.1. 보관함's column count (1–7) at every width — the pinch's and the 열 개수 slider's shared cookie, kept so SSR and `ArchiveGrid` draw the same count with no flash.
export const ARCHIVE_COLUMNS_COOKIE_NAME = "jandh:archive-columns";

// INFO: REQUIREMENTS.md § 16.1. 조용히 보내기 / 나에게만 보내기 — withholds this sender's push (and, for 나에게만 보내기, the row itself) from the other participant, kept in a cookie so both the chat header and the message routes read the same value with no round trip.
// WARN: Renamed from `jandh:silent-send` when the value widened from a boolean to `NotifyMode` — a stale boolean cookie under the old name would otherwise `JSON.parse` into `true`/`false` where a `NotifyMode` string is expected.
export const NOTIFY_MODE_COOKIE_NAME = "jandh:notify-mode";

/** REQUIREMENTS.md § 16.1. `"notify"` is unset — every mode after it withholds something more than the last. Order is the cookie's own index order (below) as well as `⌃S`'s cycle order — do not reorder without both in mind. */
export const notifyModes = ["notify", "silent", "onlyMe"] as const;

export type NotifyMode = (typeof notifyModes)[number];

/** `Ctrl+S`'s cycle (REQUIREMENTS.md § 8.14., § 16.1.): 알림 울리게 보내기 → 조용히 보내기 → 나에게만 보내기 → …*/
export function nextNotifyMode(mode: NotifyMode): NotifyMode {
  return notifyModes[(notifyModes.indexOf(mode) + 1) % notifyModes.length];
}

/**
 * REQUIREMENTS.md § 16.1. The cookie carries `notifyModes`' own **index**, not the
 * mode name.
 *
 * WARN: `universal-cookie` writes a `string` value raw and only `JSON.stringify`s
 * everything else (`useSidePanel`'s own WARN, same mechanism `jandh:silent-send`
 * relied on for its boolean) — so a `NotifyMode` string written directly would
 * store unquoted text `synced-storage`'s SSR seeding cannot `JSON.parse`, and the
 * server render would always paint the default mode. A `number` index sidesteps
 * that: `JSON.stringify` still runs, and the result parses back on both sides.
 */
export function toNotifyModeIndex(mode: NotifyMode): number {
  return notifyModes.indexOf(mode);
}

/** The inverse of `toNotifyModeIndex` — an out-of-range or malformed index falls back to `"notify"` rather than throwing. */
export function fromNotifyModeIndex(index: unknown): NotifyMode {
  return typeof index === "number" ? (notifyModes[index] ?? "notify") : "notify";
}

// INFO: REQUIREMENTS.md § 16.1. What the message/AI routes read the cookie's raw text into — a missing or malformed value falls back to `"notify"` rather than 500ing the request.
export function toNotifyMode(raw: Optional<string>): NotifyMode {
  const parsed = raw === undefined ? undefined : safelyGet(() => JSON.parse(raw) as unknown);

  return fromNotifyModeIndex(parsed);
}

// WARN: Must stay at the origin root. A worker served from a subdirectory controls only that subdirectory, and the push subscription is bound to the scope it was created under.
export const SERVICE_WORKER_PATH = "/sw.js";

/**
 * REQUIREMENTS.md § 16. What `push-registration.ts` hangs on the script URL so a
 * deploy reaches an installed client at all.
 *
 * WARN: `sw.js` is served raw from `public/` and its bytes are identical across every
 * deploy, so nothing else would ever fire `install` — and the precache runs only
 * there. Without this the cached mirror and § 16.2.'s chunk list stay frozen at the
 * build the worker first installed under, with the online app updating around them.
 *
 * WARN: Inlined by `next.config.ts`'s `env` block at build time, so it is a literal
 * member access like every other build-time read here and does not exist in the
 * environment at runtime.
 */
export const SERVICE_WORKER_VERSION = process.env.SERVICE_WORKER_VERSION ?? "development";

// WARN: AGENTS.md § 6.2. `ensureEnv` cannot read this one — the client bundle has no `process.env`, so the key is inlined at build time and a missing one surfaces as a disabled toggle in Settings instead of a throw.
export const VAPID_PUBLIC_KEY = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY ?? "";

// INFO: Notification bodies are truncated by the OS anyway; cutting here keeps the encrypted payload well inside the 4KB the push services accept.
export const PUSH_BODY_MAX_LENGTH = 120;

/** Route a signed-in user lands on. REQUIREMENTS.md § 5.2. */
export const HOME_ROUTE = CHAT_ROUTE;

export const LOGIN_ROUTE = "/login";

/** A prefix with no screen — `proxy.ts` sends it to `HOME_ROUTE` before it can render. REQUIREMENTS.md § 5.2. */
export const ROOT_ROUTE = "/";

/** REQUIREMENTS.md § 16. What the service worker answers a failed navigation with. */
// WARN: Must stay out of `proxy.ts`'s matcher and hold no user data — it is served from the cache to whoever asks, including a signed-out browser and the next account to use it.
export const OFFLINE_ROUTE = "/offline";

/**
 * REQUIREMENTS.md § 16. The URL-inert mirror document, served from the cache in
 * place of any `MIRRORED_ROUTES` navigation that fails offline.
 *
 * WARN: Nested under `OFFLINE_ROUTE` so it inherits that exclusion from `proxy.ts`'s
 * matcher — the lookahead there tests a prefix, and a mirror anywhere else would be
 * cached as a 307 to `/login`, which network-errors when a navigation replays it.
 *
 * WARN: Holds no user data, for `OFFLINE_ROUTE`'s reason and more sharply — it is
 * prerendered once and served to every account on the browser. The screen it draws is
 * filled from IndexedDB after mount, never baked into this HTML.
 *
 * WARN: Duplicated as a literal in `public/sw.js`, which is served raw from `public/`
 * and can import nothing. The two have to move together.
 */
export const OFFLINE_SHELL_ROUTE = `${OFFLINE_ROUTE}/shell`;

/**
 * REQUIREMENTS.md § 16. The routes `OFFLINE_SHELL_ROUTE` can draw from a snapshot.
 * Anything absent here — `/settings/devices`, `/settings/emoticons`, `/login` — falls
 * through to `OFFLINE_ROUTE` instead.
 *
 * WARN: Matched as exact paths and never as prefixes, which is the whole reason
 * `SETTINGS_ROUTE` can sit here while the three screens nested under it cannot.
 *
 * WARN: Duplicated as literals in `public/sw.js`, for `OFFLINE_SHELL_ROUTE`'s reason.
 * A route added here without its twin there is a screen the mirror renders and the
 * worker never serves.
 *
 * INFO: Seven routes for six screens — `ARCHIVE_ROUTE` earns its place by being the
 * one entry with no screen of its own. Online it redirects to the 갤러리 shelf, and
 * offline there is no redirect to run, so a bookmark or a typed URL would reach
 * `OFFLINE_ROUTE` while the shelf it stands for sits in the snapshot.
 */
export const MIRRORED_ROUTES = [
  CHAT_ROUTE,
  CALENDAR_ROUTE,
  ARCHIVE_ROUTE,
  ARCHIVE_GALLERY_ROUTE,
  ARCHIVE_FILES_ROUTE,
  ARCHIVE_VOICE_ROUTE,
  SETTINGS_ROUTE,
] as const;

export type MirroredRoute = (typeof MIRRORED_ROUTES)[number];

/** Clears a cookie whose session no longer validates, then lands on `LOGIN_ROUTE`. REQUIREMENTS.md § 5.2. */
export const SESSION_EXPIRE_ROUTE = "/api/auth/session/expire";

/** REQUIREMENTS.md § 5.4. Email-only login, so a dev machine needs no Google consent screen. */
export const DEV_LOGIN_ROUTE = "/api/auth/login/dev";

const ENABLE_DEV_LOGIN = (process.env.ENABLE_DEV_LOGIN ?? "").trim().toLowerCase();

/**
 * REQUIREMENTS.md § 5.4. Gates both the `/login` form and `DEV_LOGIN_ROUTE` itself.
 *
 * WARN: `ENABLE_DEV_LOGIN` outranks the `NODE_ENV` default in both directions, which is what lets a production build be signed into without a Google consent screen while § 16.'s offline behaviour is tested on a device. Only `true`, `1` or `on` enable it; absent or blank falls back to the default.
 * WARN: `/login` prerenders, so a production build reads this at BUILD time for the form and at request time for the route — set it before `next build`, or the two disagree.
 */
export const IS_DEV_LOGIN_ENABLED =
  ENABLE_DEV_LOGIN === ""
    ? process.env.NODE_ENV === "development"
    : ["true", "1", "on"].includes(ENABLE_DEV_LOGIN);

// WARN: `NODE_ENV` alone, deliberately — it gates developer tooling rather than an auth path, so it must not follow `IS_DEV_LOGIN_ENABLED`'s override onto a production build.
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

/**
 * REQUIREMENTS.md § 7. The Web Share Target parameters, and the order the shared
 * text is assembled in — richest field first, since `text` routinely carries the
 * title and the link already and each part is dropped when one before it holds it.
 */
export const SHARE_TARGET_PARAMS = { text: "text", title: "title", url: "url" } as const;

// INFO: REQUIREMENTS.md § 7. Under the 4096 bytes a cookie may carry, with room for the name and the attributes beside the value.
export const MAX_PENDING_SHARE_BYTES = 3_500;

// INFO: REQUIREMENTS.md § 7. Where the proxy parks a share that arrived with no session cookie, for the login to land on rather than the bare `HOME_ROUTE`.
export const PENDING_SHARE_COOKIE_NAME = "jandh_pending_share";

// WARN: No `domain`, for `oauth-cookies.ts`'s reason — jandh-emoticons writes this origin's cookies too.
export const PENDING_SHARE_COOKIE_OPTIONS = {
  httpOnly: true,
  secure: process.env.NODE_ENV === "production",
  sameSite: "lax",
  path: "/",
  maxAge: (10 * A_MINUTE) / A_SECOND,
} as const;

/**
 * iCloud link the 공유 단축어 is installed from, including the shortcut's id.
 *
 * WARN: Undefined rather than a bare `https://www.icloud.com/shortcuts/` fallback — iOS
 * hands that host to the Shortcuts app, which opens with nothing to add and no error.
 *
 * WARN: `NEXT_PUBLIC_` and inlined at build time, so it is a Dockerfile `ARG` and a
 * workflow build-arg; the runtime `.env` cannot supply it.
 */
export const SHORTCUT_ICLOUD_URL = process.env.NEXT_PUBLIC_SHORTCUT_ICLOUD_URL?.trim() || undefined;
