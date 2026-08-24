"use client";

import type { EventOccurrence } from "@/entities/event";
import { A_DAY, type UserId } from "@/shared/lib";
import { useCallback, useEffect, useRef, useState } from "react";
import { isForReader } from "./is-for-reader";

const STORAGE_KEY = "jandh:chat-imminent-dismissed";

export type ImminentPanel = {
  /** Whether 다가오는 일정 should already be open on arrival. */
  isPrompted: boolean;
  /** Records what is imminent right now as seen, so the next arrival stays closed. */
  dismiss: () => void;
};

/**
 * REQUIREMENTS.md § 11.5.1. Arriving in 채팅 with something starting inside the day
 * opens the panel for you — once. The dismissal is keyed by **which** occurrences were
 * imminent, so one of them passing leaves it dismissed and a new one arriving does not.
 *
 * WARN: The decision is made from the arrival's own snapshot and never re-made. A
 * reader already in the room does not get the panel thrown over their conversation
 * because an event crossed the line while they were typing.
 */
export function useImminentPanel(
  occurrences: EventOccurrence[],
  currentUserId: UserId,
): ImminentPanel {
  // INFO: The list as it stood on arrival, which is what the rule is written against — later refreshes must not re-open anything.
  const [entryOccurrences] = useState(occurrences);
  const [isPrompted, setIsPrompted] = useState(false);
  const latest = useRef(occurrences);

  useEffect(() => {
    latest.current = occurrences;
  }, [occurrences]);

  useEffect(() => {
    // WARN: In a frame rather than in the effect body, which is the pattern `AppHeader` already reads the scroll position through — the clock and `localStorage` are client-only reads and neither may decide the markup the server sent.
    const frame = requestAnimationFrame(() => {
      const imminent = toImminentKeys(entryOccurrences, Date.now(), currentUserId);
      const dismissed = readDismissed();

      if (imminent.some((key) => !dismissed.has(key))) {
        setIsPrompted(true);
      }
    });

    return () => cancelAnimationFrame(frame);
  }, [entryOccurrences, currentUserId]);

  const dismiss = useCallback(() => {
    // INFO: Assignment and not a union — the record prunes itself to what is still imminent, and anything dropped could not re-open the panel anyway.
    writeDismissed(toImminentKeys(latest.current, Date.now(), currentUserId));
    setIsPrompted(false);
  }, [currentUserId]);

  return { isPrompted, dismiss };
}

// INFO: The same window the header's bloom uses — one already under way is behind it, and counts.
function toImminentKeys(
  occurrences: EventOccurrence[],
  now: number,
  currentUserId: UserId,
): string[] {
  return occurrences
    .filter((occurrence) => isForReader(occurrence, currentUserId))
    .filter(({ startsAt }) => Date.parse(startsAt) - now <= A_DAY)
    .map(({ event, startsAt }) => event.id + startsAt);
}

function readDismissed(): Set<string> {
  try {
    const stored: unknown = JSON.parse(window.localStorage.getItem(STORAGE_KEY) ?? "[]");

    return new Set(Array.isArray(stored) ? stored.filter((key) => typeof key === "string") : []);
  } catch {
    // INFO: A private window refuses `localStorage` outright, and a hand-edited value parses to anything — either way nothing was dismissed.
    return new Set();
  }
}

function writeDismissed(keys: string[]): void {
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(keys));
  } catch {
    // INFO: Storage refused; the panel simply opens again next time.
  }
}
