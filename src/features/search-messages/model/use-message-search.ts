"use client";

import type { MessageSearchResult } from "@/entities/message";
import { SEARCH_PAGE_SIZE } from "@/shared/config";
import { A_SECOND, type MessageId, type Nullable } from "@/shared/lib";
import { toast } from "@/shared/ui";
import { useCallback, useEffect, useRef, useState } from "react";
import { fetchMessageSearch } from "../api/fetch-message-search";

// INFO: Longer than the emoticon picker's 200ms because one scan is an `ILIKE` over the whole conversation plus a `count()` that cannot be `LIMIT`ed, and a Hangul field settles a syllable jamo by jamo.
const SEARCH_DEBOUNCE = A_SECOND / 2;

/**
 * The message the room is being asked to move to. The token is what makes a
 * repeat of the same id a new instruction — re-picking the row the room is
 * already parked on has to re-run the jump (and so re-centre it) rather than
 * resolve to no change at all.
 */
export type SearchJumpTarget = {
  token: number;
  id: MessageId;
};

export type MessageSearch = ReturnType<typeof useMessageSearch>;

/**
 * The query side of REQUIREMENTS.md § 8.6. — the field, the result page, and
 * which hit the room is parked on. The jump itself belongs to the room
 * (§ 8.6.1.); this only ever names a target.
 */
export function useMessageSearch(hideOthers = false) {
  const [isOpen, setIsOpen] = useState(false);
  const [isListOpen, setIsListOpen] = useState(false);
  const [query, setQuery] = useState("");
  // INFO: The string the results actually describe, which is not the field's while it is being edited. The bubbles' marks and the row highlight both read this, or a half-typed word would light up matches nobody has asked for yet.
  const [submitted, setSubmitted] = useState("");
  const [results, setResults] = useState<MessageSearchResult[]>([]);
  const [total, setTotal] = useState(0);
  const [hasMore, setHasMore] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [isLoadingMore, setIsLoadingMore] = useState(false);
  // INFO: Null until a page lands — a query with no answer yet is not the same as a query parked on its first hit, and the counter has to tell them apart.
  const [activeIndex, setActiveIndex] = useState<Nullable<number>>(null);
  const [target, setTarget] = useState<Nullable<SearchJumpTarget>>(null);
  // WARN: Every fetch carries one, and only the newest may write. Typing 저녁 fires a page per debounce window, and a slow early one landing last would leave the field showing 저녁 over the results for 저.
  const requestId = useRef(0);
  const tokenRef = useRef(0);
  const resultsRef = useRef<MessageSearchResult[]>([]);

  const jumpToIndex = useCallback((index: number, hits: MessageSearchResult[]) => {
    const hit = hits[index];

    if (!hit) {
      return;
    }

    tokenRef.current += 1;
    setActiveIndex(index);
    setTarget({ id: hit.id, token: tokenRef.current });
  }, []);

  /** Moves the room to an id outside the result set — the § 8.19. bookmark list's own jump. */
  const jumpTo = useCallback((id: MessageId) => {
    tokenRef.current += 1;
    setTarget({ id, token: tokenRef.current });
  }, []);

  const reset = useCallback(() => {
    requestId.current += 1;
    resultsRef.current = [];
    setResults([]);
    setTotal(0);
    setHasMore(false);
    setActiveIndex(null);
    setTarget(null);
    setIsLoading(false);
    setIsLoadingMore(false);
  }, []);

  const open = useCallback(() => setIsOpen(true), []);

  const close = useCallback(() => {
    setIsOpen(false);
    setIsListOpen(false);
    setQuery("");
    setSubmitted("");
    reset();
  }, [reset]);

  // INFO: Emptying the field is the one edit that changes anything on its own — it takes the results, the marks in the bubbles and the counter away, because there is no longer a query for any of them to be about.
  const changeQuery = useCallback(
    (value: string) => {
      setQuery(value);

      if (value.trim().length === 0) {
        setSubmitted("");
        reset();
      }
    },
    [reset],
  );

  /** The next page of hits, behind the same keyset cursor § 8.2. pages history on. */
  const loadMore = useCallback(async () => {
    const oldest = resultsRef.current.at(-1);

    if (!hasMore || isLoadingMore || isLoading || !oldest) {
      return false;
    }

    setIsLoadingMore(true);

    const generation = requestId.current;

    try {
      const page = await fetchMessageSearch({ query: submitted, before: oldest.id, hideOthers });

      // WARN: Dropped whole if the query moved on. Appending it would splice hits for the previous string into the list under the new one, and the counter would then describe neither.
      if (generation !== requestId.current) {
        return false;
      }

      resultsRef.current = [...resultsRef.current, ...page.results];
      setResults(resultsRef.current);
      setHasMore(page.results.length >= SEARCH_PAGE_SIZE);

      return page.results.length > 0;
    } catch {
      if (generation === requestId.current) {
        toast.error("검색 결과를 더 불러오지 못했어요");
      }

      return false;
    } finally {
      if (generation === requestId.current) {
        setIsLoadingMore(false);
      }
    }
  }, [hasMore, isLoadingMore, isLoading, submitted]);

  /**
   * WARN: Deferred out of the tap's own task, and `DESIGN.md § 7.15.3.` is the whole
   * reason. Closed synchronously, the row's `keepsScroll` overlay is detached before
   * the click it is answering reaches its default action, and a detached `<label>`
   * has no labelled control left to activate — every result tap was silent.
   *
   * WARN: A task, never a microtask. A microtask checkpoint runs whenever the script
   * stack empties, which is after **each listener** rather than after the dispatch —
   * so `queueMicrotask` still lands ahead of the activation behaviour that ticks.
   */
  const select = useCallback(
    (index: number) => {
      // INFO: AGENTS.md § 8.1. No delay argument at all rather than a bare `0` — the point is the next task, not a duration.
      setTimeout(() => {
        setIsListOpen(false);
        jumpToIndex(index, resultsRef.current);
      });
    },
    [jumpToIndex],
  );

  /**
   * INFO: Results are newest-first, and the conversation runs oldest to newest
   * down the screen — so `∧` is the older hit and `∨` the newer one, and the
   * arrow points the way the room is about to move.
   */
  const goOlder = useCallback(async () => {
    const next = (activeIndex ?? -1) + 1;

    if (next < resultsRef.current.length) {
      jumpToIndex(next, resultsRef.current);

      return;
    }

    if (await loadMore()) {
      jumpToIndex(next, resultsRef.current);
    }
  }, [activeIndex, jumpToIndex, loadMore]);

  const goNewer = useCallback(() => {
    if (activeIndex !== null && activeIndex > 0) {
      jumpToIndex(activeIndex - 1, resultsRef.current);
    }
  }, [activeIndex, jumpToIndex]);

  /** REQUIREMENTS.md § 8.6. One scan per asked-for query. */
  const scan = useCallback(
    async (trimmed: string, jumps: boolean) => {
      const generation = (requestId.current += 1);

      setIsLoading(true);

      try {
        const page = await fetchMessageSearch({ query: trimmed, hideOthers });

        if (generation !== requestId.current) {
          return;
        }

        // WARN: `submitted` commits here, with the page, and never before the fetch. Written ahead of it, a scan that then failed would leave the previous query's results, total and active index standing under a `submitted` naming the new one — the bubbles marking one string while the arrows stepped another, `loadMore` paging the new query onto the old list, and the re-submit shortcut below stepping the stale hits instead of retrying.
        setSubmitted(trimmed);
        resultsRef.current = page.results;
        setResults(page.results);
        setTotal(page.total ?? page.results.length);
        setHasMore(page.results.length >= SEARCH_PAGE_SIZE);
        setIsLoading(false);

        if (jumps) {
          // INFO: The newest hit is taken as soon as the page lands, so the counter reads `1/12` and the arrows have somewhere to step from without the user picking a row first.
          jumpToIndex(0, page.results);
        }
      } catch {
        if (generation === requestId.current) {
          setIsLoading(false);
          toast.error("검색하지 못했어요");
        }
      }
    },
    [hideOthers, jumpToIndex],
  );

  // INFO: REQUIREMENTS.md § 8.6. The typed-ahead scan, and it never jumps — the room would then scroll to a different message on every debounce window, under a reader still typing.
  useEffect(() => {
    const trimmed = query.trim();

    if (trimmed.length === 0 || trimmed === submitted) {
      return;
    }

    const timer = setTimeout(() => void scan(trimmed, false), SEARCH_DEBOUNCE);

    return () => clearTimeout(timer);
  }, [query, submitted, scan]);

  /**
   * REQUIREMENTS.md § 8.6. The search key, which is what moves the room — the
   * scan itself has usually already run behind the effect above, so this is the
   * step-to-the-next-hit gesture far more often than it is a fetch.
   */
  const submit = useCallback(async () => {
    const trimmed = query.trim();

    if (trimmed.length === 0) {
      return;
    }

    // INFO: Asking again for the string already on screen is the find-in-page gesture, so it steps to the next hit rather than re-running a scan whose answer is already in hand.
    if (trimmed === submitted && resultsRef.current.length > 0) {
      void goOlder();

      return;
    }

    await scan(trimmed, true);
  }, [query, submitted, goOlder, scan]);

  return {
    isOpen,
    isListOpen,
    query,
    submitted,
    results,
    total,
    hasMore,
    isLoading,
    isLoadingMore,
    activeIndex,
    target,
    hasNoResults: submitted.length > 0 && total === 0,
    // INFO: The older end is only known to be reached once paging has run out, so the arrow stays live while another page could still answer it.
    // WARN: `results.length > 0` first. Without it the arrow is live on a search that has not run — `activeIndex` is null before the first page, and a control that ticks the Taptic engine and then does nothing reads as broken.
    hasOlder:
      results.length > 0 && (activeIndex === null || activeIndex + 1 < results.length || hasMore),
    hasNewer: activeIndex !== null && activeIndex > 0,
    // INFO: An empty field has nothing to ask for. Re-submitting the string already on screen is allowed and steps to the next hit — that decision lives in `submit`, not in whether the control is offered.
    canSubmit: query.trim().length > 0,
    open,
    close,
    submit,
    setQuery: changeQuery,
    openList: useCallback(() => {
      if (document.activeElement instanceof HTMLElement) {
        document.activeElement.blur();
      }
      setIsListOpen(true);
    }, []),
    closeList: useCallback(() => setIsListOpen(false), []),
    loadMore,
    select,
    goOlder,
    goNewer,
    jumpTo,
  };
}
