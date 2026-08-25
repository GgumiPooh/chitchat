"use client";

import type { ChatMessage } from "@/entities/message";
import { compareId, maxId, type MessageId } from "@/shared/lib";
import { startTransition, useCallback, useEffect, useMemo, useRef, useState } from "react";

// INFO: REQUIREMENTS.md § 8.5. Opens the KakaoTalk-style forward-select on the newest span rather than nothing.
const AUTO_SELECT_COUNT = 30;

export type AiSelectionState = {
  /** Whether AI 질문 모드 is active at all — false is the room's ordinary state. */
  isSelecting: boolean;
  selected: Set<MessageId>;
  /** Opens the mode and applies `autoSelect`'s newest-30 rule. */
  enter: () => void;
  /** Closes the mode and drops every selection. */
  exit: () => void;
  toggle: (id: MessageId) => void;
  clearAll: () => void;
  /** Reapplies the newest-30 rule, replacing whatever is currently selected. */
  autoSelect: () => void;
};

/**
 * REQUIREMENTS.md § 8.5. What the composer's AI toggle drives — which settled
 * messages ride along as an AI question's context.
 *
 * WARN: A message enters `toAutoSelected` only by `id`, which is why a pending
 * (optimistic) row can never appear here — it has none yet.
 */
export function useAiSelection(messages: ChatMessage[]): AiSelectionState {
  const [isSelecting, setIsSelecting] = useState(false);
  const [selected, setSelected] = useState<Set<MessageId>>(new Set());
  // INFO: § 8.5. The mark arrivals are read against — "0" is § 8.4.'s own "from the start" sentinel, for a mode entered on an empty room.
  const entryMaxIdRef = useRef<MessageId>("0" as MessageId);
  // INFO: § 8.5. An id considered once stays considered even after a manual uncheck, so `toggle`'s undo is not fought by the very next render.
  const consideredArrivalIdsRef = useRef<Set<MessageId>>(new Set());

  // INFO: REQUIREMENTS.md § 8.3., § 8.5. `startTransition` so the tap that opens/closes the mode is not held behind the row it resizes — every mounted row's estimate shifts by `SELECTION_GUTTER_WIDTH` (`chat-room.tsx`), which React would otherwise paint synchronously with the toggle's own feedback.
  const enter = useCallback(() => {
    entryMaxIdRef.current = messages.reduce(
      (newest, message) => maxId(newest, message.id),
      "0" as MessageId,
    );
    consideredArrivalIdsRef.current = new Set();
    startTransition(() => {
      setIsSelecting(true);
      setSelected(new Set(toAutoSelected(messages)));
    });
  }, [messages]);

  const exit = useCallback(() => {
    startTransition(() => {
      setIsSelecting(false);
      setSelected(new Set());
    });
  }, []);

  /**
   * REQUIREMENTS.md § 8.5. A message that lands after the mode was entered joins
   * the selection on its own — the same eligibility `toAutoSelected` applies, but
   * with no 30-message cap, since an arrival is news rather than backfill.
   */
  useEffect(() => {
    if (!isSelecting) {
      return;
    }

    const arrived = messages.filter(
      (message) =>
        compareId(message.id, entryMaxIdRef.current) > 0 &&
        !consideredArrivalIdsRef.current.has(message.id) &&
        isAutoSelectEligible(message),
    );

    if (arrived.length === 0) {
      return;
    }

    arrived.forEach((message) => consideredArrivalIdsRef.current.add(message.id));
    setSelected((current) => new Set([...current, ...arrived.map((message) => message.id)]));
  }, [isSelecting, messages]);

  const toggle = useCallback((id: MessageId) => {
    setSelected((current) => {
      const next = new Set(current);

      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }

      return next;
    });
  }, []);

  const clearAll = useCallback(() => setSelected(new Set()), []);

  const autoSelect = useCallback(() => {
    setSelected(new Set(toAutoSelected(messages)));
  }, [messages]);

  return useMemo(
    () => ({ isSelecting, selected, enter, exit, toggle, clearAll, autoSelect }),
    [isSelecting, selected, enter, exit, toggle, clearAll, autoSelect],
  );
}

/**
 * REQUIREMENTS.md § 8.5. The newest 30 of `text` messages and finished AI answers,
 * skipping withdrawn ones — media, emoticon and other system rows are never in this
 * set, though `toggle` still reaches them by hand.
 */
function toAutoSelected(messages: ChatMessage[]): MessageId[] {
  return messages
    .filter(isAutoSelectEligible)
    .slice(-AUTO_SELECT_COUNT)
    .map((message) => message.id);
}

/** @see toAutoSelected */
function isAutoSelectEligible(message: ChatMessage): boolean {
  return (
    !message.isDeleted &&
    (message.type === "text" ||
      (message.type === "system" && message.systemAction === "assistant_reply"))
  );
}

/** @see AiSelectionState */
export function isSelectableMessage(message: ChatMessage): boolean {
  return !message.isDeleted;
}
