"use client";

import type { ChatMessage } from "@/entities/message";
import type { InlineEmoticonMap } from "@/shared/config";
import type { Nullable } from "@/shared/lib";
import { OFFLINE_MESSAGE_LIMIT, useSnapshotOwner, useWriteSnapshot } from "@/shared/snapshot";
import { useMemo } from "react";
import type { ChatSnapshot } from "./types";

/**
 * Keeps the `chat` snapshot level with the room's newest page.
 *
 * WARN: REQUIREMENTS.md § 8.6.1. Nothing is stored while the window sits around a jump target — that view is mid-history, and writing it hands the mirror an old transcript presented as the newest.
 */
export function useWriteChatSnapshot(
  messages: ChatMessage[],
  emoticons: InlineEmoticonMap,
  hasNewer: boolean,
): void {
  const owner = useSnapshotOwner();
  // WARN: The window runs oldest-first, so its newest page is the tail — the shelves below cap the opposite end.
  const snapshot = useMemo<Nullable<ChatSnapshot>>(() => {
    if (hasNewer) {
      return null;
    }

    const stored = messages.slice(-OFFLINE_MESSAGE_LIMIT);

    return { messages: stored, emoticons: toStoredEmoticons(stored, emoticons) };
  }, [messages, emoticons, hasNewer]);

  useWriteSnapshot(owner, "chat", snapshot);
}

/**
 * REQUIREMENTS.md § 13. The entries the stored transcript actually names.
 *
 * WARN: Narrowed rather than stored whole, and both halves of the reason matter. The
 * live map accumulates every page, § 13.9. reveal and search result the session has
 * touched, where this holds the newest `OFFLINE_MESSAGE_LIMIT` messages; and a payload
 * carrying entries no stored message names would defeat `useWriteSnapshot`'s deep-equal
 * guard, rewriting the whole transcript every time the reader scrolled past an emoticon
 * they had not seen before.
 */
function toStoredEmoticons(
  messages: readonly ChatMessage[],
  emoticons: InlineEmoticonMap,
): InlineEmoticonMap {
  const stored: InlineEmoticonMap = {};

  for (const message of messages) {
    for (const itemId of message.inlineEmoticonItemIds) {
      const info = emoticons[itemId];

      if (info) {
        stored[itemId] = info;
      }
    }
  }

  return stored;
}
