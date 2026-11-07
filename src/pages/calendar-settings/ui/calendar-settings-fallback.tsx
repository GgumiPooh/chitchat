import { cn } from "@/shared/lib";
import { AppHeader, IconButton, SettingsRowSkeleton } from "@/shared/ui";
import { ChevronLeft } from "lucide-react";

export type CalendarSettingsFallbackProps = {
  className?: string;
};

const SKELETON_KEYS = ["a", "b", "c"];

export function CalendarSettingsFallback({ className }: CalendarSettingsFallbackProps) {
  return (
    <div
      className={cn("mx-auto flex w-full max-w-(--content-max-width) flex-1 flex-col", className)}
    >
      <AppHeader
        title="캘린더 설정"
        leading={<IconButton variant="floating" Icon={ChevronLeft} disabled aria-label="뒤로" />}
      />
      <div className="flex flex-col pt-(--app-header-inset)">
        {SKELETON_KEYS.map((key) => (
          <SettingsRowSkeleton key={key} />
        ))}
      </div>
    </div>
  );
}
