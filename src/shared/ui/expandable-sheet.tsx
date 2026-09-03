"use client";

import { cn, useIsDesktop, useSheetDrag, type Nullable } from "@/shared/lib";
import { Dialog as DialogPrimitive } from "radix-ui";
import {
  useImperativeHandle,
  useRef,
  type PropsWithChildren,
  type ReactNode,
  type Ref,
} from "react";
import { Modal, type ModalProps } from "./modal";

export type ExpandableSheetHandle = { expand: () => void; collapse: () => void };

export type ExpandableSheetProps = PropsWithChildren<{
  ref?: Ref<ExpandableSheetHandle>;
  className?: string;
  /** Pinned below the scrolling body, inside the sheet's bottom padding, on both mobile and desktop. */
  footer?: ReactNode;
  isOpen: boolean;
  modalSize?: ModalProps["size"];
  /** Rest-mode height in px. */
  restHeight?: number;
  header: {
    className?: string;
    title: string;
    /** A control that sits beside the close button on desktop, and at the right of the visible mobile header row (AGENTS.md § 2.4.). */
    action?: ReactNode;
    /** Mobile only — `true` keeps the current sr-only title with no visible header row (`MiniEmoticonSheet`). Desktop always shows a header. */
    isHidden?: boolean;
  };
  onClose: () => void;
}>;

const DEFAULT_REST_HEIGHT = 380;

/**
 * AGENTS.md § 2.4. The reaction sheet's own shell, generalised: draggable
 * bottom sheet on mobile (two-snap, drag to close/expand), `Modal` from `md`.
 */
export function ExpandableSheet({
  ref,
  className,
  isOpen,
  header,
  footer,
  restHeight = DEFAULT_REST_HEIGHT,
  modalSize = "md",
  children,
  onClose,
}: ExpandableSheetProps) {
  const isDesktop = useIsDesktop();
  const sheetRef = useRef<Nullable<HTMLDivElement>>(null);

  const {
    collapse,
    dragProps,
    dragTranslateY,
    expand,
    expandedHeight,
    handleProps,
    isClosedByDrag,
    isDragging,
    isResettingAfterClose,
    pinnedHeight,
    size,
  } = useSheetDrag({ sheetRef, isOpen, onClose });

  // WARN: `expand`/`collapse` drive the mobile drag sheet's own height; desktop's `Modal` has no such notion, so it stays a no-op there.
  useImperativeHandle(
    ref,
    () => ({
      expand: () => {
        if (!isDesktop) {
          expand();
        }
      },
      collapse: () => {
        if (!isDesktop) {
          collapse();
        }
      },
    }),
    [isDesktop, expand, collapse],
  );

  if (isDesktop) {
    return (
      <Modal
        className={className}
        isOpen={isOpen}
        size={modalSize}
        header={{ className: "pb-2", title: header.title, action: header.action }}
        onClose={onClose}
      >
        {/* INFO: `-mb-lg`가 DialogShell의 `after:h-lg` 여백을 흡수해, 하단 여백이 스크롤 영역 안쪽에 놓입니다. */}
        <div
          className="-mb-lg flex flex-col"
          style={{ height: `calc(${restHeight}px + var(--spacing-lg))` }}
        >
          <div className="min-h-0 flex-1">{children}</div>
          {footer && <div className="shrink-0 pt-sm">{footer}</div>}
        </div>
      </Modal>
    );
  }

  return (
    <DialogPrimitive.Root open={isOpen} onOpenChange={(open: boolean) => !open && onClose()}>
      <DialogPrimitive.Portal>
        <DialogPrimitive.Overlay className="fixed inset-0 z-50 bg-scrim/45 duration-200 data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:animate-in data-[state=open]:fade-in-0" />
        <DialogPrimitive.Content
          ref={sheetRef}
          className={cn(
            "fixed right-0 bottom-[var(--viewport-bottom,0px)] left-(--overlay-left) z-50 mx-auto mb-sm flex w-[calc(100%_-_var(--overlay-left)_-_var(--spacing-sm)*2)] max-w-[calc(var(--content-max-width)_-_var(--spacing-sm)*2)] flex-col overflow-hidden rounded-xl border border-hairline bg-canvas p-md pb-[max(var(--spacing-md),env(safe-area-inset-bottom))] shadow-floating focus:outline-none data-[state=open]:animate-in data-[state=open]:duration-200 data-[state=open]:slide-in-from-bottom-[calc(100%_+_var(--spacing-sm)_+_var(--viewport-bottom,0px))]",
            // WARN: 100% is the sheet's own height — the plain slide utilities left the `mb-sm` + `--viewport-bottom` gap still filled, the same sliver `BottomSheet` clears via `--initial-transform`.
            // WARN: 드래그 제스처로 닫힐 때(isClosedByDrag)는 이미 CSS transition(translateY)으로 화면 아래로 이동했습니다.
            // 이때 Radix의 slide-out-to-bottom 애니메이션이 함께 동작하면 시트가 원래 위치(translateY=0)로 점프한 뒤 다시 아래로 떨어지며 위로 튀어오릅니다.
            isClosedByDrag
              ? "data-[state=closed]:animate-none"
              : "data-[state=closed]:animate-out data-[state=closed]:duration-200 data-[state=closed]:slide-out-to-bottom-[calc(100%_+_var(--spacing-sm)_+_var(--viewport-bottom,0px))]",
            isDragging || isResettingAfterClose
              ? "transition-none!"
              : "transition-[height,transform] duration-200 ease-out",
            className,
          )}
          style={{
            height:
              pinnedHeight !== null
                ? `${pinnedHeight}px`
                : size === "expanded"
                  ? expandedHeight > 0
                    ? `${expandedHeight}px`
                    : "calc(var(--viewport-height,100dvh) - var(--header-height,56px) - var(--spacing-sm))"
                  : `${restHeight}px`,
            transform:
              dragTranslateY > 0
                ? `translateY(${dragTranslateY}px)`
                : isClosedByDrag
                  ? "translateY(100vh)"
                  : undefined,
          }}
          onOpenAutoFocus={(event) => event.preventDefault()}
          {...dragProps}
        >
          {header.isHidden && (
            <DialogPrimitive.Title className="sr-only">{header.title}</DialogPrimitive.Title>
          )}
          {/* 상단 드래그 & 토글 손잡이 */}
          <button
            className={cn(
              "mx-auto -mt-2 mb-2 flex h-6 w-full cursor-grab touch-none items-center justify-center focus-visible:outline-none active:cursor-grabbing",
              "before:absolute before:inset-x-0 before:-top-2 before:h-8 before:content-['']",
            )}
            type="button"
            aria-expanded={size === "expanded"}
            aria-label={
              size === "expanded" ? `${header.title} 창 줄이기` : `${header.title} 창 늘리기`
            }
            {...handleProps}
          >
            <span className="hover:bg-ink-muted block h-1.5 w-12 rounded-full bg-hairline-strong transition-colors" />
          </button>

          {!header.isHidden && (
            <div className={cn("relative mb-2 flex items-center justify-center", header.className)}>
              <DialogPrimitive.Title className="truncate px-11 text-title-md text-ink">
                {header.title}
              </DialogPrimitive.Title>
              {header.action && (
                <div className="absolute right-0 flex items-center">{header.action}</div>
              )}
            </div>
          )}

          {/* 스크롤 가능한 콘텐츠 영역 */}
          <div className="-mx-md -mb-md flex min-h-0 flex-1 flex-col px-md">
            <div className="flex min-h-0 flex-1 flex-col">{children}</div>
            {footer && <div className="shrink-0 pt-sm">{footer}</div>}
          </div>
        </DialogPrimitive.Content>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  );
}
