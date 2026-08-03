import { cn } from "@/shared/lib";
import { formatDayLabel } from "../model/format-day-label";

export type DateDividerProps = {
  className?: string;
  dayKey: string;
};

// INFO: DESIGN.md § 6.1., § 6.4. The `md` gap is padding on the row, because the virtualizer never sees a container `gap`.
export function DateDivider({ className, dayKey }: DateDividerProps) {
  return (
    <div className={cn("flex justify-center py-md", className)}>
      <span className="rounded-full bg-chat-pill px-sm py-2xs text-caption text-chat-pill-ink">
        {formatDayLabel(dayKey)}
      </span>
    </div>
  );
}
