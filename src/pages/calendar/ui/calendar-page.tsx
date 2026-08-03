import { cn } from "@/shared/lib";
import { AppHeader, EmptyState } from "@/shared/ui";
import { CalendarDays } from "lucide-react";

export type CalendarPageProps = {
  className?: string;
};

// TODO: Replace the body with the D-day header and month grid — step 9 of REQUIREMENTS.md § 17.
export function CalendarPage({ className }: CalendarPageProps) {
  return (
    <div className={cn("flex flex-1 flex-col", className)}>
      <AppHeader title="캘린더" />
      <div className="flex flex-1 items-center justify-center p-md">
        <EmptyState Icon={CalendarDays} description="아직 등록된 일정이 없어요" />
      </div>
    </div>
  );
}
