import "server-only";

import { ensureEnv } from "@/shared/config";
import { AN_HOUR, A_SECOND } from "@/shared/lib";
import webpush from "web-push";

export type PushTarget = {
  endpoint: string;
  p256dh: string;
  auth: string;
};

/**
 * `gone` means the push service has retired this endpoint for good — the browser
 * was uninstalled, the permission was revoked, or the subscription rotated. The
 * caller MUST delete the row rather than retrying (`REQUIREMENTS.md § 16.1.`).
 */
export type PushResult = "sent" | "gone" | "failed";

// INFO: A 404 is as final as a 410 here — FCM answers a retired registration with either, and neither is worth a retry.
const GONE_STATUS_CODES = new Set([404, 410]);

// INFO: AGENTS.md § 8.2. `web-push` takes `TTL` in seconds. A banner is worthless once the conversation has moved on, and a device offline longer than this gets the § 8.4. catch-up instead.
const PUSH_TTL = (12 * AN_HOUR) / A_SECOND;

let isConfigured = false;

/**
 * Delivers one encrypted payload to one subscription. Never throws — a dead
 * device must not fail the send that triggered the notification.
 */
export async function sendPush(target: PushTarget, payload: string): Promise<PushResult> {
  try {
    configure();

    await webpush.sendNotification(
      { endpoint: target.endpoint, keys: { p256dh: target.p256dh, auth: target.auth } },
      payload,
      { TTL: PUSH_TTL, urgency: "high" },
    );

    return "sent";
  } catch (error) {
    return isGone(error) ? "gone" : "failed";
  }
}

// WARN: Lazy, not module scope. `ensureEnv` throws on a missing key, and at module scope that would fail the build of every route that transitively imports this.
function configure() {
  if (isConfigured) {
    return;
  }

  webpush.setVapidDetails(
    ensureEnv("VAPID_SUBJECT"),
    ensureEnv("NEXT_PUBLIC_VAPID_PUBLIC_KEY"),
    ensureEnv("VAPID_PRIVATE_KEY"),
  );

  isConfigured = true;
}

function isGone(error: unknown): boolean {
  const statusCode = (error as { statusCode?: number } | null)?.statusCode;

  return statusCode !== undefined && GONE_STATUS_CODES.has(statusCode);
}
