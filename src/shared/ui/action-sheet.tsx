"use client";

import { cn, useIsDesktop, useRovingTabIndex, type Nullable } from "@/shared/lib";
import {
  useEffect,
  useEffectEvent,
  useMemo,
  useRef,
  useState,
  type ComponentProps,
  type FC,
  type RefObject,
} from "react";
import { BottomSheet, type BottomSheetProps } from "./bottom-sheet";
import { DialogShell } from "./dialog-shell";
import { HapticTap } from "./haptic-tap";
import { Popover, PopoverAnchor, PopoverContent } from "./popover";

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
  /**
   * AGENTS.md § 4.1. At `md`, with this set, the sheet becomes a `Popover` pinned
   * to the element it names; at `md` with no anchor it falls back to a centered
   * `Modal`. Below `md` it is unused — the mobile sheet stays a `BottomSheet`.
   */
  anchorRef?: RefObject<Nullable<HTMLElement>>;
  /**
   * `"menu"` keeps the `Popover` below `md` too, pinned to `anchorRef` — for a
   * sheet opened by holding the thing it acts on, where a bottom sheet moves the
   * eye away from it (`DESIGN.md § 7.5.`). Defaults to the width-driven choice.
   */
  presentation?: "sheet" | "menu";
  onClose: () => void;
};

// INFO: DESIGN.md § 7.5. Rows follow the chip ladder; destructive rows recolour the label only.
export function ActionSheet({
  className,
  isOpen,
  header,
  items,
  anchorRef,
  presentation = "sheet",
  onClose,
}: ActionSheetProps) {
  // INFO: Whether the row that closed this sheet asked to keep focus — read by `handleCloseAutoFocus` below.
  const keepsFocus = useRef(false);
  const isDesktop = useIsDesktop();
  const isMenu = anchorRef !== undefined && (isDesktop || presentation === "menu");
  // INFO: Callers clear the subject on close, and the exit animation would otherwise play over an empty title and no rows.
  // INFO: React's "adjust state during render", keyed on the visible text since `header`/`items` are rebuilt every render.
  const snapshotKey = [header.title, ...items.map((item) => item.label)].join("\u0000");
  const [snapshot, setSnapshot] = useState({ key: snapshotKey, header, items });
  if (isOpen && snapshot.key !== snapshotKey) {
    setSnapshot({ key: snapshotKey, header, items });
  }
  const { header: shownHeader, items: shownItems } = isOpen ? { header, items } : snapshot;
  // WARN: The anchor's rect is read once per opening, not tracked — the trigger is an `IconButton` whose press-bloom scales it for the next 300ms, and a live anchor drags the menu along with it.
  const anchorRectRef = useRef<Nullable<DOMRect>>(null);
  useEffect(() => {
    if (!isOpen) {
      anchorRectRef.current = null;
    }
  }, [isOpen]);
  const virtualAnchorRef = useMemo(
    () => ({
      current: {
        getBoundingClientRect: () =>
          (anchorRectRef.current ??= anchorRef?.current?.getBoundingClientRect() ?? new DOMRect()),
      },
    }),
    [anchorRef],
  );
  const menuRef = useRef<Nullable<HTMLDivElement>>(null);
  const isTouchMenu = isMenu && !isDesktop;
  const closeFromOutside = useEffectEvent(onClose);
  // INFO: Radix dismisses a touch on the outside only once its `click` lands, and a finger that moves never lands one — so the menu closes on the touch itself, and spends the click so the row under it is not tapped through.
  useEffect(() => {
    if (!isTouchMenu || !isOpen) {
      return;
    }

    const swallowClick = (event: Event) => event.stopPropagation();
    const disarm = () => document.removeEventListener("click", swallowClick, true);
    const handlePointerDown = (event: PointerEvent) => {
      if (menuRef.current?.contains(event.target as Node)) {
        return;
      }

      document.addEventListener("click", swallowClick, true);
      document.addEventListener("pointerup", () => setTimeout(disarm), { once: true });
      closeFromOutside();
    };
    document.addEventListener("pointerdown", handlePointerDown, true);
    return () => {
      document.removeEventListener("pointerdown", handlePointerDown, true);
      disarm();
    };
  }, [isTouchMenu, isOpen]);
  const handleMenuKeyDown = useRovingTabIndex({
    orientation: "vertical",
    selector: '[role="menuitem"]',
  });

  const rows = (
    <ul className="grid grid-cols-1 gap-2xs">
      {shownItems.map((item) => (
        <li key={item.label} className="group relative">
          <button
            className={cn(
              "flex w-full cursor-pointer items-center rounded-md transition-colors outline-none group-active:bg-surface-pressed hover:bg-surface-strong focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-inset active:bg-surface-pressed",
              // INFO: Each row centres its own icon and label on a phone — never a shared column sized by the longest label.
              isMenu || isDesktop ? "justify-start" : "justify-center",
              // INFO: A phone's menu sits beside a bubble, so it takes the bubble's density rather than the sheet's.
              isMenu && !isDesktop
                ? "min-h-10 px-sm py-xs text-body-sm font-medium"
                : "min-h-11 px-md py-sm text-button-md",
              isMenu
                ? "bg-transparent hover:bg-surface-soft active:bg-surface-strong"
                : "bg-surface-soft",
              item.variant === "destructive" ? "text-semantic-error" : "text-ink",
            )}
            type="button"
            role={isMenu ? "menuitem" : undefined}
            onClick={() => handleSelect(item)}
          >
            <span className="inline-flex items-center gap-xs">
              {item.Icon && (
                <item.Icon className="pointer-events-none size-4.5 shrink-0" strokeWidth={1.75} />
              )}
              {item.label}
            </span>
          </button>
          {/* INFO: Every row is a committed choice, so none of them is left silent. */}
          {/* WARN: `keepsScroll` — the rows are the sheet's whole surface, so a finger pulling it down to dismiss lands here, and the switch would keep that drag and end it as a tap on the row (`DESIGN.md § 7.15.1.`). */}
          {!isDesktop && <HapticTap className="touch-pan-y" forwardsTap keepsScroll={!isMenu} />}
        </li>
      ))}
    </ul>
  );

  if (isMenu) {
    return (
      <Popover open={isOpen} onOpenChange={handleOpenChange}>
        <PopoverAnchor virtualRef={virtualAnchorRef} />
        <PopoverContent
          ref={menuRef}
          className={cn(isDesktop ? "w-64" : "w-44", "p-2xs", className)}
          align="end"
          // INFO: Above the anchor first — a held bubble still has the thumb on it, and a menu opening under the thumb opens under the hand.
          side={isDesktop ? "bottom" : "top"}
          collisionPadding={16}
          role="menu"
          aria-label={shownHeader.title}
          onKeyDown={handleMenuKeyDown}
          // INFO: Focusing the first row paints its ring under a thumb that opened the menu by holding, not by keyboard; a hardware keyboard still reaches it with Tab.
          onOpenAutoFocus={isDesktop ? undefined : (event) => event.preventDefault()}
        >
          {rows}
        </PopoverContent>
      </Popover>
    );
  }

  if (isDesktop) {
    return (
      <DialogShell
        className={className}
        isOpen={isOpen}
        size="sm"
        header={{
          title: shownHeader.title,
          description: shownHeader.description,
          className: shownHeader.className,
          isHidden: false,
        }}
        onClose={onClose}
        onCloseAutoFocus={handleCloseAutoFocus}
      >
        {rows}
      </DialogShell>
    );
  }

  return (
    <BottomSheet
      className={className}
      isOpen={isOpen}
      header={shownHeader}
      onClose={onClose}
      onCloseAutoFocus={handleCloseAutoFocus}
    >
      {rows}
    </BottomSheet>
  );

  function handleSelect(item: ActionSheetItem) {
    keepsFocus.current = item.keepsFocus ?? false;
    item.onSelect();
    onClose();
  }

  function handleOpenChange(open: boolean) {
    if (open) {
      return;
    }

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
