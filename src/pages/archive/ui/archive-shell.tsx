"use client";

import { formatYearMonth } from "@/shared/lib";
import { TwoPane } from "@/shared/ui";
import type { PropsWithChildren } from "react";
import { useArchiveJump } from "../model/archive-jump-context";
import { useArchiveMonthCounts } from "../model/archive-month-counts-context";
import { LibrarySegments } from "./library-segments";

export type ArchiveShellProps = PropsWithChildren<{
  className?: string;
}>;

/**
 * AGENTS.md § 4.1. `app/(main)/archive/layout.tsx`'s own shell — mounted once
 * for all three shelf routes, which is what lets the pill's travelling fill
 * (`LibrarySegments`'s `pill` variant) actually travel rather than remount cold
 * on every tap. The jump list beneath the pill reaches `{children}` through
 * `useArchiveJump` rather than a prop, since this shell never re-renders with it;
 * its totals come from `ArchiveMonthCountsProvider`, which follows the 보기 옵션
 * mode and the shelf's own mutations where the layout's one-shot fetch cannot.
 */
export function ArchiveShell({ className, children }: ArchiveShellProps) {
  const { months } = useArchiveMonthCounts();
  const { jump } = useArchiveJump();

  return (
    <TwoPane
      className={className}
      panel={
        <div className="flex flex-col gap-md p-md">
          <LibrarySegments variant="pill" />
          {months.length > 0 && (
            <nav className="flex flex-col gap-2xs" aria-label="월 이동">
              {months.map((month) => (
                <button
                  key={month.monthKey}
                  className="flex cursor-pointer items-center justify-between gap-sm rounded-md px-sm py-xs text-left text-body-sm text-body transition-colors outline-none hover:bg-surface-soft focus-visible:ring-2 focus-visible:ring-primary active:bg-surface-strong"
                  type="button"
                  onClick={() => jump(month.monthKey)}
                >
                  {formatYearMonth(month.monthKey)}
                  {/* INFO: AGENTS.md § 4.1. `listArchiveMonthCounts`'s own aggregate — the shelf's true count, not "however many `useArchiveMedia` has paged in so far". */}
                  <span className="min-w-5 shrink-0 rounded-full bg-surface-soft px-2xs text-center text-caption text-meta">
                    {month.count}
                  </span>
                </button>
              ))}
            </nav>
          )}
        </div>
      }
    >
      {children}
    </TwoPane>
  );
}
