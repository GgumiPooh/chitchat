import type { PushSubscriptionInput } from "@/entities/push-subscription";
import { SERVICE_WORKER_PATH, VAPID_PUBLIC_KEY } from "@/shared/config";
import { safelyGetAsync } from "@/shared/lib";
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

function registerPushWorker(): Promise<ServiceWorkerRegistration> {
  // INFO: `updateViaCache: "none"` on top of the no-store header — the browser has its own worker cache that HTTP headers alone do not reach.
  return navigator.serviceWorker.register(SERVICE_WORKER_PATH, {
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
