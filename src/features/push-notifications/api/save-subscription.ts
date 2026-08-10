import type { PushSubscriptionInput, SavedPushSubscription } from "@/entities/push-subscription";
import { request } from "@/shared/api";
import { PUSH_SUBSCRIPTION_PATH } from "@/shared/config";

export async function saveSubscription(
  subscription: PushSubscriptionInput,
): Promise<SavedPushSubscription> {
  const response = await request(PUSH_SUBSCRIPTION_PATH, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(subscription),
  });

  if (!response.ok) {
    throw new Error(`POST ${PUSH_SUBSCRIPTION_PATH} responded ${response.status}`);
  }

  const saved: unknown = await response.json().catch(() => null);

  // INFO: REQUIREMENTS.md § 16.1. A body that cannot be read leaves the device sounding, which is the column default and the state every subscription starts in.
  return { soundEnabled: readSoundEnabled(saved) };
}

function readSoundEnabled(saved: unknown): boolean {
  if (saved && typeof saved === "object" && "soundEnabled" in saved) {
    return saved.soundEnabled !== false;
  }

  return true;
}
