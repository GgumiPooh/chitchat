import type { ChatMessage } from "@/entities/message";
import { rememberInlineEmoticons } from "@/features/chat-stream";
import { request } from "@/shared/api";
import type { InlineEmoticonMap } from "@/shared/config";
import type { MessageId } from "@/shared/lib";

export type FetchMessagesParams = {
  before?: MessageId;
  after?: MessageId;
  around?: MessageId;
  /** REQUIREMENTS.md § 16.1. 나에게만 보내기 — fetch only private rows when true. */
  onlyMeFilter?: boolean;
};

export async function fetchMessages(params: FetchMessagesParams): Promise<ChatMessage[]> {
  const query = new URLSearchParams();

  Object.entries(params).forEach(([name, value]) => {
    if (value !== undefined) {
      query.set(name, String(value));
    }
  });

  const response = await request(`/api/messages?${query}`);

  if (!response.ok) {
    throw new Error(`GET /api/messages responded ${response.status}`);
  }

  const { messages, emoticons } = (await response.json()) as {
    messages: ChatMessage[];
    emoticons: InlineEmoticonMap;
  };

  // WARN: REQUIREMENTS.md § 13. Taken here rather than returned beside the page, so no caller can hold the rows without it — a page whose emoticons were dropped draws boxes of the wrong size and § 8.3. corrects the scroll under the reader.
  rememberInlineEmoticons(emoticons);

  return messages;
}
