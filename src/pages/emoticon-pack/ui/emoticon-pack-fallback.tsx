import type { EmoticonPackType } from "@/shared/config";
import { cn } from "@/shared/lib";
import { AppHeader, Skeleton } from "@/shared/ui";

// INFO: DESIGN.md § 7.8. Counted to overflow the tallest viewport rather than to reach a phone's fold — the block below is clipped, so a surplus costs nothing and a shortfall is a skeleton that stops halfway down.
const CELL_KEYS = Array.from({ length: 48 }, (_, index) => `cell-${index}`);

export type EmoticonPackFallbackProps = {
  className?: string;
  /** INFO: § 13. The column count the real grid will use, so the swap moves nothing sideways. */
  type: EmoticonPackType;
};

/**
 * The fallback a pack's own screen streams behind.
 *
 * WARN: DESIGN.md § 7.12. No title, because the title is the pack's name and that is
 * the very thing being fetched. The header is transparent and floats over the grid,
 * so a name arriving into an empty row moves nothing.
 */
export function EmoticonPackFallback({ className, type }: EmoticonPackFallbackProps) {
  return (
    <div className={cn("flex flex-1 flex-col", className)}>
      <AppHeader />
      {/* INFO: DESIGN.md § 7.12. The same clearance the screen uses, so nothing steps on the swap. */}
      <div className="flex flex-1 flex-col p-md pt-[calc(var(--app-header-inset)+var(--spacing-md))]">
        {/* WARN: DESIGN.md § 7.8. `overflow-hidden` on a `flex-1` box is what lets the count above be generous — unclipped, the surplus would grow § 3.3.'s document scroller over a screen with nothing in it yet. */}
        <div className="min-h-0 flex-1 overflow-hidden" aria-hidden>
          {/* INFO: DESIGN.md § 9. The cell is a fixed square at `rounded-sm`, with one clamped keyword line beneath it. */}
          <div className={cn("grid gap-2xs", type === "mini" ? "grid-cols-6" : "grid-cols-4")}>
            {CELL_KEYS.map((key) => (
              <div key={key} className="space-y-2xs">
                {/* INFO: DESIGN.md § 7.8. The cell's frame is fixed geometry no query moves, so it is drawn rather than stood in for — only the still inside its `p-2xs` is pending, which is the box `PreloadImage` pulses in on the real screen. */}
                <div className="aspect-square w-full rounded-sm border border-hairline bg-canvas p-2xs">
                  <Skeleton className="size-full rounded-sm" />
                </div>
                <Skeleton className="mx-auto h-[1lh] w-4/5 text-caption" />
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
