"use client";

import { useCallback, useState } from "react";
import type { Nullable } from "../nullish";

// WARN: The tab's/segment's **route** itself (or its prefix), not any label beside it — a caller matching by prefix (`isUnderRoute`) needs that prefix here too, or a pending route would never match against itself.
export type PendingTab = { route: string; from: Nullable<string> };

/**
 * DESIGN.md § 7.3. Shared by any persistent nav whose active fill must move on the
 * tap rather than when the route commits — `TabBar`, `NavRail`, and 보관함's `lg`
 * panel switcher (AGENTS.md § 4.1.), which all hold across the very
 * navigation this smooths over.
 */
export function usePendingTab(pathname: Nullable<string>) {
  const [pendingTab, setPendingTabState] = useState<Nullable<PendingTab>>(null);

  // WARN: Discarded during render, not merely masked. Left in state it would match again the next time the user lands back on `from` — a swipe-back would refill the tab they just left, `aria-current` and all.
  // INFO: React's documented "adjust state during render"; an effect is both a frame late and a cascading render the lint rules reject.
  if (pendingTab && pendingTab.from !== pathname) {
    setPendingTabState(null);
  }

  const setPendingTab = useCallback(
    (route: string) => setPendingTabState({ route, from: pathname }),
    [pathname],
  );

  return { pendingTab, setPendingTab };
}
