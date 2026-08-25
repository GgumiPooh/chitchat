import { request } from "@/shared/api";
import type { MessageId } from "@/shared/lib";

/** REQUIREMENTS.md § 8.17. Folds a message away or unfolds it, for either participant. */
export async function requestMessageCollapse(id: MessageId, isCollapsed: boolean): Promise<void> {
  const response = await request(`/api/messages/${id}/collapse`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ isCollapsed }),
  });

  if (!response.ok) {
    throw new Error(`PATCH /api/messages/${id}/collapse responded ${response.status}`);
  }
}
