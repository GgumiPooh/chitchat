"use client";

import type { TimeLetter } from "@/entities/time-letter";
import { formatJourneyDuration, THEME_STYLES } from "@/shared/config";
import { cn, formatDate, formatTime, type Nullable } from "@/shared/lib";
import { BottomSheet, Button, MediaViewer, type MediaCell } from "@/shared/ui";
import { Clock, RotateCcw, Sparkles, Trash2, Video } from "lucide-react";
import { useMemo, useState } from "react";
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

const SHEET_THEME_STYLES: Record<string, string> = {
  classic: "",
  romantic: "bg-primary-tint/30 border-primary/25",
  midnight: "bg-surface-soft-private border-hairline/20 text-bubble-private-ink",
  kraft: "bg-surface-soft border-hairline-strong",
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
  const [isUnsealed, setIsUnsealed] = useState<boolean>(false);
  const [activeMediaIndex, setActiveMediaIndex] = useState<Nullable<number>>(null);

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

  const targetReplyName = isSender ? partnerName : (letter.senderName ?? partnerName);
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

  const isSent = letter.status === "sent";
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
      <BottomSheet
        className={cn(
          "transition-colors duration-500",
          isUnsealed && (SHEET_THEME_STYLES[letter.theme] ?? ""),
          className,
        )}
        isOpen={isOpen}
        header={{
          title: "타임머신 편지",
          isHidden: true,
        }}
        onClose={onClose}
      >
        <div className="pt-xs pb-xl">
          {!isUnsealed ? (
            /* Unboxing interaction */
            <div className="flex flex-col items-center">
              <WaxSealUnboxing
                theme={letter.theme}
                title={letter.title}
                onUnsealed={() => setIsUnsealed(true)}
              />

              {canCancel && (
                <div className="pt-xs pb-sm">
                  <Button
                    className="min-h-9! w-auto! px-md! py-1.5! text-button-sm text-semantic-error hover:bg-semantic-error/10 active:bg-semantic-error/20"
                    haptic
                    variant="ghost"
                    onClick={onCancel}
                  >
                    <Trash2 className="size-4" />
                    <span>봉인 취소</span>
                  </Button>
                </div>
              )}
            </div>
          ) : (
            /* Unfolded letter in theme parchment styling */
            <div className="animate-in space-y-lg duration-500 fade-in-50">
              {/* Letter content directly in sheet */}
              <div className="space-y-md">
                {/* 1. Top utility row: Badge & re-seal interaction button */}
                <div className="flex flex-wrap items-center justify-between gap-sm">
                  <div
                    className={cn(
                      "inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-caption font-medium",
                      themeStyle.headerBadge,
                    )}
                  >
                    <Sparkles className="size-3" aria-hidden />
                    <span>타임머신 편지</span>
                  </div>

                  <div className="flex items-center gap-2">
                    {canCancel && (
                      <button
                        className="inline-flex cursor-pointer items-center gap-1 text-caption font-medium text-semantic-error transition-colors hover:underline"
                        type="button"
                        onClick={onCancel}
                      >
                        <Trash2 className="size-3" aria-hidden />
                        <span>봉인 취소</span>
                      </button>
                    )}
                    <button
                      className="inline-flex cursor-pointer items-center gap-1 text-caption text-meta transition-colors hover:text-ink"
                      type="button"
                      onClick={() => setIsUnsealed(false)}
                    >
                      <RotateCcw className="size-3" aria-hidden />
                      <span>봉인 다시 보기</span>
                    </button>
                  </div>
                </div>

                {/* 2. Addressee (To. ...) */}
                <div className="pt-xs">
                  <span className={cn("text-title-md font-bold tracking-tight", themeStyle.title)}>
                    {toLabel}
                  </span>
                </div>

                {/* 3. Letter title (if provided) */}
                {letter.title && (
                  <h2 className={cn("text-title-lg font-bold tracking-tight", themeStyle.title)}>
                    {letter.title}
                  </h2>
                )}

                {/* 4. Elegant separator */}
                <hr className={cn("border-t", themeStyle.divider)} />

                {/* 5. Letter body */}
                <div
                  className={cn(
                    "min-h-24 font-sans text-body-md leading-relaxed break-keep whitespace-pre-wrap",
                    themeStyle.body,
                  )}
                >
                  {letter.content ??
                    "개봉일까지 본문과 사진은 안전하게 암호화 및 봉인 처리되어 보호돼요."}
                </div>

                {/* 6. Photo gallery grid (tap opens MediaViewer) */}
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

                {/* 7. Sign-off and Written Date (Right-aligned) */}
                <div className="flex flex-col items-end gap-0.5 pt-sm text-right">
                  <span className={cn("text-caption", themeStyle.dateStamp)}>
                    {writtenDateFullStr}
                  </span>
                  <span
                    className={cn("text-title-sm font-semibold tracking-tight", themeStyle.title)}
                  >
                    {fromLabel}
                  </span>
                </div>

                {/* 8. Delivery Journey Log Card (타임머신 배달 기록) */}
                <div
                  className={cn(
                    "mt-md rounded-xl border p-md text-caption",
                    themeStyle.headerBadge,
                  )}
                >
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
              </div>

              {/* 9. Bottom action buttons */}
              {canCancel && (
                <div className="pt-xs">
                  <Button
                    className="w-full text-semantic-error hover:bg-semantic-error/10 active:bg-semantic-error/20"
                    haptic
                    variant="ghost"
                    onClick={onCancel}
                  >
                    <Trash2 className="size-4" />
                    <span>봉인 취소 및 파기</span>
                  </Button>
                </div>
              )}

              {letter.status === "sent" && onReply && !letter.onlyMe && (
                <div className="pt-xs">
                  <Button variant="primary" haptic onClick={handleReply}>
                    {replyButtonLabel}
                  </Button>
                </div>
              )}
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
