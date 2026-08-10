import type { PushSubscriptionInput } from "@/entities/push-subscription";
import { IS_DEV, SERVICE_WORKER_PATH, VAPID_PUBLIC_KEY } from "@/shared/config";
import { safelyGetAsync, safelyRunAsync } from "@/shared/lib";
import { deleteSubscription } from "../api/delete-subscription";
import { saveSubscription } from "../api/save-subscription";

/** `blocked` is terminal from inside the page — only the browser's own site settings can undo it. */
export type PushStatus = "unsupported" | "blocked" | "off" | "on";

/**
 * REQUIREMENTS.md § 16.1. iOS exposes `PushManager` only to a home-screen PWA, so
 * a Safari tab lands on `unsupported` here without any user-agent sniffing.
 */
export function isPushSupported(): boolean {
  return (
    VAPID_PUBLIC_KEY !== "" &&
    "serviceWorker" in navigator &&
    "PushManager" in window &&
    "Notification" in window
  );
}

/**
 * Registers the push-only worker and reports what the browser currently holds.
 *
 * INFO: The subscription is re-saved on every launch (§ 16.1.). Endpoints rotate,
 * deleting the app from the home screen destroys the subscription without telling
 * the server, and a `410` prune on the send path can retire a row the browser
 * still believes in — this is the only thing that reconciles all three.
 */
export async function syncPushSubscription(): Promise<PushStatus> {
  if (!isPushSupported()) {
    return "unsupported";
  }
  if (Notification.permission === "denied") {
    return "blocked";
  }

  const subscription = await safelyGetAsync(async () => {
    const registration = await registerPushWorker();

    return registration.pushManager.getSubscription();
  });

  if (!subscription) {
    return "off";
  }

  // INFO: A subscription the server does not hold delivers nothing, so a failed save reports `off` rather than a switch that lies — turning it back on re-saves the same subscription.
  const isSaved = await safelyGetAsync(async () => {
    await saveSubscription(toSubscriptionInput(subscription));

    return true;
  });

  return isSaved ? "on" : "off";
}

/**
 * Clears the banners this origin has already delivered (REQUIREMENTS.md § 16.1.).
 *
 * INFO: § 16.1. shows a banner on every push, the ones a visible window received included, and the OS keeps each one until it is dismissed by hand — so a reader who catches up in the app still finds them waiting in Notification Center.
 *
 * WARN: Called from the page, and only on entering it. § 16.1. is explicit that closing a banner from inside the worker's `push` event reads to WebKit as never having shown one, which is what costs the subscription.
 *
 * WARN: Unfiltered rather than by `sw.js`'s tag (§ 16.1.) — the tag lives in the worker alone, and a mirrored copy here would be a second source of truth nothing checks. A registration is per-origin, so everything it holds is ours anyway.
 */
export async function dismissDeliveredNotifications(): Promise<void> {
  // INFO: Looser than `isPushSupported` on purpose — clearing a banner needs neither `PushManager` nor the VAPID key, and a device whose subscription has since been retired is still holding the banners it was sent.
  if (!("serviceWorker" in navigator)) {
    return;
  }

  await safelyRunAsync(async () => {
    // WARN: `getRegistration`, never `registerPushWorker` — a browser holding no banners has none to clear, and installing § 16.'s worker as a side effect of a sweep would start caching for a user who never subscribed.
    const registration = await navigator.serviceWorker.getRegistration();
    const delivered = await registration?.getNotifications();

    delivered?.forEach((notification) => notification.close());
  });
}

/** WARN: Must be called from inside a user gesture — every browser drops a permission prompt that is not. */
export async function subscribeToPush(): Promise<PushStatus> {
  const permission = await Notification.requestPermission();

  if (permission !== "granted") {
    return permission === "denied" ? "blocked" : "off";
  }

  const registration = await registerPushWorker();
  const subscription = await registration.pushManager.subscribe({
    // WARN: Required. A subscription without it is rejected outright, and it is the promise the § 16.1. worker keeps by showing a banner whenever no window is visible.
    userVisibleOnly: true,
    applicationServerKey: toApplicationServerKey(VAPID_PUBLIC_KEY),
  });

  await saveSubscription(toSubscriptionInput(subscription));

  return "on";
}

export async function unsubscribeFromPush(): Promise<PushStatus> {
  const registration = await registerPushWorker();
  const subscription = await registration.pushManager.getSubscription();

  if (subscription) {
    // WARN: The row goes first. `unsubscribe()` is what makes the endpoint unrecoverable, so failing after it would strand a row that can never be matched again.
    await deleteSubscription(subscription.endpoint);
    await subscription.unsubscribe();
  }

  return "off";
}

/**
 * WARN: REQUIREMENTS.md § 16. `?nocache=1` outside production, which is how the
 * worker is told to cache nothing — it is served raw from `public/` and can read no
 * environment of its own, so the flag has to ride on the URL. `sw.js` reads exactly
 * this parameter and the two have to move together.
 *
 * WARN: This makes the script URL differ between dev and production, and therefore
 * the registration. That is the intended effect rather than a side one: a worker
 * carrying a development bundle can never be the one an installed app is running.
 */
function registerPushWorker(): Promise<ServiceWorkerRegistration> {
  const path = IS_DEV ? `${SERVICE_WORKER_PATH}?nocache=1` : SERVICE_WORKER_PATH;

  // INFO: `updateViaCache: "none"` on top of the no-store header — the browser has its own worker cache that HTTP headers alone do not reach.
  return navigator.serviceWorker.register(path, {
    scope: "/",
    updateViaCache: "none",
  });
}

function toSubscriptionInput(subscription: PushSubscription): PushSubscriptionInput {
  const { endpoint, keys } = subscription.toJSON();

  return {
    endpoint: endpoint ?? subscription.endpoint,
    p256dh: keys?.p256dh ?? "",
    auth: keys?.auth ?? "",
    userAgent: navigator.userAgent,
  };
}

/** The VAPID public key is distributed base64url; `subscribe` wants the raw bytes. */
function toApplicationServerKey(base64Url: string): Uint8Array<ArrayBuffer> {
  const padded = base64Url.padEnd(base64Url.length + ((4 - (base64Url.length % 4)) % 4), "=");
  const binary = atob(padded.replace(/-/g, "+").replace(/_/g, "/"));
  const bytes = new Uint8Array(new ArrayBuffer(binary.length));

  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index);
  }

  return bytes;
}
