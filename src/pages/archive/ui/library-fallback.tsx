import type { LibraryKind } from "@/shared/config";
import { cn } from "@/shared/lib";
import { AppHeader, Skeleton } from "@/shared/ui";
import { LibrarySegments } from "./library-segments";

export type LibraryFallbackProps = {
  className?: string;
  shelf: LibraryKind;
};

// INFO: DESIGN.md § 7.8. Enough to reach the fold on a phone without claiming a page the response may not fill — a grid row is a third of a list row's height, so 사진 counts nine where the lists count six.
const TILE_KEYS = ["a", "b", "c", "d", "e", "f", "g", "h", "i"];
const ROW_KEYS = ["a", "b", "c", "d", "e", "f"];

/**
 * The fallback every 보관함 shelf streams behind (REQUIREMENTS.md § 10.).
 *
 * WARN: DESIGN.md § 7.8. The placeholder takes the **shelf's own** geometry, which is
 * why this is per-segment rather than one file at `/archive`. One shared fallback drew
 * 파일's rows on all three, so opening 사진 filled the screen with tall bars and then
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
        <div aria-hidden>
          {/* INFO: DESIGN.md § 7.10. Every shelf opens on a month section header, so the placeholder does too — without it the rows land `pb-xs` higher than the real ones and the whole screen steps up on the swap. */}
          <Skeleton className="mb-xs h-5 w-24 rounded-xs" />
          {shelf === "photo" ? renderTiles() : renderRows()}
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
