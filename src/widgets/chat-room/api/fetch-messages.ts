import type { ChatMessage } from "@/entities/message";

export type FetchMessagesParams = {
  before?: number;
  after?: number;
  around?: number;
};

export async function fetchMessages(params: FetchMessagesParams): Promise<ChatMessage[]> {
  const query = new URLSearchParams();

  Object.entries(params).forEach(([name, value]) => {
    if (value !== undefined) {
      query.set(name, String(value));
    }
  });

  const response = await fetch(`/api/messages?${query}`);

  if (!response.ok) {
    throw new Error(`GET /api/messages responded ${response.status}`);
  }

  const { messages } = (await response.json()) as { messages: ChatMessage[] };

  return messages;
}
