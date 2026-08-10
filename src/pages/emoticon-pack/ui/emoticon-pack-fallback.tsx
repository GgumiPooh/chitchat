import { cn } from "@/shared/lib";
import { AppHeader, Skeleton } from "@/shared/ui";

// INFO: REQUIREMENTS.md § 13.1. Two rows of the four-column grid, which is what reaches the fold under the header.
const CELL_KEYS = ["a", "b", "c", "d", "e", "f", "g", "h"];

export type EmoticonPackFallbackProps = {
  className?: string;
};

/**
 * The fallback a pack's own screen streams behind.
 *
 * WARN: DESIGN.md § 7.12. No title, because the title is the pack's name and that is
 * the very thing being fetched. The header is transparent and floats over the grid,
 * so a name arriving into an empty row moves nothing.
 */
export function EmoticonPackFallback({ className }: EmoticonPackFallbackProps) {
  return (
    <div className={cn("flex flex-1 flex-col", className)}>
      <AppHeader />
      {/* INFO: DESIGN.md § 7.12. The same clearance the screen uses, so nothing steps on the swap. */}
      <div className="flex-1 p-md pt-[calc(var(--app-header-inset)+var(--spacing-md))]" aria-hidden>
        {/* INFO: DESIGN.md § 9. The cell is a fixed square at `rounded-sm`, with one clamped keyword line beneath it. */}
        <div className="grid grid-cols-4 gap-2xs">
          {CELL_KEYS.map((key) => (
            <div key={key} className="space-y-2xs">
              <Skeleton className="aspect-square w-full rounded-sm" />
              <Skeleton className="mx-auto h-[1lh] w-4/5 text-caption" />
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
