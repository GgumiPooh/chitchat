import type { CalendarSummary } from "@/entities/event";
import { cn } from "@/shared/lib";

export type DDayBandProps = {
  className?: string;
  summary: CalendarSummary;
};

/**
 * DESIGN.md § 7.9. The screen's single focal point, and the only place
 * `display-lg` appears in the app.
 *
 * INFO: Every number here is resolved on the server (REQUIREMENTS.md § 11.1.), so
 * a device with a skewed clock cannot show the two users different counts.
 */
export function DDayBand({ className, summary }: DDayBandProps) {
  return (
    <section
      className={cn("rounded-lg bg-surface-soft p-lg text-center", className)}
      aria-label="함께한 날"
    >
      <p>
        <span className="text-display-lg text-primary">{summary.dayCount.toLocaleString()}</span>
        <span className="text-title-md text-meta">일</span>
      </p>
      <p className="text-body-sm text-meta">함께한 날</p>
      {summary.nextMilestone && (
        <p className="pt-2xs text-caption text-meta">
          {summary.nextMilestone.label}까지 {summary.nextMilestone.daysLeft}일
        </p>
      )}
    </section>
  );
}
