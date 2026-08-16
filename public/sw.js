/**
 * Push and offline-cache service worker (REQUIREMENTS.md § 7., § 16., § 16.1.).
 *
 * WARN: Only three things may ever enter the cache — build output whose URL carries
 * a content hash, `OFFLINE_URL`, and `OFFLINE_SHELL_URL`. Everything else in this app
 * varies by user, and `caches` is scoped to the origin rather than the session:
 * § 16.1. has two accounts sharing one browser, and logging out clears the cookie,
 * not this. The mirror qualifies only because it holds no user data of its own — it
 * is filled from IndexedDB after mount, never prerendered with a snapshot in it.
 */

// WARN: A worker is served raw from `public/`, outside the bundle, so nothing here can import `@/shared/config`. This file owns the § 16.1. tag; `FALLBACK_URL` duplicates `CHAT_ROUTE` and has to move with it.
const NOTIFICATION_TAG = "jandh-chat";

const NOTIFICATION_ICON = "/icons/icon-192.png";

const FALLBACK_URL = "/chat";

// WARN: Duplicates `UNREAD_COUNT_MESSAGE` in `shared/config`, for the reason above — a worker cannot import it. The two names have to move together.
const UNREAD_COUNT_MESSAGE = "unread-count";

// WARN: Duplicates `OFFLINE_ROUTE` in `shared/config`, for the reason above. It is also excluded from `proxy.ts`'s matcher, so the two have to move together or the fallback starts redirecting to `/login`.
const OFFLINE_URL = "/offline";

// WARN: Duplicates `OFFLINE_SHELL_ROUTE` in `shared/config`, for the reason above. Nested under `OFFLINE_URL` so it inherits the same matcher exclusion.
const OFFLINE_SHELL_URL = "/offline/shell";

// WARN: Duplicates `MIRRORED_ROUTES` in `shared/config`, for the reason above. Exact paths, never prefixes — `/settings/devices` and `/settings/emoticons` have no mirror and must reach `OFFLINE_URL` instead.
// INFO: `/archive` is here without a screen behind it — online it redirects to the 갤러리 shelf, and offline there is no redirect to run.
const MIRRORED_PATHS = [
  "/chat",
  "/calendar",
  "/archive",
  "/archive/gallery",
  "/archive/files",
  "/archive/voice",
  "/settings",
];

// WARN: Written by `scripts/generate-offline-precache.ts` after every build, and read only during `install` — which is why `push-registration.ts` hangs the build on this worker's script URL. Nothing here re-reads it, so without a new install the list below is whatever the first install fetched, forever.
// WARN: Data rather than an `importScripts`ed script, and not for freshness. WebKit is alone in skipping imported scripts in its byte-for-byte update check, so importing it would update the worker on Chrome and Firefox and silently never on iOS, which is the platform this app is installed on.
// WARN: The `offline` prefix is load-bearing, not a naming choice — it is what keeps this path out of `proxy.ts`'s matcher. Renamed, a signed-out browser is served a 307 to `/login`, whose HTML fails `.json()` and empties the list with nothing reporting it.
const PRECACHE_MANIFEST_URL = "/offline-precache.json";

// WARN: Every cache this app owns starts with it, and `evictOtherVersions` deletes by this prefix alone — jandh-emoticons is a separate deployment on this same origin (AGENTS.md § 4.2.1.), and `caches.keys()` would otherwise hand us its storage to wipe.
// WARN: The `v` is part of the prefix and not an accident of the name below. Cut to `jandh-`, it matches a sibling's `jandh-emoticons-…` too, which is the bug this exists to prevent; kept, it still matches the `jandh-v1`/`jandh-v2` this app already shipped, so those are collected rather than stranded.
const CACHE_PREFIX = "jandh-v";

// WARN: Bump on any change to what is cached or how. `activate` deletes every other version, and that is the only thing that evicts a stale `OFFLINE_URL`.
const CACHE_NAME = `${CACHE_PREFIX}3`;

// INFO: REQUIREMENTS.md § 16. Content-hashed build output — a changed file gets a new URL, so a hit can never be the previous deploy's bytes. This is what makes caching safe here at all.
// WARN: `/icons/` is deliberately absent. `pnpm icons` regenerates `icon-192.png` and the splash set **in place**, under fixed names, so a cache-first entry would serve the old artwork on every installed client until `CACHE_NAME` moved — and nothing ties the two together.
const IMMUTABLE_PREFIXES = ["/_next/static/"];

/**
 * Whether this worker may cache anything at all (REQUIREMENTS.md § 16.).
 *
 * WARN: Off outside production, and the whole of caching goes with it — not just
 * `IMMUTABLE_PREFIXES`. The comment above that list is the reason: caching is safe
 * *because* a changed file gets a new URL. `next dev` reuses stable chunk names, so
 * the premise is simply false there — the worker pins the first bundle it ever saw
 * and serves it back over every edit, which reads as HMR having stopped working.
 *
 * WARN: Read off the registration URL because a worker is served raw from `public/`
 * and can reach neither `process.env` nor `@/shared/config`. `push-registration.ts`
 * is what appends it, and the two have to move together. A different script URL is a
 * different registration, which is the intended effect: a dev worker and a
 * production one never share a state.
 */
const IS_CACHING_ENABLED = new URL(self.location.href).searchParams.get("nocache") !== "1";

self.addEventListener("install", (event) => {
  if (IS_CACHING_ENABLED) {
    event.waitUntil(precache());
  }

  // INFO: A new build takes over on the next launch rather than the one after it.
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(Promise.all([evictOtherVersions(), self.clients.claim()]));
});

self.addEventListener("fetch", (event) => {
  const handler = resolveHandler(event.request);

  // WARN: No `respondWith` at all for anything unrecognised, rather than a pass-through `fetch()`. `/api/chat/stream` is an SSE body held open for the life of the tab (§ 8.4.), and routing one through the worker is how that gets buffered or cut.
  if (handler) {
    event.respondWith(handler(event.request));
  }
});

// WARN: Per-URL and swallowed, never `cache.addAll`. A rejected `waitUntil` fails the install, an unactivated worker rejects `register()`, and § 16.1. loses the push subscription with it — reported only as the Settings toggle sitting empty.
async function precache() {
  try {
    const cache = await caches.open(CACHE_NAME);

    // WARN: Awaited to completion before the manifest is even read, so nothing downstream can decide whether the fallbacks land. Built as one array with the assets, these were already in flight when a malformed body threw at `.map` — un-awaited, which let `waitUntil` resolve through the catch and left the browser free to kill the worker mid-add.
    // WARN: `reload` on the two documents alone. Neither URL carries a content hash, so only a bypass of the HTTP cache stops a redeployed mirror being precached as the previous build's HTML.
    await Promise.all(
      [OFFLINE_URL, OFFLINE_SHELL_URL].map((url) =>
        addToCache(cache, new Request(url, { cache: "reload" })),
      ),
    );

    const assets = await readPrecacheManifest();

    // INFO: Hashed URLs, so a plain add lets the HTTP cache answer instead of re-downloading megabytes the page being installed from has already fetched.
    await Promise.all(assets.map((url) => addToCache(cache, url)));
  } catch {
    // INFO: A miss here costs the offline fallback and nothing else; push must still activate.
  }
}

/**
 * REQUIREMENTS.md § 16. The build's own `/_next/static` list, which is what lets a
 * route the reader has never opened boot offline.
 *
 * WARN: `serveImmutable` caches only what has already been requested, so a mirrored screen nobody has visited has never fetched its own `page-*.js` — it would serve HTML that cannot hydrate, which for a snapshot-driven mirror is a permanently empty screen.
 */
async function readPrecacheManifest() {
  try {
    const response = await fetch(PRECACHE_MANIFEST_URL, { cache: "reload" });
    const manifest = response.ok ? await response.json() : null;

    // WARN: A 200 is not a manifest. A captive portal, a CDN error body and a proxy interstitial all parse as JSON, so the shape is checked rather than trusted — anything else contributes nothing instead of reaching `.map` as a `TypeError`.
    return Array.isArray(manifest) ? manifest.filter((url) => typeof url === "string") : [];
  } catch {
    // INFO: An absent manifest costs the never-visited routes and nothing else — the documents above still precache, and `serveImmutable` still warms whatever is actually opened.
    return [];
  }
}

function addToCache(cache, request) {
  return cache.add(request).catch(() => undefined);
}

/**
 * WARN: With caching off this takes `CACHE_NAME` too, so the fix is self-healing —
 * a browser that already holds a dev bundle from before this flag existed is emptied
 * on the next activation rather than needing Settings' 강제 새로고침 pressed by hand.
 */
async function evictOtherVersions() {
  const names = await caches.keys();
  const kept = IS_CACHING_ENABLED ? CACHE_NAME : null;

  await Promise.all(
    names
      .filter((name) => name.startsWith(CACHE_PREFIX) && name !== kept)
      .map((name) => caches.delete(name)),
  );
}

function resolveHandler(request) {
  // WARN: Before every other test. Off, the worker answers no `fetch` at all and every request goes to the network untouched — which is exactly what `next dev` needs, and leaves push (§ 16.1.) working, since that never touches the cache.
  if (!IS_CACHING_ENABLED || request.method !== "GET") {
    return null;
  }

  const url = new URL(request.url);

  // WARN: A worker controls its whole origin, so a cross-origin request reaches this too — R2 among them, whose URLs are presigned and expire (§ 9.).
  if (url.origin !== self.location.origin) {
    return null;
  }
  if (IMMUTABLE_PREFIXES.some((prefix) => url.pathname.startsWith(prefix))) {
    return serveImmutable;
  }
  // INFO: Documents only. Every other same-origin GET — `/api/*` above all — is user-scoped and left to the network untouched.
  if (request.mode === "navigate") {
    return serveNavigation;
  }

  return null;
}

async function serveImmutable(request) {
  const cached = await caches.match(request);

  if (cached) {
    return cached;
  }

  const response = await fetch(request);

  // WARN: `response.ok` is not enough — an opaque cross-origin redirect reports `status` 0, and storing one serves an unreadable body back on the next hit.
  if (response.ok && response.type === "basic") {
    // WARN: Swallowed, because storing is a convenience and the bytes are already in hand. A rejected `put` — `QuotaExceededError`, this cache holding every deploy's assets — would reject the handler, and `respondWith` turns that into a network error for a chunk that had already arrived.
    await caches
      .open(CACHE_NAME)
      .then((cache) => cache.put(request, response.clone()))
      .catch(() => undefined);
  }

  return response;
}

// INFO: Network-first, because a document is never cached — the fallback is reached only when the network itself fails, which is the definition of the case § 16. is for.
async function serveNavigation(request) {
  try {
    return await fetch(request);
  } catch {
    // INFO: REQUIREMENTS.md § 16. One URL-inert document answers every mirrored path — it reads `location.pathname` after mount, so serving it here leaves the address bar on the route the reader actually asked for.
    const mirror = isMirrored(new URL(request.url).pathname)
      ? await caches.match(OFFLINE_SHELL_URL)
      : undefined;

    if (mirror) {
      return mirror;
    }

    // INFO: The fallback of the fallback — an unmirrored path, or a browser whose mirror precache missed.
    const cached = await caches.match(OFFLINE_URL);

    // WARN: Rethrowing rather than inventing a `Response` when the precache missed — a synthetic error page here would be indistinguishable from a real one the server sent.
    if (!cached) {
      throw new Error("offline, and the fallback page was never cached");
    }

    return cached;
  }
}

// WARN: An exact match and never a prefix test — `/settings` mirrors while `/settings/devices`, `/settings/emoticons` and `/settings/server` do not, and a prefix would hand all three a screen with no snapshot behind it.
function isMirrored(pathname) {
  return MIRRORED_PATHS.includes(pathname);
}

self.addEventListener("push", (event) => {
  event.waitUntil(handlePush(event.data));
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  event.waitUntil(openConversation(event.notification.data?.url ?? FALLBACK_URL));
});

async function handlePush(data) {
  const payload = readPayload(data);

  updateBadge(payload.unreadCount);
  await postUnreadCount(payload.unreadCount);

  // WARN: REQUIREMENTS.md § 16.1. Every push MUST end in a banner, with no exception for a visible window — WebKit revokes the subscription after three that do not, which reads as the Settings toggle emptying itself and push dying for good.
  await self.registration.showNotification(payload.title, {
    body: payload.body,
    icon: NOTIFICATION_ICON,
    badge: NOTIFICATION_ICON,
    // INFO: REQUIREMENTS.md § 6. One conversation, so a second message replaces the first banner instead of stacking beside it; `renotify` is what still alerts on the replacement.
    tag: NOTIFICATION_TAG,
    renotify: true,
    // WARN: REQUIREMENTS.md § 16.1. Always an explicit boolean, never omitted. WebKit's `platformShouldPlaySound` reads an absent `silent` opposite ways per platform — `silent == nullopt || !*silent` on iOS, `silent != nullopt && !*silent` on macOS — so leaving it out means sound on the phone and silence on the desktop for the same push.
    silent: payload.silent === true,
    data: { url: payload.url },
  });
}

// INFO: REQUIREMENTS.md § 8.4.2. The tab-bar badge is driven by the stream, which is only open on 채팅 — this is what moves it while the user is on one of the other three tabs.
// WARN: It informs the page, it never replaces the banner. § 16.1. revokes the subscription after three pushes that show nothing, and standing the notification down because a window is open is exactly the shape that lost it.
async function postUnreadCount(unreadCount) {
  const windows = await self.clients.matchAll({ type: "window", includeUncontrolled: true });

  windows.forEach((client) => client.postMessage({ type: UNREAD_COUNT_MESSAGE, unreadCount }));
}

async function openConversation(url) {
  const windows = await self.clients.matchAll({ type: "window", includeUncontrolled: true });
  const existing = windows[0];

  // INFO: Focusing beats opening — a second window of an installed PWA is a second copy of the app shell, each holding its own SSE connection.
  if (existing) {
    await existing.focus();

    return existing.navigate(url).catch(() => undefined);
  }

  return self.clients.openWindow(url);
}

function readPayload(data) {
  const fallback = {
    title: "새 메시지",
    body: "",
    unreadCount: 0,
    url: FALLBACK_URL,
    silent: false,
  };

  if (!data) {
    return fallback;
  }

  try {
    return { ...fallback, ...data.json() };
  } catch {
    return fallback;
  }
}

function updateBadge(unreadCount) {
  // INFO: REQUIREMENTS.md § 16.1. Absent outside installed PWAs, and the push must still land where it is.
  if (typeof self.navigator?.setAppBadge !== "function") {
    return;
  }

  if (unreadCount > 0) {
    self.navigator.setAppBadge(unreadCount).catch(() => undefined);
  } else {
    self.navigator.clearAppBadge?.().catch(() => undefined);
  }
}
