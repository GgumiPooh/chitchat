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
  const windows = await self.clients.matchAll({ type: "window", includeUncontrolled: true });

  updateBadge(payload.unreadCount);

  // WARN: The app open and on screen means its SSE stream (§ 8.4.) already delivered this message and the shell already chimed. Showing a banner too would double every message. Skipping the notification is only permitted because a visible window exists — do not widen this test to "a window exists".
  if (windows.some((client) => client.visibilityState === "visible")) {
    return;
  }

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
