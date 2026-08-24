"use client";

import { cn } from "@/shared/lib";
import type { PropsWithChildren, ReactNode } from "react";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "./dialog";

export type ModalProps = PropsWithChildren<{
  className?: string;
  hideCloseButton?: boolean;
  isOpen: boolean;
  position?: "center" | "top";
  size?: "sm" | "md";
  header: {
    className?: string;
    title: string;
    description?: string;
    /** A control that sits beside the close button — the only thing permitted in the corner (AGENTS.md § 2.4.). */
    action?: ReactNode;
  };
  onClose: () => void;
}>;

// INFO: DESIGN.md § 7.4. No size beyond `md` — the shell is 576px, so anything larger is a screen.
const SIZE_CLASS_NAME = {
  sm: "w-[min(360px,100%-var(--spacing-xl))]",
  md: "w-[min(440px,100%-var(--spacing-xl))]",
};

export function Modal({
  className,
  hideCloseButton,
  isOpen,
  position = "center",
  size = "sm",
  header,
  children,
  onClose,
}: ModalProps) {
  return (
    <Dialog open={isOpen} onOpenChange={handleOpenChange}>
      <DialogContent
        className={cn(
          SIZE_CLASS_NAME[size],
          position === "top" && "top-md translate-y-0",
          className,
        )}
        showCloseButton={!hideCloseButton}
      >
        {/* WARN: `pr-11` reserves the close button's own 44px box, so the action lands left of it rather than under it — and it is dropped with the button, or the corner grows a hole where nothing is drawn. */}
        {header.action && (
          <div
            className={cn(
              "absolute top-md right-md flex items-center",
              !hideCloseButton && "pr-11",
            )}
          >
            {header.action}
          </div>
        )}
        <DialogHeader className={header.className}>
          <DialogTitle>{header.title}</DialogTitle>
          {header.description && <DialogDescription>{header.description}</DialogDescription>}
        </DialogHeader>
        {children}
      </DialogContent>
    </Dialog>
  );

  function handleOpenChange(open: boolean) {
    if (open) {
      return;
    }

    onClose();
  }
}
