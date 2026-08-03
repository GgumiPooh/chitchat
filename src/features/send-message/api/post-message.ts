import type { ChatMessage } from "@/entities/message";

export type PostMessageParams = {
  clientMsgId: string;
  text: string;
};

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
