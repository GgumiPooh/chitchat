"use client";

import type { TimeLetter } from "@/entities/time-letter";
import { formatJourneyDuration, THEME_STYLES } from "@/shared/config";
import { cn, formatDate, formatTime, type Nullable } from "@/shared/lib";
import { BottomSheet, Button, MediaViewer, Modal, type MediaCell } from "@/shared/ui";
import { Clock, RotateCcw, Trash2, Video } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { WaxSealUnboxing } from "./wax-seal-unboxing";

export type TimeLetterViewerSheetProps = {
  className?: string;
  isOpen: boolean;
  letter: TimeLetter;
  isSender?: boolean;
  currentUserName?: string;
  partnerName?: string;
  onClose: () => void;
  onReply?: (letter: TimeLetter) => void;
  onCancel?: () => void;
};

const LETTER_THEME_STYLES: Record<string, string> = {
  classic: "bg-canvas border-2 border-hairline-strong text-ink shadow-2xl ring-1 ring-hairline/60",
  romantic: "bg-primary-tint border-2 border-primary/30 text-ink shadow-2xl ring-1 ring-primary/20",
  midnight:
    "bg-parchment-midnight border-2 border-hairline/25 text-parchment-midnight-ink shadow-2xl ring-1 ring-hairline/25",
  kraft:
    "bg-surface-soft border-2 border-hairline-strong text-ink shadow-2xl ring-1 ring-hairline/80",
};

export function TimeLetterViewerSheet({
  className,
  isOpen,
  letter,
  isSender = false,
  currentUserName,
  partnerName = "상대방",
  onClose,
  onReply,
  onCancel,
}: TimeLetterViewerSheetProps) {
  const isSent = letter.status === "sent";
  const [isUnsealed, setIsUnsealed] = useState<boolean>(false);
  const [activeMediaIndex, setActiveMediaIndex] = useState<Nullable<number>>(null);

  const [prevOpenState, setPrevOpenState] = useState<{ isOpen: boolean; letterId: string }>({
    isOpen,
    letterId: letter.id,
  });

  if (prevOpenState.isOpen !== isOpen || prevOpenState.letterId !== letter.id) {
    setPrevOpenState({ isOpen, letterId: letter.id });
    if (isOpen) {
      setIsUnsealed(false);
    }
  }

  useEffect(() => {
    if (!isOpen) {
      const timer = setTimeout(() => {
        setIsUnsealed(false);
        setActiveMediaIndex(null);
      }, 300);
      return () => clearTimeout(timer);
    }
  }, [isOpen]);

  const themeStyle = THEME_STYLES[letter.theme] ?? THEME_STYLES.classic;

  const toLabel = useMemo(() => {
    if (letter.onlyMe) {
      return isSender ? "To. 미래의 나에게" : "To. 나에게";
    }
    if (isSender) {
      return `To. ${partnerName}에게`;
    }
    return currentUserName ? `To. ${currentUserName}에게` : "To. 나에게";
  }, [letter.onlyMe, isSender, partnerName, currentUserName]);

  const fromLabel = useMemo(() => {
    if (letter.onlyMe) {
      return "From. 과거의 나";
    }
    if (isSender) {
      return currentUserName ? `From. ${currentUserName}` : "From. 나";
    }
    const sender = letter.senderName ?? partnerName;
    return `From. ${sender}`;
  }, [letter.onlyMe, isSender, currentUserName, letter.senderName, partnerName]);

  const targetReplyName = letter.senderName ?? partnerName;
  const formattedReplyName = targetReplyName.endsWith("님")
    ? targetReplyName
    : `${targetReplyName}님`;
  const replyButtonLabel = `${formattedReplyName}에게 답장 보내기`;

  const createdDate = useMemo(
    () => (letter.createdAt ? new Date(letter.createdAt) : new Date(letter.scheduledAt)),
    [letter.createdAt, letter.scheduledAt],
  );
  const arrivalDate = useMemo(
    () => (letter.sentAt ? new Date(letter.sentAt) : new Date(letter.scheduledAt)),
    [letter.sentAt, letter.scheduledAt],
  );

  const writtenDateFullStr = `${formatDate(createdDate)} ${formatTime(createdDate)}`;

  const arrivalLabel = isSent ? "도착한 시각" : "도착 예정 시각";
  const targetDate = useMemo(
    () => (isSent ? arrivalDate : new Date(letter.scheduledAt)),
    [isSent, arrivalDate, letter.scheduledAt],
  );
  const targetDateStr = `${formatDate(targetDate)} ${formatTime(targetDate)}`;

  const journeyDuration = useMemo(() => {
    const diffMs = targetDate.getTime() - createdDate.getTime();
    return formatJourneyDuration(diffMs);
  }, [targetDate, createdDate]);

  // Convert letter.media to MediaCell for MediaViewer
  const mediaCells: MediaCell[] = useMemo(() => {
    if (!letter.media || letter.media.length === 0) {
      return [];
    }

    return letter.media.map((m) => ({
      id: m.id,
      previewUrl: m.previewUrl,
      blurhash: m.blurhash ?? null,
      originalUrl: m.originalUrl ?? m.previewUrl,
      downloadUrl: m.downloadUrl ?? m.originalUrl ?? m.previewUrl,
      width: m.width ?? 800,
      height: m.height ?? 800,
      durationMs: m.durationMs ?? null,
      isVideo: Boolean(m.isVideo),
      filename: null,
      sizeBytes: 0,
      isDeleted: false,
    }));
  }, [letter.media]);

  const canCancel = isSender && letter.status === "scheduled" && Boolean(onCancel);

  const handleReply = () => {
    onReply?.(letter);
    onClose();
  };

  return (
    <>
      {/* 1. Sealed Envelope Modal (봉투 모달: 화면 중앙 모달 유지) */}
      <Modal
        className={cn(
          "max-w-[420px] gap-0! overflow-hidden rounded-2xl border-2 p-0! shadow-2xl",
          LETTER_THEME_STYLES[letter.theme] ?? "",
          className,
        )}
        bodyClassName="m-0! p-0! flex flex-col min-h-0 after:hidden!"
        hideCloseButton
        isOpen={isOpen && !isUnsealed}
        size="md"
        header={{
          title: "타임머신 편지 봉인",
          isHidden: true,
        }}
        onCloseAutoFocus={(event) => {
          if (isUnsealed) {
            event.preventDefault();
          }
        }}
        onClose={onClose}
      >
        <WaxSealUnboxing
          title={letter.title}
          isSent={isSent}
          writtenDateStr={writtenDateFullStr}
          onUnsealed={() => setIsUnsealed(true)}
          onClose={onClose}
          onCancel={canCancel ? onCancel : undefined}
        />
      </Modal>

      {/* 2. Unfolded Letter Paper (편지지: 모바일에서는 바텀시트, 데스크톱에서는 모달) */}
      <BottomSheet
        className={cn("overflow-hidden", LETTER_THEME_STYLES[letter.theme] ?? "", className)}
        isOpen={isOpen && isUnsealed}
        header={{
          title: "타임머신 편지",
          isHidden: true,
        }}
        onCloseAutoFocus={(event) => {
          if (!isUnsealed && isOpen) {
            event.preventDefault();
          }
        }}
        onClose={onClose}
      >
        <div className="space-y-md pt-xs pb-md">
          {/* 1. Addressee (To. ...) & Stationery Watermark & Re-seal Action */}
          <div className="flex items-center justify-between pt-xs">
            <span className={cn("text-title-lg font-bold tracking-tight", themeStyle.title)}>
              {toLabel}
            </span>
            <div className="flex items-center gap-2">
              <span className="hidden font-mono text-caption tracking-widest uppercase opacity-60 sm:inline">
                Time Letter
              </span>
              <button
                className="inline-flex cursor-pointer items-center gap-1 rounded-full border border-hairline/60 bg-surface-soft/60 px-2.5 py-1 text-caption font-medium text-meta transition-colors hover:bg-surface-soft hover:text-ink active:bg-surface-strong"
                type="button"
                onClick={() => setIsUnsealed(false)}
              >
                <RotateCcw className="size-3.5" aria-hidden />
                <span>{isSent ? "봉투 보기" : "봉인 다시 보기"}</span>
              </button>
            </div>
          </div>

          {/* 2. Letter title (if provided) */}
          {letter.title && (
            <div className="-mt-1">
              <span className={cn("text-title-sm font-medium italic opacity-85", themeStyle.title)}>
                &ldquo;{letter.title}&rdquo;
              </span>
            </div>
          )}

          {/* 3. Elegant separator */}
          <hr className={cn("my-xs border-t", themeStyle.divider)} />

          {/* 4. Letter body */}
          <div
            className={cn(
              "min-h-28 py-xs text-body-md leading-relaxed break-keep whitespace-pre-wrap",
              themeStyle.body,
            )}
          >
            {letter.content ??
              "개봉일까지 본문과 사진은 안전하게 암호화 및 봉인 처리되어 보호돼요."}
          </div>

          {/* 5. Photo gallery grid (tap opens MediaViewer) */}
          {letter.media && letter.media.length > 0 && (
            <div className="space-y-xs pt-xs">
              <p className={cn("text-caption", themeStyle.dateStamp)}>
                첨부된 추억 ({letter.media.length}장)
              </p>
              <div
                className={cn(
                  "grid gap-xs",
                  letter.media.length === 1 && "max-w-xs grid-cols-1",
                  letter.media.length === 2 && "grid-cols-2",
                  letter.media.length >= 3 && "grid-cols-3",
                )}
              >
                {letter.media.map((item, index) => (
                  <button
                    key={item.id}
                    className="group relative aspect-square cursor-pointer overflow-hidden rounded-md border border-hairline bg-surface-soft transition-opacity outline-none hover:opacity-90 focus-visible:ring-2 focus-visible:ring-primary active:opacity-80"
                    type="button"
                    onClick={() => setActiveMediaIndex(index)}
                  >
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      className="size-full object-cover transition-transform duration-300 group-hover:scale-105"
                      src={item.previewUrl}
                      alt="편지 첨부 미디어"
                    />
                    {item.isVideo && (
                      <div className="absolute right-1 bottom-1 rounded-sm bg-scrim/75 p-1 text-on-scrim">
                        <Video className="size-3.5" />
                      </div>
                    )}
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* 6. Sign-off and Written Date (Right-aligned) */}
          <div className="flex flex-col items-end gap-0.5 pt-sm text-right">
            <span className={cn("text-caption", themeStyle.dateStamp)}>{writtenDateFullStr}</span>
            <span className={cn("text-title-sm font-semibold tracking-tight", themeStyle.title)}>
              {fromLabel}
            </span>
          </div>

          {/* 7. Delivery Journey Log Card (타임머신 배달 기록) */}
          <div className={cn("mt-md rounded-xl border p-md text-caption", themeStyle.headerBadge)}>
            <div className="flex items-center justify-between border-b border-hairline/30 pb-xs">
              <span className="flex items-center gap-1.5 font-medium">
                <Clock className="size-3.5" aria-hidden />
                <span>타임머신 배달 기록</span>
              </span>
              {journeyDuration && <span className="font-semibold">{journeyDuration}</span>}
            </div>
            <div className="grid grid-cols-2 gap-sm pt-xs">
              <div>
                <span className="block text-[11px] opacity-75">묻어둔 시각</span>
                <span className="font-medium">{writtenDateFullStr}</span>
              </div>
              <div>
                <span className="block text-[11px] opacity-75">{arrivalLabel}</span>
                <span className="font-medium">{targetDateStr}</span>
              </div>
            </div>
          </div>

          {/* 8. Bottom action buttons */}
          {canCancel && (
            <div className="pt-xs">
              <Button
                className="w-full"
                buttonClassName="text-semantic-error hover:bg-semantic-error/10 active:bg-semantic-error/20"
                haptic
                variant="ghost"
                onClick={onCancel}
              >
                <Trash2 className="size-4" />
                <span>봉인 취소 및 파기</span>
              </Button>
            </div>
          )}

          {letter.status === "sent" && onReply && !isSender && !letter.onlyMe && (
            <div className="pt-xs">
              <Button variant="primary" haptic onClick={handleReply}>
                {replyButtonLabel}
              </Button>
            </div>
          )}
        </div>
      </BottomSheet>

      {/* Media Viewer when a photo in the gallery is tapped */}
      {activeMediaIndex !== null && mediaCells.length > 0 && (
        <MediaViewer
          cells={mediaCells}
          initialIndex={activeMediaIndex}
          onClose={() => setActiveMediaIndex(null)}
        />
      )}
    </>
  );
}
