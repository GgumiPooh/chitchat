import { cn } from "@/shared/lib";
import type { ComponentProps, FC, ReactNode } from "react";

export type EmptyStateProps = {
  className?: string;
  iconClassName?: string;
  Icon: FC<ComponentProps<"svg">>;
  description: string;
  action?: ReactNode;
};

// INFO: DESIGN.md § 7.6. No illustration by design — stock art is the clearest tell of a template build.
export function EmptyState({
  className,
  iconClassName,
  Icon,
  description,
  action,
}: EmptyStateProps) {
  return (
    <div
      className={cn(
        "flex flex-col items-center gap-sm rounded-md border border-hairline-soft bg-surface-soft p-2xl text-center",
        className,
      )}
    >
      <Icon className={cn("size-6 text-meta-soft", iconClassName)} strokeWidth={1.75} />
      <p className="text-body-md text-meta">{description}</p>
      {action}
    </div>
  );
}
