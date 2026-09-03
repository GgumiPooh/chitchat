"use client";

import { cn, useIsDesktop, useSheetDrag, type Nullable } from "@/shared/lib";
import { Dialog as DialogPrimitive } from "radix-ui";
import { useRef, type PropsWithChildren } from "react";
import { Modal, type ModalProps } from "./modal";

export type ExpandableSheetProps = PropsWithChildren<{
  className?: string;
  isOpen: boolean;
  header: { className?: string; title: string };
  /** Rest-mode height in px. */
  restHeight?: number;
  modalSize?: ModalProps["size"];
  onClose: () => void;
}>;

const DEFAULT_REST_HEIGHT = 380;

/**
 * AGENTS.md § 2.4. The reaction sheet's own shell, generalised: draggable
 * bottom sheet on mobile (two-snap, drag to close/expand), `Modal` from `md`.
 */
export function ExpandableSheet({
  className,
  isOpen,
  header,
  restHeight = DEFAULT_REST_HEIGHT,
  modalSize = "md",
  children,
  onClose,
}: ExpandableSheetProps) {
  const isDesktop = useIsDesktop();
  const sheetRef = useRef<Nullable<HTMLDivElement>>(null);

  const {
    dragProps,
    dragTranslateY,
    expandedHeight,
    handleProps,
    isClosedByDrag,
    isDragging,
    isResettingAfterClose,
    pinnedHeight,
    size,
  } = useSheetDrag({ sheetRef, isOpen, onClose });

  if (isDesktop) {
    return (
      <Modal
        className={className}
        isOpen={isOpen}
        size={modalSize}
        header={{ className: "pb-2", title: header.title }}
        onClose={onClose}
      >
        {/* INFO: `-mb-lg`가 DialogShell의 `after:h-lg` 여백을 흡수해, 하단 여백이 스크롤 영역 안쪽에 놓입니다. */}
        <div
          className="-mb-lg flex flex-col"
          style={{ height: `calc(${restHeight}px + var(--spacing-lg))` }}
        >
          {children}
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
          <DialogPrimitive.Title className="sr-only">{header.title}</DialogPrimitive.Title>
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

          {/* 스크롤 가능한 콘텐츠 영역 */}
          <div className="-mx-md -mb-md flex min-h-0 flex-1 flex-col px-md">{children}</div>
        </DialogPrimitive.Content>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  );
}
