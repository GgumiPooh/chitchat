"use client";

import { cn, useScrollFade } from "@/shared/lib";
import type { PropsWithChildren, ReactNode } from "react";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "./dialog";

export type DialogShellProps = PropsWithChildren<{
  className?: string;
  hideCloseButton?: boolean;
  isOpen: boolean;
  position?: "center" | "top";
  size?: "sm" | "md" | "lg";
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
}>;

// INFO: DESIGN.md § 7.4. `lg` is the sheet's own width — what a `BottomSheet` becomes at `md` keeps the column it was drawn for.
const SIZE_CLASS_NAME = {
  sm: "w-[min(360px,calc(100%_-_var(--content-left)_-_var(--spacing-xl)))]",
  md: "w-[min(440px,calc(100%_-_var(--content-left)_-_var(--spacing-xl)))]",
  lg: "w-[min(var(--sheet-max-width),calc(100%_-_var(--content-left)_-_var(--spacing-xl)))]",
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
  children,
  onClose,
  onCloseAutoFocus,
}: DialogShellProps) {
  const scrollFade = useScrollFade("to bottom");

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
        {/* WARN: `min-h-0` clears the flex item's content-based floor, or this never shrinks below `children`'s own height for `max-h` on `DialogContent` to cut into — the box would just grow past it instead of scrolling. */}
        <div 
          ref={scrollFade.ref}
          className="scrollbar-hidden min-h-0 flex-1 overflow-y-auto -mx-lg px-lg pt-1 -mt-1 after:block after:h-lg"
          style={scrollFade.maskStyle}
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
