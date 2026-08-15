"use client";

import type { ChatMessage } from "@/entities/message";
import type { Nullable } from "@/shared/lib";
import { OFFLINE_MESSAGE_LIMIT, useWriteSnapshot } from "@/shared/snapshot";
import { useMemo } from "react";
import type { ChatSnapshot } from "./types";

/**
 * Keeps the `chat` snapshot level with the room's newest page.
 *
 * WARN: REQUIREMENTS.md § 8.6.1. Nothing is stored while the window sits around a jump target — that view is mid-history, and writing it hands the mirror an old transcript presented as the newest.
 */
export function useWriteChatSnapshot(messages: ChatMessage[], hasNewer: boolean): void {
  // WARN: The window runs oldest-first, so its newest page is the tail — the shelves below cap the opposite end.
  const snapshot = useMemo<Nullable<ChatSnapshot>>(
    () => (hasNewer ? null : { messages: messages.slice(-OFFLINE_MESSAGE_LIMIT) }),
    [messages, hasNewer],
  );

  useWriteSnapshot("chat", snapshot);
}
