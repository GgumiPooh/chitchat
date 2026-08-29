"use client";

import { cn, useScrollFade } from "@/shared/lib";
import type { PropsWithChildren, ReactNode } from "react";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "./dialog";

export type DialogShellProps = PropsWithChildren<{
  className?: string;
  hideCloseButton?: boolean;
  isOpen: boolean;
  position?: "center" | "top";
  size?: "sm" | "md" | "lg" | "xl";
  /** A row pinned between the header and the scrolling body — a search field that a scrolled list must not carry away (`EmoticonPackPickerSheet`). */
  toolbar?: ReactNode;
  header: {
    className?: string;
    title: string;
    description?: string;
    isHidden?: boolean;
    /** A control that sits beside the close button — the only thing permitted in the corner (AGENTS.md § 2.4.). */
    action?: ReactNode;
  };
  onClose: () => void;
  onCloseAutoFocus?: (event: Event) => void;
  onOpenAutoFocus?: (event: Event) => void;
}>;

// INFO: DESIGN.md § 7.4. `lg` is the sheet's own width; `xl` is the message column's, for the § 6.2.2. expanded body that was drawn at that width.
const SIZE_CLASS_NAME = {
  sm: "w-[calc(100%_-_var(--overlay-left)_-_var(--spacing-xl))] max-w-[360px]",
  md: "w-[calc(100%_-_var(--overlay-left)_-_var(--spacing-xl))] max-w-[440px]",
  lg: "w-[calc(100%_-_var(--overlay-left)_-_var(--spacing-xl))] max-w-[var(--sheet-max-width)]",
  xl: "w-[calc(100%_-_var(--overlay-left)_-_var(--spacing-xl))] max-w-[var(--content-max-width)]",
};

/**
 * AGENTS.md § 4.1. The `Dialog` composition `Modal` and `BottomSheet`'s desktop
 * path both draw — a sheet becomes a centered dialog at `md`, and this is the one
 * place that composition is written.
 */
export function DialogShell({
  className,
  hideCloseButton,
  isOpen,
  position = "center",
  size = "sm",
  header,
  toolbar,
  children,
  onClose,
  onCloseAutoFocus,
  onOpenAutoFocus,
}: DialogShellProps) {
  const { maskStyle, scrollRef } = useScrollFade("to bottom");

  return (
    <Dialog open={isOpen} onOpenChange={handleOpenChange}>
      <DialogContent
        className={cn(
          SIZE_CLASS_NAME[size],
          position === "top" && "top-md translate-y-0",
          className,
        )}
        showCloseButton={!hideCloseButton}
        onCloseAutoFocus={onCloseAutoFocus}
        onOpenAutoFocus={onOpenAutoFocus}
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
        {header.isHidden ? (
          <>
            <DialogTitle className="sr-only">{header.title}</DialogTitle>
            {/* INFO: Holds the first row clear of the corner's 44px close button, which the visible header's own height does elsewhere. */}
            {!hideCloseButton && <div className="h-6" aria-hidden />}
          </>
        ) : (
          <DialogHeader className={cn(!hideCloseButton && "pr-11", header.className)}>
            <DialogTitle>{header.title}</DialogTitle>
            {header.description && <DialogDescription>{header.description}</DialogDescription>}
          </DialogHeader>
        )}
        {toolbar && <div className="shrink-0">{toolbar}</div>}
        {/* WARN: `min-h-0` clears the flex item's content-based floor, or this never shrinks below `children`'s own height for `max-h` on `DialogContent` to cut into — the box would just grow past it instead of scrolling. */}
        <div
          ref={scrollRef}
          className="-mx-lg -mt-1 scrollbar-hidden min-h-0 flex-1 overflow-y-auto px-lg pt-1 after:block after:h-lg"
          style={maskStyle}
        >
          {children}
        </div>
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
