import { request } from "@/shared/api";
import { PUSH_SUBSCRIPTION_PATH } from "@/shared/config";

export async function updateSubscriptionSound(
  endpoint: string,
  soundEnabled: boolean,
): Promise<void> {
  const response = await request(PUSH_SUBSCRIPTION_PATH, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ endpoint, soundEnabled }),
  });

  if (!response.ok) {
    throw new Error(`PATCH ${PUSH_SUBSCRIPTION_PATH} responded ${response.status}`);
  }
}
