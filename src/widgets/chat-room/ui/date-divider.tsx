import { cn } from "@/shared/lib";
import { formatDayLabel } from "../model/format-day-label";

export type DateDividerProps = {
  className?: string;
  dayKey: string;
};

/**
 * DESIGN.md § 6.4. The pill itself, exported because § 8.3.'s sticky indicator is
 * the same pill floating over the list — drawn twice, the two would drift apart on
 * the next change to either.
 */
export const DAY_PILL_CLASS =
  "rounded-full bg-chat-pill px-sm py-2xs text-caption text-chat-pill-ink";

// INFO: DESIGN.md § 6.1., § 6.4. The `md` gap is padding on the row, because the virtualizer never sees a container `gap`.
export function DateDivider({ className, dayKey }: DateDividerProps) {
  return (
    <div className={cn("flex justify-center py-md", className)}>
      <span className={DAY_PILL_CLASS}>{formatDayLabel(dayKey)}</span>
    </div>
  );
}
