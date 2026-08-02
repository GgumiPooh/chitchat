import { cn } from "@/shared/lib";
import type { ComponentProps, FC } from "react";

export type IconButtonProps = Omit<ComponentProps<"button">, "aria-label"> & {
  className?: string;
  iconClassName?: string;
  Icon: FC<ComponentProps<"svg">>;
  "aria-label": string;
};

// INFO: DESIGN.md § 3.2., § 7.1. The 44 target pads a 20 glyph, and the ring takes no offset.
export function IconButton({
  className,
  iconClassName,
  Icon,
  type = "button",
  ...props
}: IconButtonProps) {
  return (
    <button
      className={cn(
        "inline-flex size-11 cursor-pointer items-center justify-center rounded-full bg-transparent text-meta transition-colors outline-none hover:bg-surface-soft hover:text-ink focus-visible:ring-2 focus-visible:ring-primary active:bg-surface-strong disabled:cursor-not-allowed disabled:opacity-40",
        className,
      )}
      type={type}
      {...props}
    >
      <Icon className={cn("pointer-events-none size-5", iconClassName)} strokeWidth={1.75} />
    </button>
  );
}
