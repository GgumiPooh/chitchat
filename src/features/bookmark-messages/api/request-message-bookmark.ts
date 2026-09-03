import { request } from "@/shared/api";
import { MESSAGE_BOOKMARKS_PATH } from "@/shared/config";
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

/** `PATCH /api/messages/{id}/bookmark` — `false` when the bookmark no longer exists. */
export async function requestRenameMessageBookmark(id: MessageId, name: string): Promise<boolean> {
  const response = await request(`/api/messages/${id}/bookmark`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ name }),
  });

  if (response.ok) {
    return true;
  }
  if (response.status === 404) {
    return false;
  }

  throw new Error(`PATCH /api/messages/${id}/bookmark responded ${response.status}`);
}

/** `DELETE /api/messages/bookmarks` — 전체 해제. */
export async function requestRemoveAllMessageBookmarks(): Promise<void> {
  const response = await request(MESSAGE_BOOKMARKS_PATH, { method: "DELETE" });

  if (!response.ok) {
    throw new Error(`DELETE ${MESSAGE_BOOKMARKS_PATH} responded ${response.status}`);
  }
}
