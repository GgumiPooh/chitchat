import type { MessageSearchResult } from "@/entities/message";
import { request } from "@/shared/api";
import { MESSAGE_SEARCH_PATH } from "@/shared/config";
import type { MessageId, Optional } from "@/shared/lib";

export type MessageSearchPage = {
  results: MessageSearchResult[];
  /** Only the cursorless first page carries it — see the route. */
  total: Optional<number>;
};

export type FetchMessageSearchParams = {
  query: string;
  before?: MessageId;
  hideOthers?: boolean;
};

export async function fetchMessageSearch({
  query,
  before,
  hideOthers,
}: FetchMessageSearchParams): Promise<MessageSearchPage> {
  const params = new URLSearchParams({ q: query });

  if (before !== undefined) {
    params.set("before", String(before));
  }

  if (hideOthers) {
    params.set("hideOthers", "true");
  }

  const response = await request(`${MESSAGE_SEARCH_PATH}?${params}`);

  if (!response.ok) {
    throw new Error(`GET ${MESSAGE_SEARCH_PATH} responded ${response.status}`);
  }

  return (await response.json()) as MessageSearchPage;
}
