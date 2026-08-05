"use client";

import { cn } from "@/shared/lib";
import type { PropsWithChildren } from "react";
import { Drawer, DrawerContent, DrawerDescription, DrawerTitle } from "./drawer";

export type BottomSheetProps = PropsWithChildren<{
  className?: string;
  isOpen: boolean;
  header: {
    className?: string;
    title: string;
    description?: string;
    // INFO: The title stays required even when hidden — Radix names the dialog from it and warns when it is missing.
    isHidden?: boolean;
  };
  onClose: () => void;
}>;

// INFO: DESIGN.md § 7.5. Inset floating card, not a full-bleed sheet. The grab handle is the only dismiss control.
export function BottomSheet({ className, isOpen, header, children, onClose }: BottomSheetProps) {
  return (
    <Drawer open={isOpen} direction="bottom" onOpenChange={handleOpenChange}>
      <DrawerContent
        className={cn(
          "mx-sm mb-sm flex h-auto! max-h-[calc(90dvh-var(--spacing-sm))] flex-col gap-y-sm overflow-hidden rounded-xl border border-hairline bg-canvas p-md pb-[max(var(--spacing-md),env(safe-area-inset-bottom))] shadow-floating focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-inset",
          className,
        )}
      >
        <div className="mx-auto block h-1.5 w-12 shrink-0 rounded-full bg-hairline-strong" />
        <div className="scrollbar-hidden overflow-y-auto overscroll-contain">
          {header.isHidden ? (
            <DrawerTitle className="sr-only">{header.title}</DrawerTitle>
          ) : (
            // WARN: The gap to the body lives here, not as `space-y` on the parent — a hidden header is still a flow sibling and would leave the gap behind.
            <div className={cn("mb-xs space-y-2xs", header.className)}>
              <DrawerTitle className="text-center">{header.title}</DrawerTitle>
              {header.description && (
                <DrawerDescription className="text-center whitespace-pre-line">
                  {header.description}
                </DrawerDescription>
              )}
            </div>
          )}
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
