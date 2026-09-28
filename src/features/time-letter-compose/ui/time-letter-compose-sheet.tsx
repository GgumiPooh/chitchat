"use client";

import type { MediaDraft, MediaUpload } from "@/entities/media";
import type {
  TimeLetter,
  TimeLetterDraft,
  TimeLetterRecipientMode,
  TimeLetterTheme,
} from "@/entities/time-letter";
import {
  revokePreview,
  toMediaDraft,
  uploadDraft,
  validateFile,
} from "@/features/upload-media/@x/time-letter-compose";
import { TIME_LETTER_THEMES } from "@/shared/config";
import { cn, toDayKey, type Nullable } from "@/shared/lib";
import { BottomSheet, Button, Chip, Input, Switch, Textarea, toast } from "@/shared/ui";
import { josa } from "es-hangul";
import { History, ImagePlus, Video, X } from "lucide-react";
import { useCallback, useEffect, useRef, useState, type ChangeEvent } from "react";
import { postTimeLetter } from "../api/post-time-letter";
import {
  DATE_PRESETS,
  getDefaultScheduledDateTime,
  validateLetterDate,
} from "../model/date-presets";
import { clearStoredDraft, loadStoredDraft, saveStoredDraft } from "../model/draft-storage";
import { WaxSealStamp } from "./wax-seal-stamp";

const MAX_CONTENT_LENGTH = 5000;
const MAX_MEDIA_COUNT = 10;

const RECIPIENT_OPTIONS: readonly {
  label: string;
  mode: TimeLetterRecipientMode;
}[] = [
  { label: "상대방에게", mode: "partner" },
  { label: "우리 둘 모두에게", mode: "both" },
  { label: "나에게만", mode: "me" },
] as const;

export type TimeLetterComposeSheetProps = {
  className?: string;
  isOpen: boolean;
  partnerName?: string;
  onClose: () => void;
  onSuccess?: (letter: TimeLetter) => void;
};

export function TimeLetterComposeSheet({
  className,
  isOpen,
  partnerName = "상대방",
  onClose,
  onSuccess,
}: TimeLetterComposeSheetProps) {
  const [todayKey] = useState(() => toDayKey(Date.now()));
  const [initialDateTime] = useState(() => getDefaultScheduledDateTime());

  const [theme, setTheme] = useState<TimeLetterTheme>("classic");
  const [scheduledDayKey, setScheduledDayKey] = useState<string>(initialDateTime.dayKey);
  const [scheduledTime, setScheduledTime] = useState<string>(initialDateTime.time);
  const [recipientMode, setRecipientMode] = useState<TimeLetterRecipientMode>("partner");
  const [showTeaser, setShowTeaser] = useState<boolean>(true);
  const [title, setTitle] = useState<string>("");
  const [content, setContent] = useState<string>("");
  const [mediaList, setMediaList] = useState<MediaDraft[]>([]);
  const [isProcessingMedia, setIsProcessingMedia] = useState<boolean>(false);

  // Draft prompt state loaded once at mount
  const [pendingDraft, setPendingDraft] = useState<Nullable<TimeLetterDraft>>(() =>
    loadStoredDraft(),
  );
  const [isSealing, setIsSealing] = useState<boolean>(false);
  const [isSealCompleted, setIsSealCompleted] = useState<boolean>(false);
  const [isSubmitting, setIsSubmitting] = useState<boolean>(false);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const saveTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  // Validation
  const dateValidation = validateLetterDate(scheduledDayKey, scheduledTime);
  const isContentEmpty = content.trim().length === 0;
  const isSubmittable = !isContentEmpty && dateValidation.isValid && !isSealing && !isSubmitting;

  // INFO: Debounced 500ms auto-save to localStorage
  useEffect(() => {
    if (!isOpen || isSealing || isSubmitting) {
      return;
    }

    if (saveTimeoutRef.current) {
      clearTimeout(saveTimeoutRef.current);
    }

    saveTimeoutRef.current = setTimeout(() => {
      if (content.trim().length > 0 || title.trim().length > 0) {
        saveStoredDraft({
          content,
          recipientMode,
          scheduledDayKey,
          scheduledTime,
          showTeaser,
          theme,
          title,
        });
      }
    }, 500);

    return () => {
      if (saveTimeoutRef.current) {
        clearTimeout(saveTimeoutRef.current);
      }
    };
  }, [
    isOpen,
    isSealing,
    isSubmitting,
    title,
    content,
    theme,
    scheduledDayKey,
    scheduledTime,
    recipientMode,
    showTeaser,
  ]);

  // INFO: Clean up created object URLs when unmounting or removing
  const handleRemoveMedia = useCallback((indexToRemove: number) => {
    setMediaList((prev) => {
      const target = prev[indexToRemove];
      if (target) {
        revokePreview(target);
      }
      return prev.filter((_, idx) => idx !== indexToRemove);
    });
  }, []);

  const handleRestoreDraft = () => {
    if (!pendingDraft) {
      return;
    }

    setTitle(pendingDraft.title);
    setContent(pendingDraft.content);
    setTheme(pendingDraft.theme);
    if (pendingDraft.scheduledDayKey) {
      setScheduledDayKey(pendingDraft.scheduledDayKey);
    }
    if (pendingDraft.scheduledTime) {
      setScheduledTime(pendingDraft.scheduledTime);
    }
    setRecipientMode(pendingDraft.recipientMode);
    setShowTeaser(pendingDraft.showTeaser);
    setPendingDraft(null);

    toast.success("임시 저장된 편지를 불러왔어요");
  };

  const handleDiscardDraft = () => {
    clearStoredDraft();
    setPendingDraft(null);
    toast("임시 저장된 편지를 삭제했어요");
  };

  const handleFilesSelected = async (event: ChangeEvent<HTMLInputElement>) => {
    const files = event.target.files;
    if (!files || files.length === 0) {
      return;
    }

    const remainingSlots = MAX_MEDIA_COUNT - mediaList.length;
    if (remainingSlots <= 0) {
      toast.error(`사진과 동영상은 최대 ${MAX_MEDIA_COUNT}장까지 첨부할 수 있어요`);
      return;
    }

    const filesToProcess = Array.from(files).slice(0, remainingSlots);
    if (files.length > remainingSlots) {
      toast.error(`최대 ${MAX_MEDIA_COUNT}장까지만 첨부할 수 있어 일부 파일만 추가돼요`);
    }

    setIsProcessingMedia(true);
    const addedDrafts: MediaDraft[] = [];

    for (const file of filesToProcess) {
      const validationIssue = validateFile(file);
      if (validationIssue) {
        toast.error(validationIssue);
        continue;
      }

      try {
        const draft = await toMediaDraft(file);
        addedDrafts.push(draft);
      } catch {
        toast.error(`${josa(file.name, "을/를")} 첨부하지 못했어요`);
      }
    }

    if (addedDrafts.length > 0) {
      setMediaList((prev) => [...prev, ...addedDrafts]);
    }

    setIsProcessingMedia(false);
    // Reset file input
    if (fileInputRef.current) {
      fileInputRef.current.value = "";
    }
  };

  const handleSubmit = async () => {
    if (!isSubmittable || isSubmitting) {
      return;
    }

    setIsSubmitting(true);
    setIsSealing(true);
    setIsSealCompleted(false);

    // Minimum animation time to let the envelope fold and the wax seal stamp down
    const minAnimationPromise = new Promise((resolve) => setTimeout(resolve, 1400));

    try {
      // 1. Upload media drafts to R2 if any
      let uploadedMedia: MediaUpload[] = [];
      if (mediaList.length > 0) {
        uploadedMedia = await Promise.all(
          mediaList.map((draft) => uploadDraft(draft, { scope: "chat" })),
        );
      }

      // 2. Format scheduledAt Date
      const scheduledDate = new Date(`${scheduledDayKey}T${scheduledTime}:00`);
      if (Number.isNaN(scheduledDate.getTime())) {
        throw new Error("도착 일시를 올바르게 선택해 주세요");
      }

      // 3. Request server to create and store the time letter
      const createdLetter = await postTimeLetter({
        content: content.trim(),
        media: uploadedMedia,
        onlyMe: recipientMode === "me",
        recipientId: null,
        scheduledAt: scheduledDate.toISOString(),
        showTeaser: recipientMode === "me" ? false : showTeaser,
        theme,
        title: title.trim() || null,
      });

      // 4. Ensure minimum animation has finished
      await minAnimationPromise;

      // 5. Trigger completed state for the stamp (shows green checkmark)
      setIsSealCompleted(true);

      // 6. Give user brief moment to enjoy the completed seal animation
      await new Promise((resolve) => setTimeout(resolve, 700));

      clearStoredDraft();
      toast.success("편지가 소중히 봉인되었어요. 약속한 시간에 전송할게요!");
      setIsSealing(false);
      setIsSubmitting(false);
      onSuccess?.(createdLetter);
      onClose();
    } catch (error) {
      setIsSealing(false);
      setIsSubmitting(false);
      setIsSealCompleted(false);
      const message =
        error instanceof Error ? error.message : "편지를 봉인하지 못했어요. 다시 시도해 주세요";
      toast.error(message);
    }
  };

  const handleClose = () => {
    if (isSubmitting) {
      return;
    }
    setIsSealing(false);
    setIsSealCompleted(false);
    onClose();
  };

  return (
    <>
      <BottomSheet
        className={className}
        isOpen={isOpen}
        header={{
          title: "타임머신 편지 쓰기",
          isHidden: true,
        }}
        onClose={handleClose}
      >
        <div className="space-y-xl pt-xs pb-xl">
          {/* Draft restore banner */}
          {pendingDraft && (
            <div
              className="flex items-center justify-between gap-sm rounded-lg border border-hairline-strong bg-surface-soft p-sm"
              role="status"
            >
              <div className="flex min-w-0 items-center gap-xs text-body-sm text-ink">
                <History className="size-4 shrink-0 text-primary" aria-hidden />
                <span className="truncate">이전에 작성 중이던 편지가 있어요</span>
              </div>
              <div className="flex shrink-0 items-center gap-xs">
                <Button
                  buttonClassName="min-h-8 px-sm py-1 text-button-sm"
                  haptic
                  variant="primary"
                  onClick={handleRestoreDraft}
                >
                  불러오기
                </Button>
                <Button
                  buttonClassName="min-h-8 px-xs py-1 text-button-sm text-meta"
                  haptic
                  variant="ghost"
                  onClick={handleDiscardDraft}
                >
                  삭제
                </Button>
              </div>
            </div>
          )}

          {/* 1. Theme selector chips with haptic */}
          <section className="space-y-xs">
            <label className="text-caption text-meta">편지 테마</label>
            <div className="flex flex-wrap gap-xs">
              {TIME_LETTER_THEMES.map((item) => (
                <Chip
                  key={item.id}
                  haptic
                  isSelected={theme === item.id}
                  onClick={() => setTheme(item.id)}
                >
                  {item.label}
                </Chip>
              ))}
            </div>
          </section>

          {/* 2. Date selection */}
          <section className="space-y-sm">
            <div className="flex items-center justify-between">
              <label className="text-caption text-meta">도착 일시</label>
              {dateValidation.scheduledDate && dateValidation.isValid && (
                <span className="text-caption text-primary">
                  {dateValidation.scheduledDate.toLocaleDateString("ko-KR", {
                    day: "numeric",
                    month: "long",
                    weekday: "short",
                  })}{" "}
                  {scheduledTime} 도착
                </span>
              )}
            </div>

            {/* Presets */}
            <div className="flex flex-wrap gap-xs">
              {DATE_PRESETS.map((preset) => {
                const targetDayKey = preset.getDayKey(todayKey);
                const isSelected =
                  scheduledDayKey === targetDayKey && scheduledTime === preset.time;

                return (
                  <Chip
                    key={preset.id}
                    haptic
                    isSelected={isSelected}
                    onClick={() => {
                      setScheduledDayKey(targetDayKey);
                      setScheduledTime(preset.time);
                    }}
                  >
                    {preset.label}
                  </Chip>
                );
              })}
            </div>

            {/* Custom Date & Time pickers */}
            <div className="flex gap-xs">
              <Input
                className="min-w-0 flex-1"
                min={todayKey}
                type="date"
                value={scheduledDayKey}
                aria-invalid={!dateValidation.isValid}
                onChange={(e) => setScheduledDayKey(e.target.value)}
              />
              <Input
                className="w-32 shrink-0"
                type="time"
                value={scheduledTime}
                aria-invalid={!dateValidation.isValid}
                onChange={(e) => setScheduledTime(e.target.value)}
              />
            </div>

            {/* Date validation issue warning */}
            {!dateValidation.isValid && dateValidation.issue && (
              <p className="text-caption text-semantic-error" role="alert">
                {dateValidation.issue}
              </p>
            )}
          </section>

          {/* 3. Recipient selection */}
          <section className="space-y-xs">
            <label className="text-caption text-meta">받는 사람</label>
            <div className="flex flex-wrap gap-xs">
              {RECIPIENT_OPTIONS.map((opt) => (
                <Chip
                  key={opt.mode}
                  haptic
                  isSelected={recipientMode === opt.mode}
                  onClick={() => setRecipientMode(opt.mode)}
                >
                  {opt.mode === "partner" && partnerName ? `${partnerName}에게` : opt.label}
                </Chip>
              ))}
            </div>
          </section>

          {/* 4. Show Teaser toggle switch with haptic */}
          <section className="flex items-center justify-between gap-md rounded-lg border border-hairline bg-surface-soft/60 px-md py-sm">
            <div className="space-y-0.5">
              <p className="text-body-sm font-medium text-ink">
                상대방에게 D-Day 카운트다운 보여주기
              </p>
              <p className="text-caption text-meta">
                편지 내용은 숨겨지고, 개봉일까지 남은 날짜만 대화방에 표시돼요
              </p>
            </div>
            <Switch
              checked={showTeaser}
              disabled={recipientMode === "me"}
              haptic
              aria-label="상대방에게 D-Day 카운트다운 보여주기"
              onCheckedChange={setShowTeaser}
            />
          </section>

          {/* 5. Title (optional) & Content textarea (required) */}
          <section className="space-y-xs">
            <label className="text-caption text-meta">편지 내용</label>
            <Input
              maxLength={100}
              placeholder="편지 제목 (선택)"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
            />
            <div className="relative">
              <Textarea
                className="min-h-44 resize-none"
                maxLength={MAX_CONTENT_LENGTH}
                placeholder="미래의 우리에게 보낼 편지를 작성해 보세요..."
                value={content}
                onChange={(e) => setContent(e.target.value)}
              />
              <div className="mt-1 text-right text-caption text-meta">
                {content.length.toLocaleString()} / {MAX_CONTENT_LENGTH.toLocaleString()}자
              </div>
            </div>
          </section>

          {/* 6. Media uploader: Attach up to 10 photos/videos */}
          <section className="space-y-xs">
            <div className="flex items-center justify-between">
              <label className="text-caption text-meta">
                사진 / 동영상 첨부 ({mediaList.length}/{MAX_MEDIA_COUNT})
              </label>
            </div>

            <div className="flex flex-wrap gap-xs">
              {/* Thumbnail previews */}
              {mediaList.map((item, index) => (
                <div
                  key={item.id}
                  className="group relative size-18 shrink-0 overflow-hidden rounded-md border border-hairline bg-surface-soft"
                >
                  {item.previewUrl ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      className="size-full object-cover"
                      alt="첨부된 미디어"
                      src={item.previewUrl}
                    />
                  ) : (
                    <div className="flex size-full items-center justify-center text-meta">
                      {item.durationMs ? (
                        <Video className="size-5" />
                      ) : (
                        <ImagePlus className="size-5" />
                      )}
                    </div>
                  )}

                  {/* Video indicator badge */}
                  {item.durationMs !== null && (
                    <div className="py-0.2 absolute bottom-1 left-1 rounded bg-scrim/70 px-1 text-[10px] text-on-scrim">
                      동영상
                    </div>
                  )}

                  {/* Remove button */}
                  <button
                    className="absolute top-1 right-1 flex size-5 items-center justify-center rounded-full bg-scrim/80 text-on-scrim transition-colors hover:bg-scrim"
                    type="button"
                    aria-label="미디어 삭제"
                    onClick={() => handleRemoveMedia(index)}
                  >
                    <X className="size-3.5" />
                  </button>
                </div>
              ))}

              {/* Add media button */}
              {mediaList.length < MAX_MEDIA_COUNT && (
                <button
                  className={cn(
                    "flex size-18 shrink-0 flex-col items-center justify-center gap-1 rounded-md border border-dashed border-hairline-strong bg-surface-soft/50 text-meta transition-colors hover:border-primary hover:text-primary disabled:opacity-50",
                  )}
                  disabled={isProcessingMedia}
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                >
                  <ImagePlus className="size-5" />
                  <span className="text-[11px]">추가</span>
                </button>
              )}
            </div>

            {/* Hidden file input */}
            <input
              ref={fileInputRef}
              className="hidden"
              accept="image/*,video/*"
              multiple
              type="file"
              onChange={handleFilesSelected}
            />
          </section>

          {/* 7. Submit button */}
          <div className="pt-sm">
            <Button
              disabled={!isSubmittable || isSubmitting}
              haptic
              onClick={() => void handleSubmit()}
            >
              편지 봉인하기
            </Button>
          </div>
        </div>
      </BottomSheet>

      {/* Wax seal stamp animation modal overlay */}
      <WaxSealStamp isCompleted={isSealCompleted} isSealing={isSealing} theme={theme} />
    </>
  );
}
