/**
 * Push-only service worker (REQUIREMENTS.md § 7., § 16.1.).
 *
 * WARN: It must never cache. Offline support is out of scope, and a caching
 * worker is the single largest source of "why am I looking at last week's build"
 * bugs. Nothing here may register a `fetch` handler.
 */

// WARN: A worker is served raw from `public/`, outside the bundle, so nothing here can import `@/shared/config`. This file owns the § 16.1. tag; `FALLBACK_URL` duplicates `CHAT_ROUTE` and has to move with it.
const NOTIFICATION_TAG = "jandh-chat";

const NOTIFICATION_ICON = "/icons/icon-192.png";

const FALLBACK_URL = "/chat";

// WARN: Duplicates `UNREAD_COUNT_MESSAGE` in `shared/config`, for the reason above — a worker cannot import it. The two names have to move together.
const UNREAD_COUNT_MESSAGE = "unread-count";

self.addEventListener("install", () => {
  // INFO: There is no cache to warm and no old worker whose state matters, so a new build takes over on the next launch rather than the one after it.
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(self.clients.claim());
});

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
