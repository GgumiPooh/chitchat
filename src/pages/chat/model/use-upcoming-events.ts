"use client";

import type { CalendarSummary, EventOccurrence } from "@/entities/event";
import { fetchCalendarSummary } from "@/features/manage-event";
import {
  MAX_UPCOMING_EVENTS,
  SSE_SYNC_COALESCE_WINDOW,
  UPCOMING_EVENTS_CEILING,
} from "@/shared/config";
import { A_DAY, type Nullable } from "@/shared/lib";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

export type UpcomingEvents = {
  occurrences: EventOccurrence[];
  todayKey: string;
  /** REQUIREMENTS.md § 11.5.1. Something starts within the day, which is what the header's bloom is saying. */
  isSoon: boolean;
  hasMore: boolean;
  isLoadingMore: boolean;
  /** Widens the page by another `MAX_UPCOMING_EVENTS`, up to `UPCOMING_EVENTS_CEILING`. */
  loadMore: () => void;
  /** Refetches now, past the coalescing window — for a write this screen made itself. */
  reload: () => void;
};

/**
 * REQUIREMENTS.md § 11.5.1. 채팅's copy of 다가오는 일정 — the server render's, kept
 * current on the same `focus` / `visibilitychange` pair § 11.1. refreshes the D-day
 * band on, and coalesced across them for the same reason.
 *
 * WARN: Every request asks for **one past** what the panel draws, and the extra row is
 * sliced off here. It is the only thing that can answer whether a 더 보기 exists — a
 * page returning exactly what it asked for says nothing about what is behind it.
 */
export function useUpcomingEvents(initialSummary: CalendarSummary): UpcomingEvents {
  const [summary, setSummary] = useState(initialSummary);
  const [limit, setLimit] = useState(MAX_UPCOMING_EVENTS);
  const [isLoadingMore, setIsLoadingMore] = useState(false);
  // WARN: `0` and never `Date.now()`. The clock is read in an effect so the server's HTML and the first client render agree — seeded here, the two disagree about the bloom whenever a hydration straddles the boundary.
  const [now, setNow] = useState(0);
  const lastFetchAt = useRef(0);
  const loadedLimit = useRef(MAX_UPCOMING_EVENTS);

  const load = useCallback(async (nextLimit: number) => {
    lastFetchAt.current = Date.now();
    setNow(lastFetchAt.current);

    try {
      setSummary(await fetchCalendarSummary(nextLimit + 1));
      loadedLimit.current = nextLimit;
    } catch {
      // INFO: Silent. The panel is a glance at data it is already showing a page of, and a toast over the conversation costs more than the stale row does.
    }
  }, []);

  const reload = useCallback(() => void load(limit), [load, limit]);

  const refresh = useCallback(() => {
    if (document.visibilityState !== "visible") {
      return;
    }

    if (Date.now() - lastFetchAt.current < SSE_SYNC_COALESCE_WINDOW) {
      return;
    }

    reload();
  }, [reload]);

  useEffect(() => {
    document.addEventListener("visibilitychange", refresh);
    window.addEventListener("focus", refresh);

    return () => {
      document.removeEventListener("visibilitychange", refresh);
      window.removeEventListener("focus", refresh);
    };
  }, [refresh]);

  // WARN: The mount is skipped through `loadedLimit`, because the server render already answered for the first page — without it opening 채팅 spends a request re-fetching what the HTML came with.
  useEffect(() => {
    if (limit === loadedLimit.current) {
      return;
    }

    void load(limit).finally(() => setIsLoadingMore(false));
  }, [limit, load]);

  // INFO: The instant the nearest event crosses into the last day before it starts. One already under way is behind it, which is what puts a `진행 중` row in the bloom too.
  const bloomAt = useMemo<Nullable<number>>(() => {
    const instants = summary.upcoming.map(({ startsAt }) => Date.parse(startsAt) - A_DAY);

    return instants.length === 0 ? null : Math.min(...instants);
  }, [summary.upcoming]);

  // INFO: A crossing already behind us schedules a `0` timer, so the first reading of the clock and every later one arrive by the same path — which is also why `now` can be seeded outside the render.
  // WARN: Only a crossing inside the next day is scheduled. `upcoming` reaches a year ahead, and a `setTimeout` past 2³¹ ms wraps and fires immediately — which here is a timer that re-arms itself every frame. Anything further out is the refresh above's to notice.
  useEffect(() => {
    if (bloomAt === null || bloomAt - Date.now() > A_DAY) {
      return;
    }

    const timer = setTimeout(() => setNow(Date.now()), Math.max(bloomAt - Date.now(), 0));

    return () => clearTimeout(timer);
  }, [bloomAt]);

  return {
    occurrences: summary.upcoming.slice(0, limit),
    todayKey: summary.todayKey,
    isSoon: bloomAt !== null && now >= bloomAt,
    // WARN: `isLoadingMore` holds it on screen. `limit` steps the instant 더 보기 is pressed and the page it asks for lands a round trip later, so the summary in hand is briefly one page short — read without this the button blinks out under the finger and comes back.
    hasMore: isLoadingMore || (limit < UPCOMING_EVENTS_CEILING && summary.upcoming.length > limit),
    isLoadingMore,
    // WARN: The flag is raised **here** and not in the effect that follows, so it batches with the step. Set a commit later, the render in between has a stepped `limit` under a summary that has not caught up, which is exactly the blink `hasMore` above guards against.
    loadMore: () => {
      setIsLoadingMore(true);
      setLimit((current) => current + MAX_UPCOMING_EVENTS);
    },
    reload,
  };
}
