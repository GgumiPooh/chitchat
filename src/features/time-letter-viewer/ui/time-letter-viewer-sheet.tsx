"use client";

import type { TimeLetter } from "@/entities/time-letter";
import { THEME_STYLES } from "@/shared/config";
import { cn, formatDate, formatTime, type Nullable } from "@/shared/lib";
import { BottomSheet, Button, MediaViewer, type MediaCell } from "@/shared/ui";
import { Calendar, RotateCcw, Trash2, Video } from "lucide-react";
import { useMemo, useState } from "react";
import { WaxSealUnboxing } from "./wax-seal-unboxing";

export type TimeLetterViewerSheetProps = {
  className?: string;
  isOpen: boolean;
  letter: TimeLetter;
  isSender?: boolean;
  partnerName?: string;
  onClose: () => void;
  onReply?: (letter: TimeLetter) => void;
  onCancel?: () => void;
};

export function TimeLetterViewerSheet({
  className,
  isOpen,
  letter,
  isSender = false,
  partnerName = "상대방",
  onClose,
  onReply,
  onCancel,
}: TimeLetterViewerSheetProps) {
  const [isUnsealed, setIsUnsealed] = useState<boolean>(false);
  const [activeMediaIndex, setActiveMediaIndex] = useState<Nullable<number>>(null);

  const themeStyle = THEME_STYLES[letter.theme] ?? THEME_STYLES.classic;

  const targetName = letter.senderName ?? partnerName;
  const formattedName = targetName.endsWith("님") ? targetName : `${targetName}님`;
  const replyButtonLabel = `${formattedName}에게 답장 보내기`;

  const createdDateStr = formatDate(letter.createdAt ?? letter.scheduledAt);
  const scheduledDateStr = `${formatDate(letter.scheduledAt)} ${formatTime(letter.scheduledAt)}`;

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
        className={className}
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
              {/* Theme parchment card */}
              <div
                className={cn(
                  "relative space-y-md rounded-xl p-lg transition-colors sm:p-xl",
                  themeStyle.parchment,
                )}
              >
                {/* Top header row: Badge & re-seal interaction button */}
                <div className="flex flex-wrap items-center justify-between gap-sm">
                  <div
                    className={cn(
                      "inline-flex items-center gap-1 rounded-full px-3 py-1 text-caption font-medium",
                      themeStyle.headerBadge,
                    )}
                  >
                    <span>📮 타임머신 편지 • {createdDateStr}에 묻어둠</span>
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

                {/* Letter title (if provided) */}
                {letter.title && (
                  <h2 className={cn("text-title-lg font-bold tracking-tight", themeStyle.title)}>
                    {letter.title}
                  </h2>
                )}

                {/* Formatted arrival date stamp */}
                <div
                  className={cn(
                    "flex items-center gap-1.5 pb-xs text-caption",
                    themeStyle.dateStamp,
                  )}
                >
                  <Calendar className="size-3.5" aria-hidden />
                  <span>개봉: {scheduledDateStr}</span>
                </div>

                <hr className={cn("border-t", themeStyle.divider)} />

                {/* Letter body with line breaks and emoji support */}
                <div
                  className={cn(
                    "min-h-24 font-sans text-body-md leading-relaxed break-keep whitespace-pre-wrap",
                    themeStyle.body,
                  )}
                >
                  {letter.content ??
                    "개봉일까지 본문과 사진은 안전하게 암호화 및 봉인 처리되어 보호돼요."}
                </div>

                {/* Photo gallery grid (tap opens MediaViewer) */}
                {letter.media && letter.media.length > 0 && (
                  <div className="space-y-xs pt-sm">
                    <p className="text-caption text-meta">첨부된 추억 ({letter.media.length}장)</p>
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
              </div>

              {/* Bottom action button (for scheduled sender or delivered recipient) */}
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

              {letter.status === "sent" && onReply && (
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
