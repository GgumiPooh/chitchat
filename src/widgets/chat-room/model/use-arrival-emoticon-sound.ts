"use client";

import { A_SECOND, type MessageId, type Nullable } from "@/shared/lib";
import { useCallback, useEffect, useRef, useState } from "react";
import { playEmoticonSound, type EmoticonSound } from "./play-emoticon-sound";

/**
 * How long a picture may be held back waiting for its sound.
 *
 * WARN: REQUIREMENTS.md § 13.6. This is what keeps a message visible. Past it the
 * sound is played on its own and the row is released — an emoticon that cannot be
 * heard is a sound nobody notices, where one that cannot be *seen* is the message
 * missing from the conversation.
 */
const ARRIVAL_SOUND_HOLD = A_SECOND;

/**
 * REQUIREMENTS.md § 13.6. The live arrival of an emoticon that carries a sound,
 * held until its bubble has the picture on screen so the two land together.
 *
 * INFO: The decision stays here rather than moving into `EmoticonBubble` — that
 * component draws every emoticon in the room, including the ones a scroll passes,
 * and only the room can tell an arrival from a row. What it is handed is one flag
 * for one row.
 *
 * WARN: The pending row is held in state **and** in a ref. The state is what the
 * bubble reads; the ref is what the callbacks resolve against, since a row that
 * unmounts and remounts (the virtualizer, on a scroll away and back) would otherwise
 * sound a second time off a flag nothing had taken down.
 */
export function useArrivalEmoticonSound() {
  const [pendingId, setPendingId] = useState<Nullable<MessageId>>(null);
  const pendingRef = useRef<Nullable<{ emoticon: EmoticonSound; id: MessageId }>>(null);
  const timerRef = useRef<Nullable<ReturnType<typeof setTimeout>>>(null);

  const settle = useCallback((id: MessageId) => {
    const pending = pendingRef.current;

    if (!pending || pending.id !== id) {
      return;
    }

    pendingRef.current = null;
    setPendingId(null);

    if (timerRef.current) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }

    playEmoticonSound(pending.emoticon);
  }, []);

  /**
   * WARN: Sounds the row it replaces rather than dropping it. Two emoticons arriving
   * inside the hold is the case, and the shared player cuts the first off either way
   * (§ 13.6.) — but a pending row simply overwritten would have gone silent *and*
   * stayed held until its own timer, which is the one outcome nothing asked for.
   */
  const announce = useCallback(
    (id: MessageId, emoticon: EmoticonSound) => {
      if (pendingRef.current) {
        settle(pendingRef.current.id);
      }

      pendingRef.current = { id, emoticon };
      setPendingId(id);
      timerRef.current = setTimeout(() => settle(id), ARRIVAL_SOUND_HOLD);
    },
    [settle],
  );

  useEffect(
    () => () => {
      if (timerRef.current) {
        clearTimeout(timerRef.current);
      }
    },
    [],
  );

  return { pendingId, announce, settle };
}
