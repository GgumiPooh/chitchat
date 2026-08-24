"use client";

import { EMOTICON_PLAYBACK_HOLD, type Nullable } from "@/shared/lib";
import { useCallback, useEffect, useRef, useState } from "react";
import { playEmoticonSound, type EmoticonSound } from "./play-emoticon-sound";

/**
 * REQUIREMENTS.md § 13.6. An arriving emoticon that carries a sound — a live one from
 * the other side, or my own send's optimistic row — flagged so its bubble plays the
 * picture and the sound together on mount.
 *
 * INFO: The decision stays here rather than moving into `EmoticonBubble` — that
 * component draws every emoticon in the room, including the ones a scroll passes,
 * and only the room can tell an arrival from a row. What it is handed is one flag
 * for one row, keyed by `messages.id` or by the pending row's `client_msg_id`.
 *
 * WARN: The timer is for a row that never mounts. A bubble that did takes the
 * playback over and settles this at once, so a sound is never played from both sides.
 *
 * WARN: The pending row is held in state **and** in a ref. The state is what the
 * bubble reads; the ref is what the callbacks resolve against, since a row that
 * unmounts and remounts (the virtualizer, on a scroll away and back) would otherwise
 * sound a second time off a flag nothing had taken down.
 */
export function useArrivalEmoticonSound() {
  const [pendingId, setPendingId] = useState<Nullable<string>>(null);
  const pendingRef = useRef<Nullable<{ emoticon: EmoticonSound; id: string }>>(null);
  const timerRef = useRef<Nullable<ReturnType<typeof setTimeout>>>(null);

  const settle = useCallback((id: string, { sounds = false } = {}) => {
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

    if (sounds) {
      playEmoticonSound(pending.emoticon);
    }
  }, []);

  /**
   * WARN: Sounds the row it replaces rather than dropping it. Two emoticons arriving
   * inside the hold is the case, and the shared player cuts the first off either way
   * (§ 13.6.) — but a pending row simply overwritten would have gone silent *and*
   * stayed held until its own timer, which is the one outcome nothing asked for.
   */
  const announce = useCallback(
    (id: string, emoticon: EmoticonSound) => {
      if (pendingRef.current) {
        settle(pendingRef.current.id, { sounds: true });
      }

      pendingRef.current = { id, emoticon };
      setPendingId(id);
      timerRef.current = setTimeout(() => settle(id, { sounds: true }), EMOTICON_PLAYBACK_HOLD);
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
