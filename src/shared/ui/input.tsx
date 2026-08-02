import { cn } from "@/shared/lib";
import type { ComponentProps } from "react";

export type InputProps = ComponentProps<"input"> & {
  className?: string;
};

// INFO: DESIGN.md § 7.2. Error styling keys off `aria-invalid`, never a class, so a11y cannot disagree.
export function Input({ className, type = "text", ...props }: InputProps) {
  return (
    <input
      className={cn(
        "min-h-12 w-full min-w-0 rounded-md border border-hairline-strong bg-canvas px-3.5 py-sm text-body-md text-ink transition-colors outline-none selection:bg-primary-tint placeholder:text-meta-soft hover:border-ink/20 focus-visible:border-primary focus-visible:ring-2 focus-visible:ring-primary/20 disabled:cursor-not-allowed disabled:border-hairline disabled:bg-surface-strong disabled:text-meta-soft aria-invalid:border-semantic-error aria-invalid:ring-2 aria-invalid:ring-semantic-error/20",
        className,
      )}
      type={type}
      {...props}
    />
  );
}
