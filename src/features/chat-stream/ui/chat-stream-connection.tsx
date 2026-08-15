"use client";

import { useChatStream, useChatStreamHandlers } from "../model/chat-stream-provider";
import { useChatEventSource } from "../model/use-chat-event-source";

/**
 * REQUIREMENTS.md § 8.4.2. The app's one `EventSource`, held for exactly as long
 * as the conversation is on screen. Mounted by the chat screen and nowhere else —
 * a second mount would open a second stream and double the unpooled connections.
 *
 * INFO: It renders nothing and takes no props (AGENTS.md § 1.1. governs components
 * that draw something). It exists so that "the socket is open" is a mount in the
 * chat screen's JSX rather than a hook call some other screen could copy. § 8.4.1.
 * lives in `ChatStreamProvider`, which owns the state and is told the room is on
 * screen by `ChatRoom`'s own mount rather than by this one.
 */
export function ChatStreamConnection() {
  const { isDormant } = useChatStream();

  useChatEventSource(useChatStreamHandlers(), isDormant);

  return null;
}
