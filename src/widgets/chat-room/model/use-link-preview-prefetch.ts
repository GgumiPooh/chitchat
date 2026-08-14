"use client";

import type { ChatMessage } from "@/entities/message";
import { findFirstUrl, type MessageId } from "@/shared/lib";
import { useQueryClient } from "@tanstack/react-query";
import { useEffect, useRef } from "react";
import { toLinkPreviewQuery } from "./link-preview-query";

/**
 * REQUIREMENTS.md § 8.9. Looks a message's link up as soon as the message is in the
 * loaded window, rather than when its bubble first renders.
 *
 * WARN: § 8.3. This is a scroll fix and not a latency one. A card resolving while its bubble is already on screen grows the row under the reader, and no scroll compensation can hide that — a row that has been measured simply must not change height. Resolving a page ahead of the viewport is what makes a row's first measurement its final one.
 */
export function useLinkPreviewPrefetch(messages: ChatMessage[], pendingOlder: ChatMessage[]) {
  const queryClient = useQueryClient();
  // WARN: Attempted, not resolved. A lookup that failed has no data to keep it fresh, so without this every commit would ask again — one request per render against an endpoint that is already answering badly.
  const askedRef = useRef(new Set<string>());
  // WARN: Scanned, not asked. Every arrival replaces `messages` wholesale, so without this the regex re-runs over the entire loaded window to find the one body that is new.
  const scannedRef = useRef(new Set<MessageId>());

  useEffect(() => {
    // INFO: § 8.3. The held page before the loaded one, because it is the half that has not been measured yet and the wait for a still scroller is the head start it gets.
    for (const message of [...pendingOlder, ...messages]) {
      if (scannedRef.current.has(message.id)) {
        continue;
      }

      scannedRef.current.add(message.id);

      const url = findFirstUrl(message.text);

      if (!url || askedRef.current.has(url)) {
        continue;
      }

      askedRef.current.add(url);
      void queryClient.prefetchQuery(toLinkPreviewQuery(url));
    }
  }, [messages, pendingOlder, queryClient]);
}
