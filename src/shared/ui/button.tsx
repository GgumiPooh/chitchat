import { cn } from "@/shared/lib";
import { cva, type VariantProps } from "class-variance-authority";
import { Slot } from "radix-ui";
import type { ComponentProps } from "react";

// INFO: DESIGN.md § 7.1. 48 tall, not the 44 tap-target floor: full-width buttons read cramped at 44.
const buttonVariants = cva(
  "inline-flex min-h-12 w-full shrink-0 cursor-pointer items-center justify-center gap-xs rounded-md px-md py-sm text-button-md whitespace-nowrap transition-colors outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 focus-visible:ring-offset-canvas disabled:cursor-not-allowed [&_svg]:pointer-events-none [&_svg]:shrink-0",
  {
    variants: {
      variant: {
        primary:
          "bg-primary text-on-primary hover:bg-primary-hover active:bg-primary-pressed disabled:bg-primary-disabled",
        secondary:
          "border border-hairline-strong bg-canvas text-ink hover:bg-surface-soft active:bg-surface-strong disabled:opacity-50",
        ghost:
          "bg-transparent text-ink hover:bg-surface-soft active:bg-surface-strong disabled:opacity-50",
        destructive:
          "bg-semantic-error text-on-semantic-error hover:bg-semantic-error-hover active:bg-semantic-error-pressed disabled:opacity-50",
      },
    },
    defaultVariants: {
      variant: "primary",
    },
  },
);

export type ButtonProps = ComponentProps<"button"> &
  VariantProps<typeof buttonVariants> & {
    className?: string;
    asChild?: boolean;
  };

export function Button({ className, variant, asChild, type = "button", ...props }: ButtonProps) {
  const Comp = asChild ? Slot.Root : "button";

  return (
    <Comp
      className={cn(buttonVariants({ variant }), className)}
      type={asChild ? undefined : type}
      {...props}
    />
  );
}
