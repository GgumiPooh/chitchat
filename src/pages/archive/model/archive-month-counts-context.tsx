"use client";

import type { ArchiveMonthCount } from "@/entities/media";
import {
  ARCHIVE_MODE_PARAM,
  LIBRARY_SHELVES,
  toArchiveModeFilter,
  type ArchiveModeFilter,
  type LibraryShelf,
} from "@/shared/config";
import type { Nullable } from "@/shared/lib";
import { usePathname, useSearchParams } from "next/navigation";
import { createContext, useContext, useEffect, useState, type PropsWithChildren } from "react";
import { fetchArchiveMonthCounts } from "../api/fetch-archive-month-counts";
import { toActiveShelf } from "../ui/library-segments";

type CountsEntry = { months: ArchiveMonthCount[]; generation: number };

type ArchiveMonthCountsValue = {
  /** The mounted shelf's totals under the active 보기 옵션 mode — the last resolved list while a fresher one is in flight. */
  months: ArchiveMonthCount[];
  /** Called by whatever changes what a month holds — an upload landing, a 삭제 — so every cached list is refetched before it is shown again. */
  invalidate: () => void;
};

const ArchiveMonthCountsContext = createContext<Nullable<ArchiveMonthCountsValue>>(null);

export type ArchiveMonthCountsProviderProps = PropsWithChildren<{
  /** `archive/layout.tsx`'s server-rendered 전체보기 totals, so the panel's first paint costs no round trip. */
  seed: Record<LibraryShelf, ArchiveMonthCount[]>;
}>;

/**
 * REQUIREMENTS.md § 10. The `lg` panel's month totals, owned as a client query
 * keyed on `(shelf, mode)` — the layout that seeds them can read no `searchParams`
 * and never re-renders on a client mutation, so counts left as its prop ignored
 * the 보기 옵션 filter and went stale under every upload and 삭제.
 */
export function ArchiveMonthCountsProvider({ seed, children }: ArchiveMonthCountsProviderProps) {
  const shelf = toActiveShelf(usePathname());
  const mode = toArchiveModeFilter(useSearchParams()?.get(ARCHIVE_MODE_PARAM));
  const [generation, setGeneration] = useState(0);
  const [cache, setCache] = useState<Record<string, CountsEntry>>(() =>
    Object.fromEntries(
      LIBRARY_SHELVES.map((each) => [toKey(each, "all"), { months: seed[each], generation: 0 }]),
    ),
  );
  const key = toKey(shelf, mode);
  const entry = cache[key] as CountsEntry | undefined;
  const isCurrent = entry !== undefined && entry.generation >= generation;

  useEffect(() => {
    if (isCurrent) {
      return;
    }

    let isStale = false;

    // INFO: A failure keeps whatever list is on screen — the panel is a jump aid, and a toast over a background count refresh would outweigh what it reports.
    fetchArchiveMonthCounts(shelf, mode)
      .then((months) => {
        if (!isStale) {
          setCache((previous) => ({ ...previous, [key]: { months, generation } }));
        }
      })
      .catch(() => {});

    return () => {
      isStale = true;
    };
  }, [generation, isCurrent, key, mode, shelf]);

  const invalidate = () => setGeneration((previous) => previous + 1);

  // INFO: The stale slice stands in while its refetch is in flight; a key never seen falls back to the shelf's 전체보기 seed rather than emptying the panel.
  const months = entry?.months ?? cache[toKey(shelf, "all")]?.months ?? [];

  return (
    <ArchiveMonthCountsContext value={{ months, invalidate }}>{children}</ArchiveMonthCountsContext>
  );
}

export function useArchiveMonthCounts(): ArchiveMonthCountsValue {
  const context = useContext(ArchiveMonthCountsContext);

  if (!context) {
    throw new Error("useArchiveMonthCounts must be used within ArchiveMonthCountsProvider");
  }

  return context;
}

function toKey(shelf: LibraryShelf, mode: ArchiveModeFilter): string {
  return `${shelf}:${mode}`;
}
