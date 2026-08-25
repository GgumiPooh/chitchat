import { cn } from "@/shared/lib";
import { AppHeader, SettingsRowSkeleton, Skeleton } from "@/shared/ui";

/**
 * INFO: REQUIREMENTS.md § 12. Two, because the list is never empty — the session
 * rendering the screen is always one of the rows — and a pair is the shape of a
 * couple's app. It is the one count on any of these fallbacks that cannot be derived,
 * so it is the one place a row may still arrive or leave under the reader.
 */
const ROW_KEYS = ["a", "b"];

// INFO: REQUIREMENTS.md § 12. No chevron on this list — a row trails either the 로그아웃 button (`min-h-9`) or the 이 기기 caption, and the button is the wider of the two.
const REVOKE_BUTTON = <Skeleton className="h-9 w-18 shrink-0 rounded-md" />;

export type DeviceSettingsFallbackProps = {
  className?: string;
};

/** The fallback 로그인된 기기 streams behind. */
export function DeviceSettingsFallback({ className }: DeviceSettingsFallbackProps) {
  return (
    <div
      className={cn("mx-auto flex w-full max-w-(--content-max-width) flex-1 flex-col", className)}
    >
      <AppHeader title="로그인된 기기" />
      {/* INFO: DESIGN.md § 7.12. The same clearance the screen uses, so nothing steps on the swap. */}
      <div className="pt-(--app-header-inset)">
        {ROW_KEYS.map((key) => (
          <SettingsRowSkeleton key={key} trailing={REVOKE_BUTTON} />
        ))}
      </div>
    </div>
  );
}
