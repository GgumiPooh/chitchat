"use client";

import type { ChatMessage, MessageSearchResult } from "@/entities/message";
import { toPlainMessageText } from "@/shared/config";
import { A_SECOND, compareId, toSearchExcerpt, type MessageId, type Nullable } from "@/shared/lib";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

// INFO: REQUIREMENTS.md § 8.6.'s own debounce — the scan here is a synchronous filter over an array already in memory, but the field still settles a Hangul syllable jamo by jamo.
const SEARCH_DEBOUNCE = A_SECOND / 2;

export type MirrorSearchJumpTarget = {
  token: number;
  id: MessageId;
};

export type MirrorMessageSearch = ReturnType<typeof useMirrorMessageSearch>;

const noop = () => {};

/**
 * REQUIREMENTS.md § 8.6.'s search over the § 16.2. snapshot rather than a server
 * round trip — the whole conversation the mirror holds is already in memory, so
 * this filters one array instead of paging `entities/message`'s `searchMessages`.
 *
 * INFO: Returns the same field shape `useMessageSearch` does, so `MirrorChat` can
 * drive the live `MessageSearchBar` / `MessageSearchNav` / `MessageSearchResultList`
 * components unchanged.
 */
export function useMirrorMessageSearch(messages: ChatMessage[]) {
  const [isOpen, setIsOpen] = useState(false);
  const [isListOpen, setIsListOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [submitted, setSubmitted] = useState("");
  const [activeIndex, setActiveIndex] = useState<Nullable<number>>(null);
  const [target, setTarget] = useState<Nullable<MirrorSearchJumpTarget>>(null);
  const tokenRef = useRef(0);
  // WARN: Set only by an explicit submit, never by the typed-ahead scan below — the same split `useMessageSearch`'s `scan(trimmed, jumps)` makes, or the room would jump to a different message on every debounce window while the reader is still typing.
  const jumpsRef = useRef(false);

  // INFO: Newest-first, matching REQUIREMENTS.md § 8.6.'s `ORDER BY id DESC` — the snapshot's own `messages` run oldest to newest.
  const results = useMemo<MessageSearchResult[]>(() => {
    const trimmed = submitted.trim();

    if (trimmed.length === 0) {
      return [];
    }

    const needle = trimmed.toLowerCase();

    return messages
      .filter((message) => message.type === "text" && !message.isDeleted)
      .flatMap((message) => {
        const plain = toPlainMessageText(message.text ?? "");

        return plain.toLowerCase().includes(needle)
          ? [
              {
                id: message.id,
                senderId: message.senderId,
                createdAt: message.createdAt,
                excerpt: toSearchExcerpt(plain, trimmed),
              },
            ]
          : [];
      })
      .sort((a, b) => compareId(b.id, a.id));
  }, [messages, submitted]);

  const jumpTo = useCallback((index: number, hits: MessageSearchResult[]) => {
    const hit = hits[index];

    if (!hit) {
      return;
    }

    tokenRef.current += 1;
    setActiveIndex(index);
    setTarget({ id: hit.id, token: tokenRef.current });
  }, []);

  // INFO: Runs whenever `results` recomputes — which is only on a `submitted` change — and jumps exactly once per explicit submit, the same way `useMessageSearch`'s scan does after its fetch lands.
  useEffect(() => {
    if (!jumpsRef.current) {
      return;
    }

    jumpsRef.current = false;
    jumpTo(0, results);
  }, [results, jumpTo]);

  const reset = useCallback(() => {
    setActiveIndex(null);
    setTarget(null);
  }, []);

  const open = useCallback(() => setIsOpen(true), []);

  const close = useCallback(() => {
    setIsOpen(false);
    setIsListOpen(false);
    setQuery("");
    setSubmitted("");
    reset();
  }, [reset]);

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

  const goOlder = useCallback(() => {
    const next = (activeIndex ?? -1) + 1;

    if (next < results.length) {
      jumpTo(next, results);
    }
  }, [activeIndex, results, jumpTo]);

  const goNewer = useCallback(() => {
    if (activeIndex !== null && activeIndex > 0) {
      jumpTo(activeIndex - 1, results);
    }
  }, [activeIndex, results, jumpTo]);

  // INFO: REQUIREMENTS.md § 8.6. The typed-ahead scan — it never jumps, for `jumpsRef`'s reason above.
  useEffect(() => {
    const trimmed = query.trim();

    if (trimmed.length === 0 || trimmed === submitted) {
      return;
    }

    const timer = setTimeout(() => setSubmitted(trimmed), SEARCH_DEBOUNCE);

    return () => clearTimeout(timer);
  }, [query, submitted]);

  const submit = useCallback(() => {
    const trimmed = query.trim();

    if (trimmed.length === 0) {
      return;
    }

    // INFO: Asking again for the string already on screen is the find-in-page gesture — it steps to the next hit rather than re-running a scan whose answer is already in hand.
    if (trimmed === submitted) {
      goOlder();

      return;
    }

    jumpsRef.current = true;
    setSubmitted(trimmed);
  }, [query, submitted, goOlder]);

  return {
    isOpen,
    isListOpen,
    query,
    submitted,
    results,
    total: results.length,
    activeIndex,
    target,
    hasNoResults: submitted.length > 0 && results.length === 0,
    hasOlder: results.length > 0 && (activeIndex === null || activeIndex + 1 < results.length),
    hasNewer: activeIndex !== null && activeIndex > 0,
    canSubmit: query.trim().length > 0,
    isLoading: false,
    isLoadingMore: false,
    hasMore: false,
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
    loadMore: noop,
    // WARN: Deferred out of the tap's own task, exactly as `useMessageSearch.select` — closed synchronously the row's `keepsScroll` overlay detaches before the click it is answering reaches its default action.
    select: useCallback(
      (index: number) => {
        setTimeout(() => {
          setIsListOpen(false);
          jumpTo(index, results);
        });
      },
      [results, jumpTo],
    ),
    goOlder,
    goNewer,
  };
}
