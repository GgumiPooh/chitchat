/**
 * Push and offline-cache service worker (REQUIREMENTS.md § 7., § 16., § 16.1.).
 *
 * WARN: Only two things may ever enter the cache — build output whose URL carries
 * a content hash, and `OFFLINE_URL`. Everything else in this app varies by user,
 * and `caches` is scoped to the origin rather than the session: § 16.1. has two
 * accounts sharing one browser, and logging out clears the cookie, not this.
 */

// WARN: A worker is served raw from `public/`, outside the bundle, so nothing here can import `@/shared/config`. This file owns the § 16.1. tag; `FALLBACK_URL` duplicates `CHAT_ROUTE` and has to move with it.
const NOTIFICATION_TAG = "jandh-chat";

const NOTIFICATION_ICON = "/icons/icon-192.png";

const FALLBACK_URL = "/chat";

// WARN: Duplicates `UNREAD_COUNT_MESSAGE` in `shared/config`, for the reason above — a worker cannot import it. The two names have to move together.
const UNREAD_COUNT_MESSAGE = "unread-count";

// WARN: Duplicates `OFFLINE_ROUTE` in `shared/config`, for the reason above. It is also excluded from `proxy.ts`'s matcher, so the two have to move together or the fallback starts redirecting to `/login`.
const OFFLINE_URL = "/offline";

// WARN: Bump on any change to what is cached or how. `activate` deletes every other version, and that is the only thing that evicts a stale `OFFLINE_URL`.
const CACHE_NAME = "jandh-v1";

// INFO: REQUIREMENTS.md § 16. Content-hashed build output — a changed file gets a new URL, so a hit can never be the previous deploy's bytes. This is what makes caching safe here at all.
// WARN: `/icons/` is deliberately absent. `pnpm icons` regenerates `icon-192.png` and the splash set **in place**, under fixed names, so a cache-first entry would serve the old artwork on every installed client until `CACHE_NAME` moved — and nothing ties the two together.
const IMMUTABLE_PREFIXES = ["/_next/static/"];

self.addEventListener("install", (event) => {
  event.waitUntil(precacheOfflinePage());
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
async function precacheOfflinePage() {
  try {
    const cache = await caches.open(CACHE_NAME);

    await cache.add(new Request(OFFLINE_URL, { cache: "reload" }));
  } catch {
    // INFO: A miss here costs the offline fallback and nothing else; push must still activate.
  }
}

async function evictOtherVersions() {
  const names = await caches.keys();

  await Promise.all(names.filter((name) => name !== CACHE_NAME).map((name) => caches.delete(name)));
}

function resolveHandler(request) {
  if (request.method !== "GET") {
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
    const cache = await caches.open(CACHE_NAME);

    await cache.put(request, response.clone());
  }

  return response;
}

// INFO: Network-first, because a document is never cached — the fallback is reached only when the network itself fails, which is the definition of the case § 16. is for.
async function serveNavigation(request) {
  try {
    return await fetch(request);
  } catch {
    const cached = await caches.match(OFFLINE_URL);

    // WARN: Rethrowing rather than inventing a `Response` when the precache missed — a synthetic error page here would be indistinguishable from a real one the server sent.
    if (!cached) {
      throw new Error("offline, and the fallback page was never cached");
    }

    return cached;
  }
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
  const fallback = { title: "새 메시지", body: "", unreadCount: 0, url: FALLBACK_URL };

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
