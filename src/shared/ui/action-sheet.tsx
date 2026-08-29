"use client";

import { APP_HEADER_ID, BOTTOM_OVERLAY_ID } from "@/shared/config";
import {
  A_SECOND,
  cn,
  useIsDesktop,
  useRovingTabIndex,
  type LongPressPoint,
  type Nullable,
} from "@/shared/lib";
import {
  useEffect,
  useEffectEvent,
  useMemo,
  useRef,
  useState,
  type ComponentProps,
  type FC,
  type ReactNode,
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
   * The pointer position a hold or right-click fired at (`useLongPress`'s own
   * point), for a menu pinned to where the gesture happened rather than to
   * `anchorRef`'s whole element — the message action sheet's bubble can run
   * taller than the visible area, and anchoring below it can land the menu off
   * screen (`DESIGN.md § 7.5.`). Takes precedence over `anchorRef` while set.
   */
  anchorPoint?: LongPressPoint;
  /**
   * `"menu"` keeps the `Popover` below `md` too, pinned to `anchorRef` — for a
   * sheet opened by holding the thing it acts on, where a bottom sheet moves the
   * eye away from it (`DESIGN.md § 7.5.`). Defaults to the width-driven choice.
   */
  presentation?: "sheet" | "menu";
  reactionSlot?: ReactNode;
  onClose: () => void;
};

// INFO: DESIGN.md § 7.5. Rows follow the chip ladder; destructive rows recolour the label only.
export function ActionSheet({
  className,
  isOpen,
  header,
  items,
  anchorRef,
  anchorPoint,
  presentation = "sheet",
  reactionSlot,
  onClose,
}: ActionSheetProps) {
  // INFO: Whether the row that closed this sheet asked to keep focus — read by `handleCloseAutoFocus` below.
  const keepsFocus = useRef(false);
  const isDesktop = useIsDesktop();
  const isMenu = anchorRef !== undefined && (isDesktop || presentation === "menu");
  // INFO: Callers clear the subject on close, and the exit animation would otherwise play over an empty title and no rows.
  // INFO: React's "adjust state during render", keyed on visible text & icon presence since `header`/`items` are rebuilt every render.
  const snapshotKey = [
    header.title,
    ...items.map((item) => `${item.label}:${item.Icon ? "1" : "0"}`),
  ].join("\u0000");
  const [snapshot, setSnapshot] = useState({ key: snapshotKey, header, items, reactionSlot });
  if (isOpen && (snapshot.key !== snapshotKey || snapshot.reactionSlot !== reactionSlot)) {
    setSnapshot({ key: snapshotKey, header, items, reactionSlot });
  }
  const {
    header: shownHeader,
    items: shownItems,
    reactionSlot: shownReactionSlot,
  } = isOpen ? { header, items, reactionSlot } : snapshot;
  const menuRef = useRef<Nullable<HTMLDivElement>>(null);
  // INFO: The rect is re-measured on open and on a resize/visual-viewport change, never continuously — the trigger is an `IconButton` whose press-bloom scales it for the next 300ms, and a live-tracked anchor would drag the menu along with that animation.
  const [anchorRect, setAnchorRect] = useState<Nullable<DOMRect>>(null);
  const [collisionPadding, setCollisionPadding] = useState({
    top: 16,
    right: 16,
    bottom: 16,
    left: 16,
  });
  useEffect(() => {
    // WARN: No reset on close — the sheet stays mounted through its exit animation (`Presence`), and nulling the rect here would snap it to the top-left corner mid-close instead of holding its last position.
    // INFO: A pointer anchor is a snapshot of where the gesture fired, not a live element with a rect to measure, so this effect only runs for the `anchorRef` case.
    if (!isOpen || !isMenu || anchorPoint) {
      return;
    }

    const measure = () =>
      setAnchorRect(anchorRef?.current?.getBoundingClientRect() ?? new DOMRect());
    measure();
    window.addEventListener("resize", measure);
    window.visualViewport?.addEventListener("resize", measure);
    window.visualViewport?.addEventListener("scroll", measure);
    return () => {
      window.removeEventListener("resize", measure);
      window.visualViewport?.removeEventListener("resize", measure);
      window.visualViewport?.removeEventListener("scroll", measure);
    };
  }, [isOpen, isMenu, anchorRef, anchorPoint]);
  useEffect(() => {
    if (!isOpen || !isMenu) {
      return;
    }

    // INFO: Keeps the menu clear of the fixed header, composer, rail, and side panel (AGENTS.md § 4.1, § 4.4) rather than colliding with or overlapping them.
    const measure = () => {
      const headerHeight =
        document.getElementById(APP_HEADER_ID)?.getBoundingClientRect().height ?? 0;
      const bottomInset =
        document.getElementById(BOTTOM_OVERLAY_ID)?.getBoundingClientRect().height ?? 0;
      const computedStyle = getComputedStyle(document.documentElement);
      const railWidth = parseFloat(computedStyle.getPropertyValue("--rail-width")) || 0;
      const paneWidth = parseFloat(computedStyle.getPropertyValue("--pane-width")) || 0;
      // WARN: The two lengths and not `--overlay-left`, which computes to an unresolved `calc()` a `parseFloat` reads as its first term; the attribute is the same condition `theme.css` binds that token on.
      const isOverPanel = Boolean(document.querySelector("[data-full-bleed-overlay]"));
      const leftInset = isOverPanel ? railWidth : railWidth + paneWidth;

      setCollisionPadding({
        top: headerHeight + 16,
        right: 16,
        bottom: bottomInset + 16,
        left: leftInset + 16,
      });
    };
    measure();
    window.addEventListener("resize", measure);
    return () => window.removeEventListener("resize", measure);
  }, [isOpen, isMenu]);
  const virtualAnchorRef = useMemo(() => {
    const rect = anchorPoint ? new DOMRect(anchorPoint.x, anchorPoint.y, 0, 0) : anchorRect;
    return { current: { getBoundingClientRect: () => rect ?? new DOMRect() } };
  }, [anchorPoint, anchorRect]);
  const closeFromOutside = useEffectEvent(onClose);
  // INFO: Radix dismisses a touch on the outside only once its `click` lands, and a finger that moves never lands one — so the menu closes on the `pointerdown` itself.
  useEffect(() => {
    if (!isMenu || !isOpen) {
      return;
    }

    const handlePointerDown = (event: PointerEvent) => {
      if (menuRef.current?.contains(event.target as Node)) {
        return;
      }

      swallowNextClick();
      closeFromOutside();
    };
    document.addEventListener("pointerdown", handlePointerDown, true);
    return () => document.removeEventListener("pointerdown", handlePointerDown, true);
  }, [isMenu, isOpen]);
  // INFO: A scroll anywhere outside the popover — the chat room's own scroller, the document on other screens, a side panel — leaves the menu pinned to a bubble that has since moved out from under it, so any such scroll closes it instead.
  useEffect(() => {
    if (!isMenu || !isOpen) {
      return;
    }

    const handleScroll = (event: Event) => {
      if (menuRef.current?.contains(event.target as Node)) {
        return;
      }

      closeFromOutside();
    };
    document.addEventListener("scroll", handleScroll, true);
    return () => document.removeEventListener("scroll", handleScroll, true);
  }, [isMenu, isOpen]);
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
              "flex w-full cursor-pointer items-center rounded-md text-left transition-colors outline-none group-active:bg-surface-pressed hover:bg-surface-strong focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-inset active:bg-surface-pressed",
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
    // INFO: Determine align based on anchor horizontal position relative to the main pane width so left messages open towards the center and right messages open towards the center.
    const menuAlign = (() => {
      const x = anchorPoint?.x ?? anchorRect?.left;
      if (x === undefined || typeof window === "undefined") {
        return "end";
      }
      return x < window.innerWidth / 2 ? "start" : "end";
    })();

    return (
      <Popover open={isOpen} onOpenChange={handleOpenChange}>
        <PopoverAnchor virtualRef={virtualAnchorRef} />
        <PopoverContent
          ref={menuRef}
          className={cn(
            "flex flex-col gap-1.5 outline-none data-[side=top]:flex-col-reverse",
            shownReactionSlot
              ? "w-72 max-w-[calc(100vw-2rem)]"
              : isDesktop
                ? "w-64"
                : "w-max max-w-[calc(100vw-2rem)] min-w-44",
            className,
          )}
          align={menuAlign}
          // INFO: Above the anchor first on mobile — a held bubble still has the thumb on it. On desktop, bottom first.
          side={isDesktop ? "bottom" : "top"}
          collisionPadding={collisionPadding}
          role="menu"
          aria-label={shownHeader.title}
          onKeyDown={handleMenuKeyDown}
          // INFO: Suppress auto-focus so the first reaction/menuitem doesn't immediately get focused on open; keyboard navigation still works via Tab or arrow keys.
          onOpenAutoFocus={(event) => event.preventDefault()}
        >
          {shownReactionSlot && <div className="w-full shrink-0">{shownReactionSlot}</div>}
          <div className="w-full rounded-2xl border border-hairline bg-canvas p-2xs shadow-floating">
            {rows}
          </div>
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
        {shownReactionSlot && <div className="mb-2">{shownReactionSlot}</div>}
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
      {shownReactionSlot && <div className="mb-2">{shownReactionSlot}</div>}
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

// INFO: The dismissing gesture's own `click`, spent before it reaches anything — a press that closed the menu must not also activate what was under it.
// WARN: Outside the component on purpose. Closing tears the effect above down synchronously, a discrete `pointerdown` flushing its own `setState`, so a listener held by that effect is already gone by the time the `click` lands.
function swallowNextClick() {
  const swallow = (event: Event) => {
    event.stopPropagation();
    event.preventDefault();
    disarm();
  };
  const disarm = () => {
    clearTimeout(expiry);
    document.removeEventListener("click", swallow, true);
  };
  // WARN: A finger that moves never lands a `click`, and an armed listener with nothing to spend it on would eat the reader's next tap instead.
  const expiry = setTimeout(disarm, A_SECOND / 2);
  document.addEventListener("click", swallow, true);
}
