import { cn } from "@/shared/lib";
import type { ComponentProps, FC } from "react";

export type IconButtonProps = Omit<ComponentProps<"button">, "aria-label"> & {
  className?: string;
  iconClassName?: string;
  Icon: FC<ComponentProps<"svg">>;
  variant?: "plain" | "floating";
  "aria-label": string;
};

// INFO: DESIGN.md § 7.1. `floating` is the variant that sits over content, so it carries its own surface to stay legible against whatever scrolls beneath it.
const VARIANT_CLASS_NAME: Record<NonNullable<IconButtonProps["variant"]>, string> = {
  plain: "bg-transparent text-meta hover:bg-surface-soft hover:text-ink active:bg-surface-strong",
  floating:
    "glass border border-hairline text-ink shadow-floating hover:bg-canvas active:bg-surface-soft",
};

// INFO: DESIGN.md § 3.2., § 7.1. The 44 target pads a 20 glyph, and the ring takes no offset.
export function IconButton({
  className,
  iconClassName,
  Icon,
  variant = "plain",
  type = "button",
  ...props
}: IconButtonProps) {
  return (
    <button
      className={cn(
        "inline-flex size-11 cursor-pointer items-center justify-center rounded-full transition-colors outline-none focus-visible:ring-2 focus-visible:ring-primary disabled:cursor-not-allowed disabled:opacity-40",
        VARIANT_CLASS_NAME[variant],
        className,
      )}
      type={type}
      {...props}
    >
      <Icon className={cn("pointer-events-none size-5", iconClassName)} strokeWidth={1.75} />
    </button>
  );
}
