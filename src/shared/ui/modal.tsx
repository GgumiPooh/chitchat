"use client";

import type { PropsWithChildren, ReactNode } from "react";
import { DialogShell } from "./dialog-shell";

export type ModalProps = PropsWithChildren<{
  className?: string;
  hideCloseButton?: boolean;
  isOpen: boolean;
  position?: "center" | "top";
  size?: "sm" | "md" | "lg";
  header: {
    className?: string;
    title: string;
    description?: string;
    /** A control that sits beside the close button — the only thing permitted in the corner (AGENTS.md § 2.4.). */
    action?: ReactNode;
  };
  onClose: () => void;
  onCloseAutoFocus?: (event: Event) => void;
  onOpenAutoFocus?: (event: Event) => void;
}>;

export function Modal({
  className,
  hideCloseButton,
  isOpen,
  position,
  size,
  header,
  children,
  onClose,
  onCloseAutoFocus,
  onOpenAutoFocus,
}: ModalProps) {
  return (
    <DialogShell
      className={className}
      hideCloseButton={hideCloseButton}
      isOpen={isOpen}
      position={position}
      size={size}
      header={header}
      onClose={onClose}
      onCloseAutoFocus={onCloseAutoFocus}
      onOpenAutoFocus={onOpenAutoFocus}
    >
      {children}
    </DialogShell>
  );
}
