"use client";

import { cn } from "@/shared/lib";
import type { PropsWithChildren } from "react";
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
