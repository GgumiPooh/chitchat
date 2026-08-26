import { cn } from "@/shared/lib";
import type { PropsWithChildren } from "react";
import { Drawer, DrawerContent, DrawerDescription, DrawerTitle } from "./drawer";

export type SideDrawerProps = PropsWithChildren<{
  className?: string;
  isOpen: boolean;
  onClose: () => void;
}>;

export function SideDrawer({ className, isOpen, onClose, children }: SideDrawerProps) {
  return (
    <Drawer open={isOpen} direction="left" onOpenChange={(open) => !open && onClose()}>
      <DrawerContent
        className={cn(
          "fixed inset-y-0 right-auto left-0 z-50 flex w-[85vw] max-w-[var(--content-max-width)] flex-col bg-surface-soft shadow-floating outline-none",
          className,
        )}
      >
        <DrawerTitle className="sr-only">메뉴</DrawerTitle>
        <DrawerDescription className="sr-only">사이드 메뉴입니다.</DrawerDescription>
        {children}
      </DrawerContent>
    </Drawer>
  );
}
