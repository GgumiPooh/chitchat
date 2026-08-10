import { cn } from "@/shared/lib";
import { AppHeader, Container, Skeleton } from "@/shared/ui";
import { WeekdayHeader } from "@/widgets/calendar-month";

/**
 * INFO: DESIGN.md § 7.9. Six rows, always — `buildMonthGrid` pads every month to
 * whole weeks precisely so the grid's height never moves, which is what lets this
 * count its cells instead of guessing at them.
 */
const CELL_KEYS = Array.from({ length: 6 * 7 }, (_, index) => String(index));

// INFO: DESIGN.md § 7.9. The agenda's own two loading rows, at the height `DayAgenda` draws them at.
const AGENDA_ROW_KEYS = ["a", "b"];

export type CalendarFallbackProps = {
  className?: string;
};

/**
 * The fallback 캘린더 streams behind.
 *
 * WARN: DESIGN.md § 7.8. It draws the header and the weekday row for real rather
 * than as placeholders — neither depends on the month, the events or the clock, so a
 * skeleton of them would be a swap for identical pixels. Everything the server
 * resolves (REQUIREMENTS.md § 11.1.) is a block at the box that block will occupy.
 *
 * WARN: DESIGN.md § 7.9. No 다가오는 일정 card, and this is only safe because that
 * section is now the last thing on the screen. It renders nothing when there is
 * nothing upcoming, so a placeholder for it would be a band that vanishes on roughly
 * the days it was drawn for — but while it sat above the grid, omitting it here is
 * also what pushed the month down the moment the real screen arrived.
 */
export function CalendarFallback({ className }: CalendarFallbackProps) {
  return (
    <div className={cn("flex flex-1 flex-col", className)}>
      {/* INFO: DESIGN.md § 7.1., § 7.8. 일정 추가's own 44px disc. Drawn as a block rather than the real `IconButton`, because the screen it opens is not here yet and a control that answers nothing is worse than one that has not arrived. */}
      <AppHeader title="캘린더" trailing={<Skeleton className="size-11 rounded-full" />} />
      {/* INFO: DESIGN.md § 7.12. The same clearance `CalendarPage` uses, so nothing steps when the real screen swaps in. */}
      <Container
        className="space-y-md py-md pt-[calc(var(--app-header-inset)+var(--spacing-md))]"
        aria-hidden
      >
        {/* INFO: DESIGN.md § 7.9. The D-day band's own box — `surface-soft` at `rounded-lg`, so only the three lines inside it are standing in for anything. */}
        <section className="rounded-lg bg-surface-soft p-lg text-center">
          {/* INFO: `1lh` against the line's own type scale, which is what makes each block exactly the line box it replaces. */}
          <Skeleton className="mx-auto h-[1lh] w-28 text-display-lg" />
          <Skeleton className="mx-auto h-[1lh] w-20 text-body-sm" />
          <div className="pt-2xs">
            <Skeleton className="mx-auto h-[1lh] w-32 text-caption" />
          </div>
        </section>

        <section className="space-y-xs">
          {/* INFO: DESIGN.md § 7.9. The month header's three columns, at the 44px the chevrons occupy either side. */}
          <header className="grid grid-cols-[1fr_auto_1fr] items-center">
            <Skeleton className="size-11 justify-self-start rounded-full" />
            <Skeleton className="h-[1lh] w-28 text-display-md" />
            <Skeleton className="size-11 justify-self-end rounded-full" />
          </header>
          <WeekdayHeader />
          {/* INFO: DESIGN.md § 7.9. A day cell is a square `rounded-full` button filling its column, which is the shape a selected day already wears. */}
          <div className="grid grid-cols-7 gap-0.5">
            {CELL_KEYS.map((key) => (
              <Skeleton key={key} className="aspect-square rounded-full" />
            ))}
          </div>
        </section>

        <section className="space-y-xs">
          <Skeleton className="h-[1lh] w-40 text-title-md" />
          <ul className="space-y-2xs">
            {AGENDA_ROW_KEYS.map((key) => (
              <li key={key}>
                <Skeleton className="h-11 rounded-md" />
              </li>
            ))}
          </ul>
          {/* INFO: DESIGN.md § 7.1. 일정 추가's own box — `Button` is `min-h-12` at `rounded-md`. */}
          <Skeleton className="h-12 rounded-md" />
        </section>
      </Container>
    </div>
  );
}
