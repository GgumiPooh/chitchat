"use client";

import { cn } from "@/shared/lib";
import { useRef, type ComponentProps, type FC } from "react";
import { BottomSheet, type BottomSheetProps } from "./bottom-sheet";
import { HapticTap } from "./haptic-tap";

export type ActionSheetItem = {
  label: string;
  Icon?: FC<ComponentProps<"svg">>;
  variant?: "default" | "destructive";
  /**
   * This row's action moves focus on purpose, so the sheet must not take it back
   * as it closes (`REQUIREMENTS.md § 8.13.`'s 수정 focuses the composer).
   *
   * WARN: Opt-in per row, and it must stay that way. Every other row leaves focus
   * where it was, and suppressing the restore for all of them drops a keyboard user
   * on `body` with the tab order restarted — on all nine sheets in the app, for the
   * sake of the one action that needed it.
   */
  keepsFocus?: boolean;
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
  // INFO: Whether the row that closed this sheet asked to keep focus — read by `handleCloseAutoFocus` below.
  const keepsFocus = useRef(false);

  return (
    <BottomSheet
      className={className}
      isOpen={isOpen}
      header={header}
      onClose={onClose}
      onCloseAutoFocus={handleCloseAutoFocus}
    >
      <ul className="flex flex-col gap-2xs">
        {items.map((item) => (
          <li key={item.label} className="group relative flex">
            <button
              className={cn(
                "inline-flex min-h-11 w-full cursor-pointer items-center justify-center gap-xs rounded-md bg-surface-soft px-md py-sm text-button-md transition-colors outline-none group-active:bg-surface-pressed hover:bg-surface-strong focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-inset active:bg-surface-pressed",
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
            {/* INFO: Every row is a committed choice, so none of them is left silent. */}
            {/* WARN: `keepsScroll` — the rows are the sheet's whole surface, so a finger pulling it down to dismiss lands here, and the switch would keep that drag and end it as a tap on the row (`DESIGN.md § 7.15.1.`). */}
            <HapticTap className="touch-pan-y" forwardsTap keepsScroll />
          </li>
        ))}
      </ul>
    </BottomSheet>
  );

  function handleSelect(item: ActionSheetItem) {
    keepsFocus.current = item.keepsFocus ?? false;
    item.onSelect();
    onClose();
  }

  /**
   * WARN: A row that declares `keepsFocus` has moved focus on purpose, and the sheet
   * unmounts a few hundred ms later at the end of its exit animation. Radix restores
   * focus to the opener there, which blurs whatever the action had just focused — on
   * every platform, not only iOS.
   *
   * WARN: Restoring is the default and the accessible behaviour, and every row that
   * has not asked keeps it. A dismissal keeps it too, or a keyboard user who backs
   * out of the sheet is left on `body` with the tab order restarted.
   */
  function handleCloseAutoFocus(event: Event) {
    if (keepsFocus.current) {
      event.preventDefault();
    }

    keepsFocus.current = false;
  }
}
