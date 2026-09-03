"use client";

import type { MessageBookmark } from "@/entities/message";
import type { MessageId } from "@/shared/lib";
import { toast } from "@/shared/ui";
import { useCallback, useEffect, useRef, useState } from "react";
import { fetchMessageBookmarks } from "../api/fetch-message-bookmarks";
import {
  requestAddMessageBookmark,
  requestRemoveAllMessageBookmarks,
  requestRemoveMessageBookmark,
  requestRenameMessageBookmark,
} from "../api/request-message-bookmark";

export type MessageBookmarks = ReturnType<typeof useMessageBookmarks>;

function toIds(bookmarks: MessageBookmark[]): Set<MessageId> {
  return new Set(bookmarks.map((bookmark) => bookmark.id));
}

/** The reader's 책갈피 list (REQUIREMENTS.md § 8.19.). */
export function useMessageBookmarks(hideOthers: boolean) {
  const [bookmarks, setBookmarks] = useState<MessageBookmark[]>([]);
  const [ids, setIds] = useState<Set<MessageId>>(new Set());
  const [isListOpen, setIsListOpen] = useState(false);
  // WARN: Every fetch carries one, and only the newest may write — toggling `hideOthers` twice fires two requests, and a slow first one landing last would overwrite the second's answer.
  const requestId = useRef(0);
  // WARN: A ref, not a dependency — `add`/`remove` reload after their request lands, and a `reload` closed over the filter of the render that started them would fetch under a filter the reader has since left.
  const hideOthersRef = useRef(hideOthers);

  const reload = useCallback(async () => {
    const generation = (requestId.current += 1);

    try {
      const page = await fetchMessageBookmarks(hideOthersRef.current);

      if (generation !== requestId.current) {
        return;
      }

      setBookmarks(page);
      setIds(toIds(page));
    } catch {
      if (generation === requestId.current) {
        toast.error("책갈피 목록을 불러오지 못했어요");
      }
    }
  }, []);

  useEffect(() => {
    hideOthersRef.current = hideOthers;

    void reload();
  }, [hideOthers, reload]);

  const add = useCallback(
    async (id: MessageId) => {
      try {
        const added = await requestAddMessageBookmark(id);

        if (added) {
          setIds((prev) => new Set(prev).add(id));
          void reload();
        }

        return added;
      } catch {
        toast.error("책갈피를 저장하지 못했어요");

        return false;
      }
    },
    [reload],
  );

  const remove = useCallback(
    async (id: MessageId) => {
      try {
        const removed = await requestRemoveMessageBookmark(id);

        if (removed) {
          setIds((prev) => {
            const next = new Set(prev);
            next.delete(id);

            return next;
          });
          void reload();
        }

        return removed;
      } catch {
        toast.error("책갈피를 해제하지 못했어요");

        return false;
      }
    },
    [reload],
  );

  const rename = useCallback(
    async (id: MessageId, name: string) => {
      try {
        const renamed = await requestRenameMessageBookmark(id, name);

        if (renamed) {
          setBookmarks((prev) =>
            prev.map((bookmark) => (bookmark.id === id ? { ...bookmark, name } : bookmark)),
          );
          void reload();
        }

        return renamed;
      } catch {
        toast.error("책갈피 이름을 바꾸지 못했어요");

        return false;
      }
    },
    [reload],
  );

  const removeAll = useCallback(async () => {
    try {
      await requestRemoveAllMessageBookmarks();
      setBookmarks([]);
      setIds(new Set());
      void reload();

      return true;
    } catch {
      toast.error("책갈피를 해제하지 못했어요");

      return false;
    }
  }, [reload]);

  return {
    bookmarks,
    ids,
    isListOpen,
    openList: useCallback(() => setIsListOpen(true), []),
    closeList: useCallback(() => setIsListOpen(false), []),
    add,
    remove,
    rename,
    removeAll,
    reload,
  };
}
