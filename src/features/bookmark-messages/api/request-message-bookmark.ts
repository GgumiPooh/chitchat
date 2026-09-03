import { request } from "@/shared/api";
import type { MessageId } from "@/shared/lib";

/** `PUT /api/messages/{id}/bookmark` — `false` when the message was not bookmarkable. */
export async function requestAddMessageBookmark(id: MessageId): Promise<boolean> {
  const response = await request(`/api/messages/${id}/bookmark`, { method: "PUT" });

  if (response.ok) {
    return true;
  }
  if (response.status === 404) {
    return false;
  }

  throw new Error(`PUT /api/messages/${id}/bookmark responded ${response.status}`);
}

/** `DELETE /api/messages/{id}/bookmark` — `false` when there was nothing to remove. */
export async function requestRemoveMessageBookmark(id: MessageId): Promise<boolean> {
  const response = await request(`/api/messages/${id}/bookmark`, { method: "DELETE" });

  if (response.ok) {
    return true;
  }
  if (response.status === 404) {
    return false;
  }

  throw new Error(`DELETE /api/messages/${id}/bookmark responded ${response.status}`);
}
