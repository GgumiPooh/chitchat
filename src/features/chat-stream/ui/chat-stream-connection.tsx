"use client";

import { useChatStreamHandlers } from "../model/chat-stream-provider";
import { useChatEventSource } from "../model/use-chat-event-source";
import { DormantOverlay } from "./dormant-overlay";

export type ChatStreamConnectionProps = {
  className?: string;
};

/**
 * REQUIREMENTS.md § 8.4.2. The app's one `EventSource`, held for exactly as long
 * as the conversation is on screen. Mounted by the chat screen and nowhere else —
 * a second mount would open a second stream and double the unpooled connections.
 *
 * INFO: It renders only the 절전 모드 overlay (§ 8.4.1.); the state the stream feeds
 * lives in `ChatStreamProvider`, up in the shell, and outlives this.
 */
export function ChatStreamConnection({ className }: ChatStreamConnectionProps) {
  const { isDormant, wake } = useChatEventSource(useChatStreamHandlers());

  return isDormant ? <DormantOverlay className={className} onWake={wake} /> : null;
}
