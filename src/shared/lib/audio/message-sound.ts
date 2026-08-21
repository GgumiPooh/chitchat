"use client";

import { useCallback, useEffect } from "react";
import { useStorageState } from "synced-storage/react";
import { playSound } from "./sound";

export type MessageSoundKind = "sent" | "received";

const STORAGE_KEY = "jandh:message-sound";

const SOURCES: Record<MessageSoundKind, string> = {
  sent: "/sounds/message-sent.wav",
  received: "/sounds/message-received.wav",
};

// INFO: The shared element refetches on every `src` assignment, so each file is read once into an object URL and every play after that touches no network.
const objectUrls: Partial<Record<MessageSoundKind, string>> = {};

let isWarming = false;

function warm(): void {
  if (isWarming) {
    return;
  }

  isWarming = true;

  for (const kind of Object.keys(SOURCES) as MessageSoundKind[]) {
    void fetch(SOURCES[kind])
      .then((response) => (response.ok ? response.blob() : null))
      .then((blob) => {
        if (blob) {
          objectUrls[kind] = URL.createObjectURL(blob);
        }
      })
      .catch(() => undefined);
  }
}

/**
 * REQUIREMENTS.md § 13.6. The 전송음 — a soft sweep on a send and on a live
 * arrival, per device and on by default, through the same shared player an
 * emoticon sounds on.
 */
export function useMessageSound() {
  const [isEnabled, setEnabled] = useStorageState<boolean>(STORAGE_KEY, true, {
    strategy: "localStorage",
  });

  useEffect(() => {
    if (isEnabled) {
      warm();
    }
  }, [isEnabled]);

  const play = useCallback(
    (kind: MessageSoundKind) => {
      // INFO: A room in a background tab is already announced by § 16.1.'s push, and its own sound would double it.
      if (!isEnabled || document.visibilityState !== "visible") {
        return;
      }

      playSound(objectUrls[kind] ?? SOURCES[kind]);
    },
    [isEnabled],
  );

  return { isEnabled, setEnabled, play };
}
