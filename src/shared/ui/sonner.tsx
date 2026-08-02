"use client";

import { cn } from "@/shared/lib";
import { useTheme } from "next-themes";
import type { CSSProperties } from "react";
import { Toaster as SonnerToaster, type ToasterProps as SonnerToasterProps } from "sonner";

export type ToasterProps = SonnerToasterProps & {
  className?: string;
};

export function Toaster({ className, style, toastOptions, ...props }: ToasterProps) {
  const { resolvedTheme } = useTheme();

  return (
    <SonnerToaster
      className={cn("toaster group", className)}
      theme={resolvedTheme === "dark" ? "dark" : "light"}
      position="bottom-center"
      style={
        {
          "--normal-bg": "var(--color-canvas)",
          "--normal-text": "var(--color-ink)",
          "--normal-border": "var(--color-hairline)",
          "--error-bg": "var(--color-canvas)",
          "--error-text": "var(--color-semantic-error)",
          "--error-border": "var(--color-hairline)",
          "--border-radius": "var(--radius-md)",
          ...style,
        } as CSSProperties
      }
      toastOptions={{
        ...toastOptions,
        style: {
          boxShadow: "var(--shadow-floating)",
          fontSize: "var(--text-body-sm)",
          lineHeight: "var(--text-body-sm--line-height)",
          ...toastOptions?.style,
        },
      }}
      {...props}
    />
  );
}

export { toast } from "sonner";
