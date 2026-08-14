import type { ChatMessage } from "@/entities/message";
import { request } from "@/shared/api";
import type { EmoticonItemId, MediaId, MessageId } from "@/shared/lib";

// INFO: REQUIREMENTS.md § 8.10. The quoted id is not a payload of its own — it rides on whichever of the three a reply happens to be.
type ReplyParams = { replyToId?: MessageId };

// INFO: REQUIREMENTS.md § 6. Text, attachments, or one emoticon — never a combination. The route's schema and the table's CHECK constraint say the same thing.
export type PostMessageParams = ReplyParams &
  (
    | { clientMsgId: string; text: string }
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

  const { message } = (await response.json()) as { message: ChatMessage };

  return message;
}
