import { cn } from "@/shared/lib";
import { AppHeader, Skeleton } from "@/shared/ui";

export type ServerSettingsFallbackProps = {
  className?: string;
};

/**
 * The fallback 서버 관리 streams behind.
 *
 * INFO: The backup list is not part of it — that list is fetched by the client after
 * the screen mounts and has a skeleton of its own, so standing in for it here would
 * swap one set of grey rows for another.
 */
export function ServerSettingsFallback({ className }: ServerSettingsFallbackProps) {
  return (
    <div className={cn("flex flex-1 flex-col", className)}>
      <AppHeader title="서버 관리" />
      {/* INFO: DESIGN.md § 7.12. The same clearance the screen uses, so nothing steps on the swap. */}
      <div className="flex flex-col gap-md px-md pt-(--app-header-inset)">
        <Skeleton className="mt-md h-11 w-full rounded-md" />
        <Skeleton className="h-11 w-full rounded-md" />
      </div>
    </div>
  );
}
