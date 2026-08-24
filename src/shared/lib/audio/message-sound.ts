"use client";

import { useCallback, useEffect } from "react";
import { useStorageState } from "synced-storage/react";
import { playSound, warmSound } from "./sound";

export type MessageSoundKind = "sent" | "received";

const STORAGE_KEY = "jandh:message-sound";

const SOURCES: Record<MessageSoundKind, string> = {
  sent: "/sounds/message-sent.wav",
  received: "/sounds/message-received.wav",
};

/**
 * REQUIREMENTS.md § 13.6. The 전송음 — a soft sweep on a send and on a live
 * arrival, per device and on by default, through the same shared player an
 * emoticon sounds on and always yielding to it.
 */
export function useMessageSound() {
  const [isEnabled, setEnabled] = useStorageState<boolean>(STORAGE_KEY, true, {
    strategy: "localStorage",
  });

  useEffect(() => {
    if (isEnabled) {
      // INFO: § 13.6. The shared player's own cache, which an emoticon's sound uses too — these two are simply the pair that is warmed before anything has asked for them.
      Object.values(SOURCES).forEach(warmSound);
    }
  }, [isEnabled]);

  const play = useCallback(
    (kind: MessageSoundKind) => {
      // INFO: A room in a background tab is already announced by § 16.1.'s push, and its own sound would double it.
      if (!isEnabled || document.visibilityState !== "visible") {
        return;
      }

      // INFO: § 13.6. `"secondary"` — a 전송음 covers a message with no sound of its own, so a send during an emoticon's sound stays silent rather than cutting it short.
      playSound(SOURCES[kind], { priority: "secondary" });
    },
    [isEnabled],
  );

  return { isEnabled, setEnabled, play };
}
