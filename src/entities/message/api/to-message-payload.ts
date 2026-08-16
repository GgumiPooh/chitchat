import "server-only";

import { listInlineEmoticons } from "@/entities/emoticon/@x/message";
import type { InlineEmoticonMap } from "@/shared/config";
import type { ChatMessage } from "../model/types";

/**
 * A page of messages as it crosses to the browser: the rows, and the emoticons their
 * text stands them in (REQUIREMENTS.md § 13.).
 *
 * WARN: Every path that puts messages in front of a reader answers this shape — the
 * room's first render, both history directions, the stream, the catch-up and the
 * offline snapshot. A path that ships the rows without the map draws blank boxes on
 * that path alone, which is a bug nobody reproduces from the screens they were on.
 */
export type MessagePayload = {
  messages: ChatMessage[];
  emoticons: InlineEmoticonMap;
};

/** @see MessagePayload — the single-row shape, for the stream and the send's own echo. */
export type SingleMessagePayload = {
  message: ChatMessage;
  emoticons: InlineEmoticonMap;
};

export async function toMessagePayload(messages: ChatMessage[]): Promise<MessagePayload> {
  return { messages, emoticons: await listMessageInlineEmoticons(messages) };
}

export async function toSingleMessagePayload(message: ChatMessage): Promise<SingleMessagePayload> {
  return { message, emoticons: await listMessageInlineEmoticons([message]) };
}

/**
 * INFO: Deduplicated by `listInlineEmoticons` rather than here, so one `Set` serves
 * the whole page however many rows named the same item.
 */
export function listMessageInlineEmoticons(messages: ChatMessage[]): Promise<InlineEmoticonMap> {
  return listInlineEmoticons(messages.flatMap((message) => message.inlineEmoticonItemIds));
}
