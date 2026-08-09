import type { ChatTrackMedia } from "@/entities/media";
import { request } from "@/shared/api";
import { CHAT_MEDIA_PATH } from "@/shared/config";

export type FetchConversationMediaParams = {
  /** REQUIREMENTS.md § 8.1. The slide the reader tapped; the window comes back centred on it. */
  around?: string;
  /** REQUIREMENTS.md § 8.1. The track's oldest loaded slide — the page before it, which extends the front. */
  before?: string;
  /** REQUIREMENTS.md § 8.1. The track's newest loaded slide — the page after it, which extends the back. */
  after?: string;
};

/**
 * REQUIREMENTS.md § 8.1. One page of the § 7.10. viewer's track — the window it opens
 * on, or the stretch beyond one of its edges.
 *
 * WARN: Exactly one of the three, or the route answers 400. They name different windows and the server prefers `around`, so a request carrying two would have its cursor silently dropped.
 */
export async function fetchConversationMedia({
  around,
  before,
  after,
}: FetchConversationMediaParams): Promise<ChatTrackMedia[]> {
  const query = new URLSearchParams();

  if (around) {
    query.set("around", around);
  }

  if (before) {
    query.set("before", before);
  }

  if (after) {
    query.set("after", after);
  }

  const response = await request(`${CHAT_MEDIA_PATH}?${query}`);

  if (!response.ok) {
    throw new Error(`GET ${CHAT_MEDIA_PATH} responded ${response.status}`);
  }

  const { media } = (await response.json()) as { media: ChatTrackMedia[] };

  return media;
}
