"use client";

import type { ChatMessage } from "@/entities/message";
import type { Nullable } from "@/shared/lib";
import { OFFLINE_MESSAGE_LIMIT, useSnapshotOwner, useWriteSnapshot } from "@/shared/snapshot";
import { useMemo } from "react";
import type { ChatSnapshot } from "./types";

/**
 * Keeps the `chat`/`chat-only-me` snapshot level with the room's newest page.
 *
 * WARN: REQUIREMENTS.md § 8.6.1. Nothing is stored while the window sits around a jump target — that view is mid-history, and writing it hands the mirror an old transcript presented as the newest.
 * WARN: REQUIREMENTS.md § 16.2. `isOnlyMe` names which window `messages` holds, and must come from `useMessageHistory`'s own `activeFilterMode` rather than the notify-mode cookie — the two disagree for as long as a mode switch's reload is in flight, and writing against the cookie would file the old mode's window under the new mode's key.
 */
export function useWriteChatSnapshot(
  messages: ChatMessage[],
  hasNewer: boolean,
  isOnlyMe: boolean,
): void {
  const owner = useSnapshotOwner();
  // WARN: The window runs oldest-first, so its newest page is the tail — the shelves below cap the opposite end.
  const snapshot = useMemo<Nullable<ChatSnapshot>>(() => {
    if (hasNewer) {
      return null;
    }

    return { messages: messages.slice(-OFFLINE_MESSAGE_LIMIT) };
  }, [messages, hasNewer]);

  useWriteSnapshot(owner, isOnlyMe ? "chat-only-me" : "chat", snapshot);
}
