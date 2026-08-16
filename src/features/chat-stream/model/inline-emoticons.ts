"use client";

import type { InlineEmoticonMap } from "@/shared/config";
import { useSyncExternalStore } from "react";

/**
 * Every inline emoticon this tab has been told about, merged from every path that
 * delivers messages (REQUIREMENTS.md § 13.).
 *
 * WARN: A module singleton rather than provider state, and the writers are why —
 * the history fetchers are plain functions with no hook to call, and the send path
 * lives in a slice that may not import this one. It is merge-only and keyed by item
 * id, so a page arriving twice costs nothing and no path can evict what another one
 * is still drawing.
 *
 * WARN: Never written during a render. This module is loaded on the server too, where
 * it would then be shared by every request — the writers below are effects and event
 * callbacks for that reason, and the server snapshot is a frozen empty map.
 */
let known: InlineEmoticonMap = {};

const NONE: InlineEmoticonMap = {};

const listeners = new Set<() => void>();

/** Merges what a payload carried, and wakes whatever is drawing from it. */
export function rememberInlineEmoticons(emoticons: InlineEmoticonMap) {
  // INFO: § 13.4. A version bump is an edited item and a delete is a box that now draws a replacement, so a known id is still worth replacing when either has moved.
  const arrived = Object.entries(emoticons).filter(([itemId, emoticon]) => {
    const held = known[itemId];

    return (
      held === undefined ||
      held.version !== emoticon.version ||
      held.isDeleted !== emoticon.isDeleted
    );
  });

  if (arrived.length === 0) {
    return;
  }

  known = { ...known, ...Object.fromEntries(arrived) };
  listeners.forEach((notify) => notify());
}

/** What the tab knows, for whatever is drawing a message's placeholders. */
export function useInlineEmoticons(): InlineEmoticonMap {
  return useSyncExternalStore(subscribe, toSnapshot, toServerSnapshot);
}

function subscribe(notify: () => void) {
  listeners.add(notify);

  return () => {
    listeners.delete(notify);
  };
}

function toSnapshot(): InlineEmoticonMap {
  return known;
}

// WARN: Never `known`. A server render must not read state another request wrote, and the first client snapshot has to match what was rendered or React re-renders the tree it just hydrated.
function toServerSnapshot(): InlineEmoticonMap {
  return NONE;
}
