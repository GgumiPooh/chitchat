import { request } from "@/shared/api";
import type { EmoticonItemId, MessageId } from "@/shared/lib";

export type ReactionPayload =
  | { reactionType: "emoji"; emoji: string }
  | { reactionType: "emoticon"; emoticonItemId: EmoticonItemId };

export async function sendMessageReaction(messageId: MessageId, payload: ReactionPayload) {
  const url = `/api/messages/${encodeURIComponent(messageId)}/reaction`;
  const response = await request(url, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });

  if (!response.ok) {
    throw new Error(`PUT ${url} failed with status ${response.status}`);
  }

  return response.json();
}
