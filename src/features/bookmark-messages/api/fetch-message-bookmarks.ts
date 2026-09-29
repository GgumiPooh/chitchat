import type { MessageBookmark } from "@/entities/message";
import { request } from "@/shared/api";
import { MESSAGE_BOOKMARKS_PATH } from "@/shared/config";
import type { MessageId } from "@/shared/lib";

export type FetchMessageBookmarksParams = {
  hideOthers: boolean;
  before?: MessageId;
};

export type FetchMessageBookmarksResponse = {
  bookmarks: MessageBookmark[];
  allIds?: MessageId[];
  hasMore: boolean;
};

export async function fetchMessageBookmarks({
  hideOthers,
  before,
}: FetchMessageBookmarksParams): Promise<FetchMessageBookmarksResponse> {
  const params = new URLSearchParams();

  if (hideOthers) {
    params.set("hideOthers", "true");
  }

  if (before) {
    params.set("before", before);
  }

  const response = await request(`${MESSAGE_BOOKMARKS_PATH}?${params}`);

  if (!response.ok) {
    throw new Error(`GET ${MESSAGE_BOOKMARKS_PATH} responded ${response.status}`);
  }

  return (await response.json()) as FetchMessageBookmarksResponse;
}
