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
import { useRef, useState } from "react";
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
  const isDesktop = useIsDesktop();
  const sheetRef = useRef<HTMLDivElement | null>(null);
  const { maskStyle, scrollRef } = useScrollFade("to bottom");

  // INFO: The caller clears the body on close, and the exit animation would otherwise play over an empty header and no text — `ActionSheet` holds its own rows the same way and for the same reason.
  const [snapshot, setSnapshot] = useState(body);
  if (body !== null && body !== snapshot) {
    setSnapshot(body);
  }
  const shown = body ?? snapshot;
  const isOpen = body !== null;

  const { dragProps, dragTranslateY, expandedHeight, handleProps, isDragging, isResettingAfterClose, pinnedHeight } =
    useSheetDrag({
      closeOnPullDownFromExpanded: true,
      initialSize: "expanded",
      isOpen,
      onClose,
      sheetRef,
    });

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

  if (isDesktop) {
    return (
      <Modal
        className={cn(
          "max-h-[calc(var(--viewport-height,100dvh)_-_var(--spacing-lg)*2)]",
          "w-[calc(100%_-_var(--content-left)_-_var(--spacing-xl))] max-w-[var(--content-max-width,720px)]",
          className,
        )}
        isOpen={isOpen}
        size="lg"
        header={{
          description: shown
            ? `${formatDate(shown.createdAt)} ${formatTime(shown.createdAt)}`
            : undefined,
          title: shown?.senderName ?? "전체보기",
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
            "fixed right-0 bottom-[var(--viewport-bottom,0px)] left-(--content-left) z-50 mx-auto mb-sm flex max-h-[calc(var(--viewport-height,100dvh)_-_var(--header-height,56px)_-_var(--spacing-sm))] w-[calc(100%_-_var(--content-left)_-_var(--spacing-sm)*2)] max-w-[calc(var(--content-max-width)_-_var(--spacing-sm)*2)] flex-col overflow-hidden rounded-xl border border-hairline bg-canvas px-md pt-md shadow-floating focus:outline-none data-[state=closed]:animate-out data-[state=closed]:duration-200 data-[state=closed]:slide-out-to-bottom data-[state=open]:animate-in data-[state=open]:duration-200 data-[state=open]:slide-in-from-bottom",
            isDragging || isResettingAfterClose ? "transition-none!" : "transition-[height,transform] duration-200 ease-out",
            className,
          )}
          style={{
            height:
              pinnedHeight !== null
                ? `${pinnedHeight}px`
                : expandedHeight > 0
                  ? `${expandedHeight}px`
                  : "calc(var(--viewport-height,100dvh) - var(--header-height,56px) - var(--spacing-sm))",
            transform: dragTranslateY > 0 ? `translateY(${dragTranslateY}px)` : undefined,
          }}
          onOpenAutoFocus={(event) => event.preventDefault()}
          {...dragProps}
        >
          {/* 상단 드래그 & 닫기 손잡이 */}
          <button
            className={cn(
              "mx-auto -mt-2 mb-2 flex h-6 w-full cursor-grab touch-none items-center justify-center focus-visible:outline-none active:cursor-grabbing",
              "before:absolute before:inset-x-0 before:-top-2 before:h-8 before:content-['']",
            )}
            type="button"
            aria-label="닫기"
            {...handleProps}
          >
            <span className="hover:bg-ink-muted block h-1.5 w-12 rounded-full bg-hairline-strong transition-colors" />
          </button>

          {/* 스크롤 가능한 본문 영역 */}
          <div
            ref={scrollRef}
            className="-mx-md scrollbar-hidden min-h-0 flex-1 overflow-y-auto overscroll-contain px-md after:block after:h-[max(var(--spacing-md),env(safe-area-inset-bottom))]"
            style={maskStyle}
          >
            {/* 헤더 */}
            <div className="mb-md shrink-0 space-y-2xs text-center">
              <DialogPrimitive.Title className="text-title-md text-ink">
                {shown?.senderName ?? "전체보기"}
              </DialogPrimitive.Title>
              {shown && (
                <DialogPrimitive.Description className="text-body-sm text-meta">
                  {`${formatDate(shown.createdAt)} ${formatTime(shown.createdAt)}`}
                </DialogPrimitive.Description>
              )}
            </div>

            {bodyContent}
          </div>
        </DialogPrimitive.Content>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  );
}
