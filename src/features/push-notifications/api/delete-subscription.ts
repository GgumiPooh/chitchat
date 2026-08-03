import { PUSH_SUBSCRIPTION_PATH } from "@/shared/config";

export async function deleteSubscription(endpoint: string): Promise<void> {
  const response = await fetch(PUSH_SUBSCRIPTION_PATH, {
    method: "DELETE",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ endpoint }),
  });

  if (!response.ok) {
    throw new Error(`DELETE ${PUSH_SUBSCRIPTION_PATH} responded ${response.status}`);
  }
}
