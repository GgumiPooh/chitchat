import type { MessageBookmark } from "@/entities/message";
import { request } from "@/shared/api";
import { MESSAGE_BOOKMARKS_PATH } from "@/shared/config";

export async function fetchMessageBookmarks(hideOthers: boolean): Promise<MessageBookmark[]> {
  const params = new URLSearchParams(hideOthers ? { hideOthers: "true" } : {});
  const response = await request(`${MESSAGE_BOOKMARKS_PATH}?${params}`);

  if (!response.ok) {
    throw new Error(`GET ${MESSAGE_BOOKMARKS_PATH} responded ${response.status}`);
  }

  const { bookmarks } = (await response.json()) as { bookmarks: MessageBookmark[] };

  return bookmarks;
}
