import { cn } from "@/shared/lib";
import type { PropsWithChildren } from "react";

export type BadgeProps = PropsWithChildren<{
  className?: string;
}>;

// INFO: DESIGN.md § 7.3. Sized for the tab-bar unread count; the caller caps the value at `99+`.
export function Badge({ className, children }: BadgeProps) {
  return (
    <span
      className={cn(
        "inline-flex min-h-[18px] w-fit min-w-[18px] items-center justify-center rounded-full bg-unread px-1 text-micro text-on-primary",
        className,
      )}
    >
      {children}
    </span>
  );
}
