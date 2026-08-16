import { cn } from "@/shared/lib";
import { AppHeader, Skeleton } from "@/shared/ui";

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

/**
 * The fallback 서버 관리 streams behind.
 *
 * INFO: One block per section the screen will have, each shaped like the panel it stands
 * in for — heading, one line of description, then the control. Two bare bars stood in for
 * a two-panel screen and were left behind by 삭제 파일 회수, which is the kind of drift a
 * fallback shows as a jump at the swap rather than as anything failing.
 *
 * INFO: The backup list is deliberately not part of it — that list is fetched by the
 * client after the screen mounts and has a skeleton of its own, so standing in for it
 * here would swap one set of grey rows for another.
 */
export function ServerSettingsFallback({ className, isOpsAvailable }: ServerSettingsFallbackProps) {
  return (
    <div className={cn("flex flex-1 flex-col", className)}>
      <AppHeader title="서버 관리" />
      {/* INFO: DESIGN.md § 7.12. The same clearance the screen uses, so nothing steps on the swap. */}
      <div className="flex flex-col gap-md pt-(--app-header-inset) pb-lg">
        {/* INFO: 삭제 파일 회수 and 고아 파일 정리, in the order the screen puts them. */}
        {isOpsAvailable && <PanelSkeleton controlCount={1} />}
        {isOpsAvailable && <PanelSkeleton controlCount={2} />}
        {/* INFO: 백업 — always there, since the list and its deletions do not need a token. Its 백업 생성 button is the half that does. */}
        <PanelSkeleton controlCount={isOpsAvailable ? 1 : 0} />
      </div>
    </div>
  );
}

/**
 * One section's worth of grey, in the panels' own spacing.
 *
 * WARN: The paddings are copied from the panels rather than approximated, because the
 * whole point is that nothing moves when the real screen replaces this.
 */
function PanelSkeleton({ controlCount }: { controlCount: number }) {
  return (
    <section className="flex flex-col">
      {/* `h2`: px-md pt-md pb-xs text-title-sm */}
      <div className="px-md pt-md pb-xs">
        <Skeleton className="h-5 w-24 rounded-xs" />
      </div>
      {/* `p`: px-md pb-sm text-body-sm */}
      <div className="px-md pb-sm">
        <Skeleton className="h-4 w-3/5 rounded-xs" />
      </div>
      {controlCount > 0 && (
        <div className="flex gap-xs px-md">
          {Array.from({ length: controlCount }, (_, index) => (
            // INFO: `min-h-12` is `Button`'s own height, so the bar is the button rather than a guess at it.
            <Skeleton key={index} className="h-12 flex-1 rounded-md" />
          ))}
        </div>
      )}
    </section>
  );
}
