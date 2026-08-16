import type { ChatMessage } from "@/entities/message";
import { rememberInlineEmoticons } from "@/features/chat-stream";
import { request } from "@/shared/api";
import { CHANGED_MESSAGES_PATH, type InlineEmoticonMap } from "@/shared/config";
import type { MessageId } from "@/shared/lib";

/** REQUIREMENTS.md § 8.13.1. The oldest and newest rows the window holds, both inclusive. */
export async function fetchChangedMessages(from: MessageId, to: MessageId): Promise<ChatMessage[]> {
  const response = await request(`${CHANGED_MESSAGES_PATH}?from=${from}&to=${to}`);

  if (!response.ok) {
    throw new Error(`GET ${CHANGED_MESSAGES_PATH} responded ${response.status}`);
  }

  const { messages, emoticons } = (await response.json()) as {
    messages: ChatMessage[];
    emoticons: InlineEmoticonMap;
  };

  // WARN: § 13. Taken here, exactly as `fetchMessages` takes it — a correction can put an emoticon into a row the window already holds.
  rememberInlineEmoticons(emoticons);

  return messages;
}
