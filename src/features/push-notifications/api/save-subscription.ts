import type { PushSubscriptionInput } from "@/entities/push-subscription";
import { request } from "@/shared/api";
import { PUSH_SUBSCRIPTION_PATH } from "@/shared/config";

export async function saveSubscription(subscription: PushSubscriptionInput): Promise<void> {
  const response = await request(PUSH_SUBSCRIPTION_PATH, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(subscription),
  });

  if (!response.ok) {
    throw new Error(`POST ${PUSH_SUBSCRIPTION_PATH} responded ${response.status}`);
  }
}
