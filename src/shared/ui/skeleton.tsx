import { cn } from "@/shared/lib";
import type { ComponentProps } from "react";

export type SkeletonProps = ComponentProps<"span"> & {
  className?: string;
};

// WARN: DESIGN.md § 7.8. Never used for optimistic messages — those render at 60% opacity instead.
export function Skeleton({ className, ...props }: SkeletonProps) {
  return (
    <span
      className={cn("block animate-pulse rounded-xs bg-surface-strong", className)}
      {...props}
    />
  );
}
