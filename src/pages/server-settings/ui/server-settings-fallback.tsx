import { cn } from "@/shared/lib";
import { AppHeader, SettingsRowSkeleton, Skeleton } from "@/shared/ui";

export type ServerSettingsFallbackProps = {
  className?: string;
  /**
   * Whether the three dispatching controls will be there when the screen arrives.
   *
   * INFO: REQUIREMENTS.md § 12.4. `loading.tsx` reads it from the same `OPS_GITHUB_TOKEN`
   * the screen does, so the fallback stands for the screen this deployment actually
   * renders rather than for the one with the most sections.
   */
  isOpsAvailable?: boolean;
};

// INFO: `SKELETON_KEYS` in `BackupPanel` — the retention limit, so the two lists are the same height.
const BACKUP_ROW_KEYS = ["a", "b", "c"];

/**
 * The fallback 서버 관리 streams behind.
 *
 * WARN: Each section is written out rather than generated from a count, because the three
 * panels are not the same shape and the differences are exactly what a fallback exists to
 * get right: 백업 carries no description line and does carry a list, where the two above it
 * are the other way round. The paddings are copied from the panels for the same reason —
 * the point is that nothing moves when the real screen replaces this.
 */
export function ServerSettingsFallback({ className, isOpsAvailable }: ServerSettingsFallbackProps) {
  return (
    <div
      className={cn("mx-auto flex w-full max-w-(--content-max-width) flex-1 flex-col", className)}
    >
      <AppHeader title="서버 관리" />
      {/* INFO: DESIGN.md § 7.12. The same clearance the screen uses, so nothing steps on the swap. */}
      <div className="flex flex-col gap-md pt-(--app-header-inset) pb-lg">
        {/* 삭제 파일 회수 — heading, one line, 미리보기 and 회수하기 side by side. */}
        {isOpsAvailable && (
          <section className="flex flex-col">
            <SectionHeading />
            <SectionDescription />
            <div className="flex gap-xs px-md">
              <ControlSkeleton />
              <ControlSkeleton />
            </div>
          </section>
        )}
        {/* 고아 파일 정리 — the same, with 미리보기 and 정리 실행 side by side. */}
        {isOpsAvailable && (
          <section className="flex flex-col">
            <SectionHeading />
            <SectionDescription />
            <div className="flex gap-xs px-md">
              <ControlSkeleton />
              <ControlSkeleton />
            </div>
          </section>
        )}
        {/* 백업 — no description, and the list is the block the other two do not have. */}
        <section className="flex flex-col">
          <SectionHeading />
          {isOpsAvailable && (
            <div className="px-md pb-sm">
              <ControlSkeleton />
            </div>
          )}
          {BACKUP_ROW_KEYS.map((key) => (
            <SettingsRowSkeleton key={key} />
          ))}
        </section>
      </div>
    </div>
  );
}

/** `h2`: `px-md pt-md pb-xs text-title-sm`. */
function SectionHeading() {
  return (
    <div className="px-md pt-md pb-xs">
      <Skeleton className="h-5 w-24 rounded-xs" />
    </div>
  );
}

/** `p`: `px-md pb-sm text-body-sm`. One line — every description on this screen is one. */
function SectionDescription() {
  return (
    <div className="px-md pb-sm">
      <Skeleton className="h-4 w-3/5 rounded-xs" />
    </div>
  );
}

// INFO: `min-h-12` is `Button`'s own height, so the bar is the button rather than a guess at it.
function ControlSkeleton() {
  return <Skeleton className="h-12 flex-1 rounded-md" />;
}
