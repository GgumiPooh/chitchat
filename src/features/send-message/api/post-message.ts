import type { ChatMessage } from "@/entities/message";

// INFO: REQUIREMENTS.md § 8.9. The quoted id is not a payload of its own — it rides on whichever of the three a reply happens to be.
type ReplyParams = { replyToId?: number };

// INFO: REQUIREMENTS.md § 6. Text, attachments, or one emoticon — never a combination. The route's schema and the table's CHECK constraint say the same thing.
export type PostMessageParams = ReplyParams &
  (
    | { clientMsgId: string; text: string }
    | { clientMsgId: string; mediaIds: string[] }
    | { clientMsgId: string; emoticonItemId: string }
  );

export async function postMessage(params: PostMessageParams): Promise<ChatMessage> {
  const response = await fetch("/api/messages", {
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
