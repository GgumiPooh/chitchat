"use client";

import { cn, useIsDesktop } from "@/shared/lib";
import type { PropsWithChildren } from "react";
import { DialogShell } from "./dialog-shell";
import { Drawer, DrawerContent, DrawerDescription, DrawerTitle } from "./drawer";

export type BottomSheetProps = PropsWithChildren<{
  className?: string;
  isOpen: boolean;
  /** DESIGN.md § 7.5. Opens at the sheet's own maximum rather than shrink-wrapping its body — for a sheet whose reason to exist is the length of what it holds (`REQUIREMENTS.md § 8.16.`). */
  isTall?: boolean;
  snapPoints?: (number | string)[];
  activeSnapPoint?: number | string | null;
  setActiveSnapPoint?: (snapPoint: number | string | null) => void;
  header: {
    className?: string;
    title: string;
    description?: string;
    // INFO: The title stays required even when hidden — Radix names the dialog from it and warns when it is missing.
    isHidden?: boolean;
  };
  onClose: () => void;
  /**
   * Runs as the sheet closes, before focus is restored to whatever opened it.
   * Calling `preventDefault()` keeps focus wherever it now is — for a caller whose
   * own action moved it deliberately (`REQUIREMENTS.md § 8.13.`).
   *
   * WARN: Restoring focus is the default and the accessible behaviour. Suppress it
   * only when something else has taken focus, never unconditionally, or dismissing
   * the sheet drops the keyboard user at the top of the document.
   */
  onCloseAutoFocus?: (event: Event) => void;
}>;

// INFO: DESIGN.md § 7.5. Inset floating card, not a full-bleed sheet. The grab handle is the only dismiss control.
// INFO: AGENTS.md § 4.1. Component-choice branch — at `md` this renders `DialogShell` (a centered dialog) instead, and vaul is never mounted there.
export function BottomSheet({
  className,
  isOpen,
  isTall = false,
  snapPoints,
  activeSnapPoint,
  setActiveSnapPoint,
  header,
  children,
  onClose,
  onCloseAutoFocus,
}: BottomSheetProps) {
  const isDesktop = useIsDesktop();

  if (isDesktop) {
    return (
      // WARN: DESIGN.md § 7.5. No height here, tall or not — `DialogContent` already caps at `max-h` and shrinks to `children` below it, so a dialog forced to that cap regardless of content opened mostly empty under a short body. `isTall` stays mobile-only: a `Drawer` opens from the bottom of the screen, where a sheet that grows into place as its content streams in reads as the sheet still loading rather than as the answer.
      <DialogShell
        className={className}
        isOpen={isOpen}
        size="lg"
        // INFO: A hidden title is a sheet's affordance — its grab handle names it; a centered dialog with no title reads as empty.
        header={{ ...header, isHidden: false }}
        onClose={onClose}
        onCloseAutoFocus={onCloseAutoFocus}
      >
        {children}
      </DialogShell>
    );
  }

  const hasSnapPoints = Boolean(snapPoints && snapPoints.length > 0);

  return (
    <Drawer
      open={isOpen}
      direction="bottom"
      snapPoints={snapPoints}
      activeSnapPoint={activeSnapPoint}
      setActiveSnapPoint={setActiveSnapPoint}
      onOpenChange={handleOpenChange}
    >
      {/* WARN: AGENTS.md § 4.3. The shell width, re-applied — the same thing `AppHeader` and `BottomOverlay` do and for the same reason. Vaul portals this outside `#app-shell`, so its `fixed` box is laid out against the whole layout viewport, and on a desktop the sheet spanned the window while every other pixel of the app sat in a 576px column. */}
      {/* INFO: DESIGN.md § 7.5.'s `sm` inset is subtracted from the cap rather than left as a margin, so the narrow screen this was written on keeps the exact width it had — `mx-auto` and `mx-sm` cannot both hold, and the gutter is the one expressible as a width. */}
      <DrawerContent
        className={cn(
          // INFO: § 8.16. The maximum below, restated as a height — the sheet opens at the size the reader asked for rather than at the size of the first screenful.
          isTall
            ? "h-[calc(var(--viewport-height,100dvh)_-_var(--header-height,56px)_-_var(--spacing-sm))]!"
            : hasSnapPoints
              ? "h-[calc(var(--viewport-height,100dvh)_-_var(--header-height,56px)_-_var(--spacing-sm))]!"
              : "h-auto!",
          "mx-auto mb-sm flex max-h-[calc(var(--viewport-height,100dvh)_-_var(--header-height,56px)_-_var(--spacing-sm))] w-[calc(100%_-_var(--spacing-sm)*2)] max-w-[calc(var(--sheet-max-width)_-_var(--spacing-sm)*2)] flex-col gap-y-sm overflow-hidden rounded-xl border border-hairline bg-canvas pt-md px-md shadow-floating focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-inset",
          className,
        )}
        onCloseAutoFocus={onCloseAutoFocus}
      >
        <div className="mx-auto block h-1.5 w-12 shrink-0 rounded-full bg-hairline-strong" />
        {header.isHidden ? (
          <DrawerTitle className="sr-only">{header.title}</DrawerTitle>
        ) : (
          // WARN: The gap to the body lives here, not as `space-y` on the parent — a hidden header is still a flow sibling and would leave the gap behind.
          <div className={cn("mb-xs shrink-0 space-y-2xs", header.className)}>
            <DrawerTitle className="text-center">{header.title}</DrawerTitle>
            {header.description && (
              <DrawerDescription className="text-center whitespace-pre-line">
                {header.description}
              </DrawerDescription>
            )}
          </div>
        )}
        {/* WARN: The scroller spans the sheet's padding box and restores the inset itself, so a full-bleed row inside it (`EventColorPicker`'s swatches) reaches the edge instead of overflowing. `overflow-y: auto` computes `overflow-x` to `auto` too, and that overflow was the sheet scrolling sideways. */}
        {/* WARN: `min-h-0` clears the flex item's content-based floor, the same trade `DialogShell`'s own scroll wrapper makes — without it `isTall`'s forced height just grows the sheet past its cap instead of scrolling the body under the header. */}
        <div
          className="-mx-md scrollbar-hidden min-h-0 flex-1 overflow-y-auto overscroll-contain px-md pb-[max(var(--spacing-md),env(safe-area-inset-bottom))]"
          data-vaul-no-drag
        >
          {children}
        </div>
      </DrawerContent>
    </Drawer>
  );

  function handleOpenChange(open: boolean) {
    if (open) {
      return;
    }

    onClose();
  }
}
