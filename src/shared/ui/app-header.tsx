import { cn } from "@/shared/lib";
import type { ReactNode } from "react";

export type AppHeaderProps = {
  className?: string;
  titleClassName?: string;
  title: string;
  leading?: ReactNode;
  trailing?: ReactNode;
};

// INFO: DESIGN.md § 7.12. Sticky rather than fixed, so it participates in the shell column and needs no width re-application.
export function AppHeader({ className, titleClassName, title, leading, trailing }: AppHeaderProps) {
  return (
    <header
      className={cn(
        "sticky top-0 z-30 border-b border-hairline bg-canvas pt-[env(safe-area-inset-top)]",
        className,
      )}
    >
      {/* INFO: DESIGN.md § 7.12. `2xs` on the row plus `sm` on the title puts both the title and an icon button's glyph on the 16px screen gutter. */}
      <div className="flex h-(--app-header-height) items-center px-2xs">
        {leading}
        <h1 className={cn("flex-1 truncate px-sm text-title-md text-ink", titleClassName)}>
          {title}
        </h1>
        {trailing}
      </div>
    </header>
  );
}
