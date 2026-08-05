import { cn } from "@/shared/lib";
import type { PropsWithChildren } from "react";

export type ContainerProps = PropsWithChildren<{
  className?: string;
  size?: "sm" | "md";
  id?: string;
}>;

// INFO: DESIGN.md § 3.3. The only source of the shell width — screens never hardcode `max-w-*`.
export function Container({ className, size = "md", children, id }: ContainerProps) {
  return (
    <div
      className={cn(
        "mx-auto w-full px-md",
        size === "md" && "max-w-(--container-app)",
        size === "sm" && "max-w-(--container-app-narrow)",
        className,
      )}
      id={id}
    >
      {children}
    </div>
  );
}
