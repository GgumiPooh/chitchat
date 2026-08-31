"use client";

import type { InlineEmoticonMap } from "@/shared/config";
import {
  cn,
  formatDate,
  formatTime,
  useIsDesktop,
  useScrollFade,
  useSheetDrag,
  type EmoticonItemId,
  type Nullable,
} from "@/shared/lib";
import { MarkdownBody, Modal } from "@/shared/ui";
import { Dialog as DialogPrimitive } from "radix-ui";
import { useEffect, useRef, useState } from "react";
import { MessageText } from "./message-text";

/** REQUIREMENTS.md § 8.16. What a § 6.2.2. cut is hiding — an ordinary bubble's text, or an § 8.15. answer's markdown. */
export type ExpandedBody = {
  createdAt: string;
  inlineEmoticonItemIds: EmoticonItemId[];
  /** REQUIREMENTS.md § 13. Carried rather than read from the room, because an outbox row's emoticons are not in the page's map until its echo lands. */
  inlineEmoticons: InlineEmoticonMap;
  isMarkdown: boolean;
  /** Whoever spoke — a participant's § 8.7. nickname, a § 8.15. answer's provider 별명, or 시스템. */
  senderName: string;
  text: string;
};

export type ExpandedBodySheetProps = {
  className?: string;
  body: Nullable<ExpandedBody>;
  /** REQUIREMENTS.md § 8.6.1. The open search's query, lit here as it is in the bubble — the sheet is where a match past the cut is legible at all. */
  searchQuery?: string;
  onClose: () => void;
};

/**
 * DESIGN.md § 6.2.2., § 7.5. The whole of a cut message, in a sheet opened at its full
 * height rather than one sized to what it holds — what the reader asked for is the length.
 */
export function ExpandedBodySheet({
  className,
  body,
  searchQuery,
  onClose,
}: ExpandedBodySheetProps) {
  // INFO: The caller clears the body on close, and the exit animation would otherwise play over an empty header and no text — `ActionSheet` holds its own rows the same way and for the same reason.
  const [snapshot, setSnapshot] = useState(body);
  if (body !== null && body !== snapshot) {
    setSnapshot(body);
  }
  const shown = body ?? snapshot;
  const isOpen = body !== null;

  const isDesktop = useIsDesktop();
  const sheetRef = useRef<HTMLDivElement | null>(null);
  const scrollContainerRef = useRef<HTMLDivElement | null>(null);
  const { maskStyle, scrollRef: fadeScrollRef } = useScrollFade("to bottom");

  const setScrollContainer = (node: HTMLDivElement | null) => {
    scrollContainerRef.current = node;
    fadeScrollRef.current = node;
  };

  const {
    dragProps,
    dragTranslateY,
    expandedHeight,
    handleProps,
    isClosedByDrag,
    isDragging,
    isResettingAfterClose,
    pinnedHeight,
  } = useSheetDrag({
    sheetRef,
    isOpen,
    initialSize: "expanded",
    closeOnPullDownFromExpanded: true,
    onClose,
  });

  useEffect(() => {
    if (isOpen && scrollContainerRef.current) {
      scrollContainerRef.current.scrollTop = 0;
    }
  }, [isOpen]);

  const bodyContent = shown?.isMarkdown ? (
    <MarkdownBody text={shown.text} />
  ) : (
    shown && (
      // INFO: DESIGN.md § 6.2. The bubble's own wrapping rules, so the sheet breaks the message where the bubble was breaking it.
      <MessageText
        className="block text-chat-body wrap-anywhere [word-break:normal] whitespace-pre-wrap text-ink select-text"
        inlineEmoticonItemIds={shown.inlineEmoticonItemIds}
        inlineEmoticons={shown.inlineEmoticons}
        query={searchQuery}
        text={shown.text}
      />
    )
  );

  const titleText = shown?.senderName ?? "전체보기";
  const timestampText = shown
    ? `${formatDate(shown.createdAt)} ${formatTime(shown.createdAt)}`
    : undefined;

  if (isDesktop) {
    return (
      <Modal
        className={className}
        isOpen={isOpen}
        size="xl"
        header={{
          title: titleText,
          description: timestampText,
        }}
        onClose={onClose}
      >
        {bodyContent}
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
            "fixed right-0 bottom-[var(--viewport-bottom,0px)] left-(--overlay-left) z-50 mx-auto mb-sm flex w-[calc(100%_-_var(--overlay-left)_-_var(--spacing-sm)*2)] max-w-[calc(var(--content-max-width)_-_var(--spacing-sm)*2)] flex-col overflow-hidden rounded-xl border border-hairline bg-canvas px-md pt-md shadow-floating focus:outline-none data-[state=open]:animate-in data-[state=open]:duration-200 data-[state=open]:slide-in-from-bottom-[calc(100%_+_var(--spacing-sm)_+_var(--viewport-bottom,0px))]",
            // WARN: 100% is the sheet's own height — the plain slide utilities left the `mb-sm` + `--viewport-bottom` gap still filled, the same sliver `BottomSheet` clears via `--initial-transform`.
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
                : expandedHeight > 0
                  ? `${expandedHeight}px`
                  : "calc(var(--viewport-height,100dvh) - var(--header-height,56px) - var(--spacing-sm))",
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
          <DialogPrimitive.Title className="sr-only">{titleText}</DialogPrimitive.Title>

          <button
            className={cn(
              "mx-auto -mt-2 mb-2 flex h-6 w-full cursor-grab touch-none items-center justify-center focus-visible:outline-none active:cursor-grabbing",
              "before:absolute before:inset-x-0 before:-top-2 before:h-8 before:content-['']",
            )}
            type="button"
            aria-label="전체보기 닫기"
            {...handleProps}
          >
            <span className="hover:bg-ink-muted block h-1.5 w-12 rounded-full bg-hairline-strong transition-colors" />
          </button>

          <div
            ref={setScrollContainer}
            className="-mx-md scrollbar-hidden min-h-0 flex-1 overflow-y-auto overscroll-contain px-md after:block after:h-[max(var(--spacing-md),env(safe-area-inset-bottom))]"
            style={maskStyle}
          >
            <div className="mb-xs shrink-0 space-y-2xs text-center">
              <h2 className="text-title-md font-semibold text-ink">{titleText}</h2>
              {timestampText && (
                <p className="text-body-sm whitespace-pre-line text-meta">{timestampText}</p>
              )}
            </div>

            {bodyContent}
          </div>
        </DialogPrimitive.Content>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  );
}
