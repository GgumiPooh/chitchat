import { LibrarySegments } from "@/pages/archive";
import { AppHeader, Skeleton } from "@/shared/ui";

// INFO: DESIGN.md § 7.8. Enough rows to reach the fold on a phone without claiming a page the response may not fill.
const SKELETON_KEYS = ["a", "b", "c", "d", "e", "f"];

/**
 * The fallback every 보관함 segment streams behind (REQUIREMENTS.md § 10.).
 *
 * INFO: One file for all three shelves, since `loading` covers its segment and
 * everything nested under it — and the three differ only in the rows, which are a
 * skeleton here anyway.
 *
 * WARN: It draws the header and the chips, not only the rows. `loading` replaces the
 * whole page subtree, and the chips live in the page — a fallback of bare skeletons
 * would take the segment control off screen for the length of the fetch, which is
 * the one moment the user is looking at it. `LibrarySegments` reads the active shelf
 * from the URL, so it is already correct here.
 */
export default function Loading() {
  return (
    <div className="flex flex-1 flex-col">
      <AppHeader title="보관함" />
      {/* INFO: DESIGN.md § 7.12. The same clearance the screens use, so nothing shifts when the real page swaps in. */}
      <div className="flex flex-1 flex-col p-md pt-[calc(var(--app-header-inset)+var(--spacing-xs))]">
        <LibrarySegments className="pb-sm" />
        <div className="flex flex-col gap-2xs" aria-hidden>
          {SKELETON_KEYS.map((key) => (
            <Skeleton key={key} className="h-14 rounded-md" />
          ))}
        </div>
      </div>
    </div>
  );
}
