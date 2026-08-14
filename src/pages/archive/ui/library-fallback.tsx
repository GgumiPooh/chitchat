import type { LibraryShelf } from "@/shared/config";
import { cn } from "@/shared/lib";
import { AppHeader, Skeleton } from "@/shared/ui";
import { LibrarySegments } from "./library-segments";

export type LibraryFallbackProps = {
  className?: string;
  shelf: LibraryShelf;
};

/**
 * INFO: DESIGN.md § 7.8. Counted to overflow the tallest viewport rather than to reach a phone's fold — the block holding them is clipped to what is left of the screen, so a surplus costs nothing and a shortfall is a skeleton that stops halfway down with bare `canvas` under it.
 * INFO: A tile is a third of the shell's width and a row is a fixed 56, so the two shapes need very different counts to cover the same height.
 */
const TILE_KEYS = Array.from({ length: 36 }, (_, index) => `tile-${index}`);
const ROW_KEYS = Array.from({ length: 20 }, (_, index) => `row-${index}`);

/**
 * The fallback every 보관함 shelf streams behind (REQUIREMENTS.md § 10.).
 *
 * WARN: DESIGN.md § 7.8. The placeholder takes the **shelf's own** geometry, which is
 * why this is per-segment rather than one file at `/archive`. One shared fallback drew
 * 파일's rows on all three, so opening 갤러리 filled the screen with tall bars and then
 * replaced them wholesale with a 3-column grid — a skeleton that stands in for a shape
 * it is not is a worse wait than no skeleton at all.
 *
 * WARN: It draws the header and the chips, not only the rows. `loading` replaces the
 * whole page subtree, and the chips live in the page — a fallback of bare skeletons
 * would take the segment control off screen for the length of the fetch, which is the
 * one moment the user is looking at it. `LibrarySegments` reads the active shelf from
 * the URL, so it is already correct here.
 */
export function LibraryFallback({ className, shelf }: LibraryFallbackProps) {
  return (
    <div className={cn("flex flex-1 flex-col", className)}>
      <AppHeader title="보관함" />
      {/* INFO: DESIGN.md § 7.12. The same clearance the screens use, so nothing shifts when the real page swaps in. */}
      <div className="flex flex-1 flex-col p-md pt-[calc(var(--app-header-inset)+var(--spacing-xs))]">
        <LibrarySegments className="pb-sm" />
        {/* WARN: `overflow-hidden` on a `flex-1` box is what lets the counts above be generous. The shelf is drawn to more than fill any screen, and this is what stops the surplus growing the document — DESIGN.md § 3.3. makes that column the page's own scroller, so an unclipped fallback would hand the reader a scrollbar over a screen with nothing in it yet. */}
        <div className="min-h-0 flex-1 overflow-hidden" aria-hidden>
          {/* INFO: DESIGN.md § 7.10. Every shelf opens on a month section header, so the placeholder does too — without it the rows land `pb-xs` higher than the real ones and the whole screen steps up on the swap. */}
          <Skeleton className="mb-xs h-5 w-24 rounded-xs" />
          {shelf === "gallery" ? renderTiles() : renderRows()}
        </div>
      </div>
    </div>
  );

  // INFO: DESIGN.md § 7.10. The grid's own cells — square, `2xs` gutters, `rounded-sm`.
  function renderTiles() {
    return (
      <div className="grid grid-cols-3 gap-2xs">
        {TILE_KEYS.map((key) => (
          <Skeleton key={key} className="aspect-square rounded-sm" />
        ))}
      </div>
    );
  }

  // INFO: DESIGN.md § 6.5. Both list shelves are a fixed 56px row; only the radius differs, since 파일 draws a `FileCard` and 음성 a `VoicePlayer`.
  function renderRows() {
    return (
      <div className="flex flex-col gap-2xs">
        {ROW_KEYS.map((key) => (
          <Skeleton
            key={key}
            className={cn("h-14", shelf === "voice" ? "rounded-bubble" : "rounded-md")}
          />
        ))}
      </div>
    );
  }
}
