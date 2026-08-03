import { cn } from "@/shared/lib";
import type { ReactNode } from "react";

export type AppHeaderProps = {
  className?: string;
  titleClassName?: string;
  title?: string;
  leading?: ReactNode;
  trailing?: ReactNode;
};

/**
 * The floating top strip (DESIGN.md § 7.12.). It has no surface of its own: it
 * is a transparent row pinned to the top of the visual viewport, and only the
 * controls inside it are visible. Content scrolls underneath.
 */
export function AppHeader({ className, titleClassName, title, leading, trailing }: AppHeaderProps) {
  return (
    <header
      // INFO: DESIGN.md § 7.12. The negative margin cancels its own height, so it takes no room in the column and the screen below starts at the top of the shell.
      // WARN: `pointer-events-none` belongs on the root, not the row inside it — on the row the header's own box still swallows every tap on the content passing beneath it. Each control re-enables it for itself.
      className={cn(
        "pointer-events-none sticky top-0 z-30 -mb-(--app-header-inset) pt-[env(safe-area-inset-top)]",
        className,
      )}
    >
      <div className="flex h-(--app-header-height) items-center gap-2xs px-sm [&>*]:pointer-events-auto">
        {leading}
        {title ? (
          <h1 className={cn("flex-1 truncate px-2xs text-title-md text-ink", titleClassName)}>
            {title}
          </h1>
        ) : (
          <div className="flex-1" />
        )}
        {trailing}
      </div>
    </header>
  );
}
