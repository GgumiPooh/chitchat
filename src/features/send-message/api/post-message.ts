import type { ChatMessage } from "@/entities/message";
import { request } from "@/shared/api";
import type { InlineEmoticonMap } from "@/shared/config";
import type { EmoticonItemId, MediaId, MessageId } from "@/shared/lib";

// INFO: REQUIREMENTS.md § 8.10. The quoted id is not a payload of its own — it rides on whichever of the three a reply happens to be.
type ReplyParams = { replyToId?: MessageId };

// INFO: REQUIREMENTS.md § 6. Text, attachments, or one emoticon — never a combination. The route's schema and the table's CHECK constraint say the same thing.
export type PostMessageParams = ReplyParams &
  // INFO: REQUIREMENTS.md § 13. One id per `OBJECT_PLACEHOLDER` in the text; the route refuses a body whose halves disagree.
  (
    | { clientMsgId: string; text: string; inlineEmoticonItemIds?: EmoticonItemId[] }
    | { clientMsgId: string; mediaIds: MediaId[] }
    | { clientMsgId: string; emoticonItemId: EmoticonItemId }
  );

export async function postMessage(params: PostMessageParams): Promise<ChatMessage> {
  const response = await request("/api/messages", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(params),
  });

  if (!response.ok) {
    throw new Error(`POST /api/messages responded ${response.status}`);
  }

  // INFO: § 13. The echo carries the map every read path does; the row's own emoticons reach the window through the § 8.4. event that arrives with it, so nothing here has to hold it.
  const { message } = (await response.json()) as {
    message: ChatMessage;
    emoticons: InlineEmoticonMap;
  };

  return message;
}
