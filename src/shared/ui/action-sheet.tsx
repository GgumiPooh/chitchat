"use client";

import { cn } from "@/shared/lib";
import type { ComponentProps, FC } from "react";
import { BottomSheet, type BottomSheetProps } from "./bottom-sheet";

export type ActionSheetItem = {
  label: string;
  Icon?: FC<ComponentProps<"svg">>;
  variant?: "default" | "destructive";
  onSelect: () => void;
};

export type ActionSheetProps = {
  className?: string;
  isOpen: boolean;
  items: ActionSheetItem[];
  header: BottomSheetProps["header"];
  onClose: () => void;
};

// INFO: DESIGN.md § 7.5. Rows follow the chip ladder; destructive rows recolour the label only.
export function ActionSheet({ className, isOpen, header, items, onClose }: ActionSheetProps) {
  return (
    <BottomSheet className={className} isOpen={isOpen} header={header} onClose={onClose}>
      <ul className="flex flex-col gap-2xs">
        {items.map((item) => (
          <li key={item.label}>
            <button
              className={cn(
                "inline-flex min-h-11 w-full cursor-pointer items-center justify-center gap-xs rounded-md bg-surface-soft px-md py-sm text-button-md transition-colors outline-none hover:bg-surface-strong focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-inset active:bg-surface-pressed",
                item.variant === "destructive" ? "text-semantic-error" : "text-ink",
              )}
              type="button"
              onClick={() => handleSelect(item)}
            >
              {item.Icon && (
                <item.Icon className="pointer-events-none size-4.5" strokeWidth={1.75} />
              )}
              {item.label}
            </button>
          </li>
        ))}
      </ul>
    </BottomSheet>
  );

  function handleSelect(item: ActionSheetItem) {
    item.onSelect();
    onClose();
  }
}
