"use client";

import { cn } from "@/shared/lib";
import { XIcon } from "lucide-react";
import { Dialog as DialogPrimitive } from "radix-ui";
import type { ComponentProps } from "react";

// WARN: AGENTS.md § 2.4. Composition primitive — compose it inside `@/shared/ui` only, never in a screen.

export function Dialog(props: ComponentProps<typeof DialogPrimitive.Root>) {
  return <DialogPrimitive.Root {...props} />;
}

export function DialogPortal(props: ComponentProps<typeof DialogPrimitive.Portal>) {
  return <DialogPrimitive.Portal {...props} />;
}

export function DialogClose(props: ComponentProps<typeof DialogPrimitive.Close>) {
  return <DialogPrimitive.Close {...props} />;
}

export function DialogOverlay({
  className,
  ...props
}: ComponentProps<typeof DialogPrimitive.Overlay>) {
  return (
    <DialogPrimitive.Overlay
      className={cn(
        "fixed inset-0 z-50 bg-scrim/45 data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:animate-in data-[state=open]:fade-in-0",
        className,
      )}
      {...props}
    />
  );
}

export function DialogContent({
  className,
  children,
  showCloseButton = true,
  ...props
}: ComponentProps<typeof DialogPrimitive.Content> & { showCloseButton?: boolean }) {
  return (
    <DialogPortal>
      <DialogOverlay />
      {/* WARN: Centred on the visual viewport, not the layout one — the portal puts this outside the shell, so `top-1/2` would centre it on a box the keyboard never shrinks (DESIGN.md § 3.4.). */}
      <DialogPrimitive.Content
        className={cn(
          "fixed top-[calc(var(--viewport-top,0px)_+_var(--viewport-height,100dvh)_/_2)] left-1/2 z-50 grid max-h-[calc(var(--viewport-height,100dvh)_-_var(--spacing-xl))] -translate-x-1/2 -translate-y-1/2 gap-md overflow-y-auto rounded-lg border border-hairline bg-canvas p-lg shadow-floating duration-200 outline-none data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=closed]:zoom-out-95 data-[state=open]:animate-in data-[state=open]:fade-in-0 data-[state=open]:zoom-in-95",
          className,
        )}
        {...props}
      >
        {children}
        {showCloseButton && (
          <DialogPrimitive.Close
            className="absolute top-md right-md inline-flex size-11 cursor-pointer items-center justify-center rounded-full text-meta transition-colors outline-none hover:bg-surface-soft hover:text-ink focus-visible:ring-2 focus-visible:ring-primary active:bg-surface-strong"
            aria-label="닫기"
          >
            <XIcon className="pointer-events-none size-5" strokeWidth={1.75} />
          </DialogPrimitive.Close>
        )}
      </DialogPrimitive.Content>
    </DialogPortal>
  );
}

export function DialogHeader({ className, ...props }: ComponentProps<"div">) {
  return <div className={cn("flex flex-col gap-2xs", className)} {...props} />;
}

export function DialogTitle({ className, ...props }: ComponentProps<typeof DialogPrimitive.Title>) {
  return <DialogPrimitive.Title className={cn("text-display-sm text-ink", className)} {...props} />;
}

export function DialogDescription({
  className,
  ...props
}: ComponentProps<typeof DialogPrimitive.Description>) {
  return (
    <DialogPrimitive.Description className={cn("text-body-sm text-meta", className)} {...props} />
  );
}
