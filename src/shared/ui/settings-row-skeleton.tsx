import { cn } from "@/shared/lib";
import type { ReactNode } from "react";
import { Skeleton } from "./skeleton";

export type SettingsRowSkeletonProps = {
  className?: string;
  labelClassName?: string;
  descriptionClassName?: string;
  /**
   * The shape in the trailing slot, mirroring `SettingsRow.trailing`. Defaults to the
   * 16px block a chevron occupies.
   *
   * WARN: A slot rather than a fixed chevron, because half the § 12. list does not
   * carry one — a `Switch` is 48×28 and 화면 테마's segmented track is 116×40 against
   * that 16px square. The row's height is unaffected either way, so nothing reflows;
   * what a fixed chevron cost was the right edge of the list changing shape on the
   * swap, which is the whole thing these fallbacks exist to avoid.
   */
  trailing?: ReactNode;
};

/**
 * DESIGN.md § 7.8., § 7.11. One `SettingsRow` as a shape.
 *
 * WARN: It lives beside `SettingsRow` so the two boxes are read together — the row's
 * height is content-driven (`min-h-14` is a floor its two lines clear), so a padding
 * or type change there moves this one and nothing else would say so.
 *
 * INFO: The blocks are `1lh` of their own line's type scale, which is what makes the
 * stack resolve to the height the real row resolves to rather than near it.
 */
export function SettingsRowSkeleton({
  className,
  labelClassName,
  descriptionClassName,
  trailing,
}: SettingsRowSkeletonProps) {
  return (
    <div
      className={cn(
        "flex min-h-14 w-full items-center gap-sm border-b border-hairline-soft bg-canvas p-md",
        className,
      )}
      aria-hidden
    >
      <Skeleton className="size-[18px] shrink-0 rounded-xs" />
      <span className="flex min-w-0 flex-1 flex-col gap-2xs">
        <Skeleton className={cn("h-[1lh] w-28 text-title-md", labelClassName)} />
        <Skeleton className={cn("h-[1lh] w-48 text-body-sm", descriptionClassName)} />
      </span>
      {trailing ?? <Skeleton className="size-4 shrink-0 rounded-xs" />}
    </div>
  );
}
