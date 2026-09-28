"use client";

import type { MediaDraft, MediaUpload } from "@/entities/media";
import type {
  TimeLetter,
  TimeLetterDraft,
  TimeLetterMedia,
  TimeLetterRecipientMode,
  TimeLetterTheme,
} from "@/entities/time-letter";
import {
  revokePreview,
  toMediaDraft,
  uploadDraft,
  validateFile,
} from "@/features/upload-media/@x/time-letter-compose";
import { THEME_STYLES, TIME_LETTER_THEMES } from "@/shared/config";
import { cn, toDayKey, toTimeField, type Nullable } from "@/shared/lib";
import { BottomSheet, Button, Chip, Input, Switch, Textarea, toast } from "@/shared/ui";
import { josa } from "es-hangul";
import { Check, History, ImagePlus, RotateCw, Video, X } from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState, type ChangeEvent } from "react";
import { patchTimeLetter } from "../api/patch-time-letter";
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
const AUTO_SAVE_DEBOUNCE_MS = 600;

const RECIPIENT_OPTIONS: readonly {
  label: string;
  mode: TimeLetterRecipientMode;
}[] = [
  { label: "상대방에게", mode: "partner" },
  { label: "우리 둘 모두에게", mode: "both" },
  { label: "나에게만", mode: "me" },
] as const;

type SaveStatus = "idle" | "saving" | "saved" | "error";

type TimeLetterComposeFormProps = {
  className?: string;
  initialLetter?: Nullable<TimeLetter>;
  partnerName?: string;
  onClose: () => void;
  onSuccess?: (letter: TimeLetter) => void;
};

function TimeLetterComposeForm({
  className,
  initialLetter,
  partnerName = "상대방",
  onClose,
  onSuccess,
}: TimeLetterComposeFormProps) {
  const isEditMode = Boolean(initialLetter);
  const [todayKey] = useState(() => toDayKey(Date.now()));
  const [initialDateTime] = useState(() => getDefaultScheduledDateTime());

  const [theme, setTheme] = useState<TimeLetterTheme>(() => initialLetter?.theme ?? "classic");
  const selectedThemeStyle = THEME_STYLES[theme] ?? THEME_STYLES.classic;

  const [scheduledDayKey, setScheduledDayKey] = useState<string>(() =>
    initialLetter ? toDayKey(initialLetter.scheduledAt) : initialDateTime.dayKey,
  );
  const [scheduledTime, setScheduledTime] = useState<string>(() =>
    initialLetter ? toTimeField(initialLetter.scheduledAt) : initialDateTime.time,
  );

  const [selectedPresetId, setSelectedPresetId] = useState<string>(() => {
    if (!initialLetter) {
      return "tomorrow";
    }
    const dayKey = toDayKey(initialLetter.scheduledAt);
    const time = toTimeField(initialLetter.scheduledAt);
    const matched = DATE_PRESETS.find(
      (preset) => preset.getDayKey(todayKey) === dayKey && preset.time === time,
    );
    return matched ? matched.id : "custom";
  });

  const [recipientMode, setRecipientMode] = useState<TimeLetterRecipientMode>(() => {
    if (!initialLetter) {
      return "partner";
    }
    if (initialLetter.onlyMe) {
      return "me";
    }
    if (initialLetter.recipientId) {
      return "partner";
    }
    return "both";
  });

  const [showTeaser, setShowTeaser] = useState<boolean>(() => initialLetter?.showTeaser ?? true);
  const [title, setTitle] = useState<string>(() => initialLetter?.title ?? "");
  const [content, setContent] = useState<string>(() => initialLetter?.content ?? "");
  const [existingMedia, setExistingMedia] = useState<TimeLetterMedia[]>(
    () => initialLetter?.media ?? [],
  );
  const [draftMedia, setDraftMedia] = useState<MediaDraft[]>([]);
  const [isProcessingMedia, setIsProcessingMedia] = useState<boolean>(false);
  const [saveStatus, setSaveStatus] = useState<SaveStatus>("idle");

  const [pendingDraft, setPendingDraft] = useState<Nullable<TimeLetterDraft>>(() =>
    initialLetter ? null : loadStoredDraft(),
  );
  const [isSealing, setIsSealing] = useState<boolean>(false);
  const [isSealCompleted, setIsSealCompleted] = useState<boolean>(false);
  const [isSubmitting, setIsSubmitting] = useState<boolean>(false);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const dateInputRef = useRef<HTMLInputElement>(null);
  const localStorageSaveTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const autoSaveTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const lastSavedSnapshotRef = useRef<Nullable<string>>(
    initialLetter
      ? JSON.stringify({
          content: (initialLetter.content ?? "").trim(),
          existingMediaIds: (initialLetter.media ?? []).map((m) => m.id),
          recipientMode: initialLetter.onlyMe
            ? "me"
            : initialLetter.recipientId
              ? "partner"
              : "both",
          scheduledDayKey: toDayKey(initialLetter.scheduledAt),
          scheduledTime: toTimeField(initialLetter.scheduledAt),
          showTeaser: initialLetter.showTeaser,
          theme: initialLetter.theme,
          title: (initialLetter.title ?? "").trim(),
        })
      : null,
  );

  // Validation
  const initialScheduledDate = useMemo(
    () => (initialLetter ? new Date(initialLetter.scheduledAt) : null),
    [initialLetter],
  );
  const dateValidation = validateLetterDate(scheduledDayKey, scheduledTime, initialScheduledDate);
  const isContentEmpty = content.trim().length === 0;
  const isSubmittable = !isContentEmpty && dateValidation.isValid && !isSealing && !isSubmitting;
  const totalMediaCount = existingMedia.length + draftMedia.length;

  // INFO: Performs debounced auto-save to server when in edit mode
  const performAutoSave = useCallback(async () => {
    if (!isEditMode || !initialLetter) {
      return;
    }

    const trimmedContent = content.trim();
    if (trimmedContent.length === 0) {
      return;
    }

    const validation = validateLetterDate(scheduledDayKey, scheduledTime, initialScheduledDate);
    if (!validation.isValid) {
      return;
    }

    const currentMediaIds = existingMedia.map((m) => m.id);
    const currentSnapshot = JSON.stringify({
      content: trimmedContent,
      existingMediaIds: currentMediaIds,
      recipientMode,
      scheduledDayKey,
      scheduledTime,
      showTeaser,
      theme,
      title: title.trim(),
    });

    if (currentSnapshot === lastSavedSnapshotRef.current && draftMedia.length === 0) {
      return;
    }

    setSaveStatus("saving");

    try {
      let uploadedMedia: MediaUpload[] = [];
      if (draftMedia.length > 0) {
        uploadedMedia = await Promise.all(
          draftMedia.map((draft) => uploadDraft(draft, { scope: "chat" })),
        );
      }

      const scheduledDate = new Date(`${scheduledDayKey}T${scheduledTime}:00`);

      const updated = await patchTimeLetter(initialLetter.id, {
        content: trimmedContent,
        media: uploadedMedia.length > 0 ? uploadedMedia : undefined,
        mediaIds: currentMediaIds,
        onlyMe: recipientMode === "me",
        recipientId: null,
        scheduledAt: scheduledDate.toISOString(),
        showTeaser: recipientMode === "me" ? false : showTeaser,
        theme,
        title: title.trim() || null,
      });

      setExistingMedia(updated.media);
      setDraftMedia([]);
      lastSavedSnapshotRef.current = JSON.stringify({
        content: (updated.content ?? "").trim(),
        existingMediaIds: updated.media.map((m) => m.id),
        recipientMode,
        scheduledDayKey,
        scheduledTime,
        showTeaser: updated.showTeaser,
        theme: updated.theme,
        title: (updated.title ?? "").trim(),
      });

      setSaveStatus("saved");
      onSuccess?.(updated);
    } catch {
      setSaveStatus("error");
    }
  }, [
    isEditMode,
    initialLetter,
    content,
    scheduledDayKey,
    scheduledTime,
    initialScheduledDate,
    existingMedia,
    recipientMode,
    showTeaser,
    theme,
    title,
    draftMedia,
    onSuccess,
  ]);

  // INFO: Debounced auto-save triggers whenever edit mode values change
  useEffect(() => {
    if (!isEditMode) {
      return;
    }

    if (autoSaveTimeoutRef.current) {
      clearTimeout(autoSaveTimeoutRef.current);
    }

    autoSaveTimeoutRef.current = setTimeout(() => {
      void performAutoSave();
    }, AUTO_SAVE_DEBOUNCE_MS);

    return () => {
      if (autoSaveTimeoutRef.current) {
        clearTimeout(autoSaveTimeoutRef.current);
      }
    };
  }, [
    isEditMode,
    title,
    content,
    theme,
    scheduledDayKey,
    scheduledTime,
    recipientMode,
    showTeaser,
    existingMedia,
    draftMedia,
    performAutoSave,
  ]);

  // INFO: Debounced 500ms auto-save to localStorage in create mode only
  useEffect(() => {
    if (isEditMode || isSealing || isSubmitting) {
      return;
    }

    if (localStorageSaveTimeoutRef.current) {
      clearTimeout(localStorageSaveTimeoutRef.current);
    }

    localStorageSaveTimeoutRef.current = setTimeout(() => {
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
      if (localStorageSaveTimeoutRef.current) {
        clearTimeout(localStorageSaveTimeoutRef.current);
      }
    };
  }, [
    isEditMode,
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

  // Remove an already-saved media item
  const handleRemoveExistingMedia = useCallback((indexToRemove: number) => {
    setExistingMedia((prev) => prev.filter((_, idx) => idx !== indexToRemove));
  }, []);

  // Remove a newly added draft media item and revoke object URL
  const handleRemoveDraftMedia = useCallback((indexToRemove: number) => {
    setDraftMedia((prev) => {
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
    if (pendingDraft.scheduledDayKey && pendingDraft.scheduledTime) {
      const matched = DATE_PRESETS.find(
        (preset) =>
          preset.getDayKey(todayKey) === pendingDraft.scheduledDayKey &&
          preset.time === pendingDraft.scheduledTime,
      );
      setSelectedPresetId(matched ? matched.id : "custom");
    } else if (pendingDraft.scheduledDayKey || pendingDraft.scheduledTime) {
      setSelectedPresetId("custom");
    }
    setRecipientMode(pendingDraft.recipientMode);
    setShowTeaser(pendingDraft.showTeaser);
    setPendingDraft(null);

    toast.success("임시 저장된 편지를 불러왔어요");
  };

  const handleSelectPreset = (preset: (typeof DATE_PRESETS)[number]) => {
    setSelectedPresetId(preset.id);
    setScheduledDayKey(preset.getDayKey(todayKey));
    setScheduledTime(preset.time);
  };

  const handleSelectCustom = () => {
    setSelectedPresetId("custom");
    try {
      dateInputRef.current?.showPicker?.();
    } catch {
      // INFO: Handled gracefully when showPicker is unsupported
    }
    dateInputRef.current?.focus();
  };

  const handleDayKeyChange = (newDayKey: string) => {
    setScheduledDayKey(newDayKey);
    const matched = DATE_PRESETS.find(
      (preset) => preset.getDayKey(todayKey) === newDayKey && preset.time === scheduledTime,
    );
    setSelectedPresetId(matched ? matched.id : "custom");
  };

  const handleTimeChange = (newTime: string) => {
    setScheduledTime(newTime);
    const matched = DATE_PRESETS.find(
      (preset) => preset.getDayKey(todayKey) === scheduledDayKey && preset.time === newTime,
    );
    setSelectedPresetId(matched ? matched.id : "custom");
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

    const remainingSlots = MAX_MEDIA_COUNT - totalMediaCount;
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
      setDraftMedia((prev) => [...prev, ...addedDrafts]);
    }

    setIsProcessingMedia(false);
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

    const minAnimationPromise = new Promise((resolve) => setTimeout(resolve, 1400));

    try {
      let uploadedMedia: MediaUpload[] = [];
      if (draftMedia.length > 0) {
        uploadedMedia = await Promise.all(
          draftMedia.map((draft) => uploadDraft(draft, { scope: "chat" })),
        );
      }

      const scheduledDate = new Date(`${scheduledDayKey}T${scheduledTime}:00`);
      if (Number.isNaN(scheduledDate.getTime())) {
        throw new Error("도착 일시를 올바르게 선택해 주세요");
      }

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

      await minAnimationPromise;

      setIsSealCompleted(true);
      clearStoredDraft();

      await new Promise((resolve) => setTimeout(resolve, 800));

      setIsSealing(false);
      setIsSubmitting(false);
      setIsSealCompleted(false);

      toast.success("타임머신 편지가 안전하게 봉인되었어요!");
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

  const handleFinishEdit = async () => {
    if (autoSaveTimeoutRef.current) {
      clearTimeout(autoSaveTimeoutRef.current);
    }
    await performAutoSave();
    toast.success("편지 수정 내용이 저장되었어요");
    onClose();
  };

  return (
    <div className={cn("space-y-xl pt-xs pb-xl", className)}>
      {/* Header indicator in edit mode */}
      {isEditMode && (
        <div className="flex items-center justify-between border-b border-hairline/50 pb-sm">
          <div className="flex items-center gap-2">
            <span className="text-title-sm font-bold text-ink">타임머신 편지 수정</span>
            {saveStatus === "saving" && (
              <span className="flex items-center gap-1 text-caption text-meta">
                <RotateCw className="size-3 animate-spin text-primary" aria-hidden />
                <span>저장 중...</span>
              </span>
            )}
            {saveStatus === "saved" && (
              <span className="flex items-center gap-1 text-caption text-primary">
                <Check className="size-3" aria-hidden />
                <span>저장됨</span>
              </span>
            )}
            {saveStatus === "error" && (
              <span className="text-caption text-semantic-error">저장 실패</span>
            )}
          </div>
          <Button
            buttonClassName="min-h-8 px-sm py-1 text-button-sm"
            haptic
            variant="primary"
            onClick={handleFinishEdit}
          >
            완료
          </Button>
        </div>
      )}

      {/* Draft restore banner (create mode only) */}
      {!isEditMode && pendingDraft && (
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

      {/* 1. Recipient selection */}
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

      {/* 2. Theme selector chips with haptic */}
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

      {/* 3. Title (optional) & Content textarea (required) */}
      <section className="space-y-xs">
        <div className="flex items-center justify-between">
          <label className="text-caption text-meta">편지 내용</label>
          <span className="font-mono text-caption tracking-widest uppercase opacity-60">
            Time Letter
          </span>
        </div>
        <div
          className={cn(
            "relative flex flex-col gap-sm rounded-xl p-md transition-all duration-300",
            selectedThemeStyle.parchment,
          )}
        >
          <Input
            className={cn(
              "border-0 bg-transparent px-0 text-title-md font-semibold tracking-tight shadow-none placeholder:opacity-50 focus-visible:ring-0",
              selectedThemeStyle.title,
            )}
            maxLength={100}
            placeholder="편지 제목 (선택)"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
          />
          <div className="relative">
            <Textarea
              className={cn(
                "min-h-48 resize-none border-0 bg-transparent px-0 py-xs text-body-md leading-relaxed shadow-none focus-visible:ring-0",
                selectedThemeStyle.body,
              )}
              maxLength={MAX_CONTENT_LENGTH}
              placeholder="미래의 소중한 순간에 전해질 이야기를 적어보세요..."
              value={content}
              onChange={(e) => setContent(e.target.value)}
            />
            <div className={cn("mt-1 text-right text-caption", selectedThemeStyle.dateStamp)}>
              {content.length.toLocaleString()} / {MAX_CONTENT_LENGTH.toLocaleString()}자
            </div>
          </div>
        </div>
      </section>

      {/* 4. Media uploader: Attach up to 10 photos/videos */}
      <section className="space-y-xs">
        <div className="flex items-center justify-between">
          <label className="text-caption text-meta">
            사진 / 동영상 첨부 ({totalMediaCount}/{MAX_MEDIA_COUNT})
          </label>
        </div>

        <div className="flex flex-wrap gap-xs">
          {/* Existing media previews */}
          {existingMedia.map((item, index) => (
            <div
              key={item.id}
              className="group relative size-18 shrink-0 overflow-hidden rounded-md border border-hairline bg-surface-soft"
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img className="size-full object-cover" alt="첨부된 미디어" src={item.previewUrl} />

              {item.isVideo && (
                <div className="absolute bottom-1 left-1 rounded bg-scrim/70 px-1 py-0.5 text-[10px] text-on-scrim">
                  동영상
                </div>
              )}

              <button
                className="absolute top-1 right-1 flex size-5 items-center justify-center rounded-full bg-scrim/80 text-on-scrim transition-colors hover:bg-scrim"
                type="button"
                aria-label="미디어 삭제"
                onClick={() => handleRemoveExistingMedia(index)}
              >
                <X className="size-3.5" />
              </button>
            </div>
          ))}

          {/* Draft media previews */}
          {draftMedia.map((item, index) => (
            <div
              key={item.id}
              className="group relative size-18 shrink-0 overflow-hidden rounded-md border border-hairline bg-surface-soft"
            >
              {item.previewUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img className="size-full object-cover" alt="첨부된 미디어" src={item.previewUrl} />
              ) : (
                <div className="flex size-full items-center justify-center text-meta">
                  {item.durationMs ? (
                    <Video className="size-5" />
                  ) : (
                    <ImagePlus className="size-5" />
                  )}
                </div>
              )}

              {item.durationMs !== null && (
                <div className="absolute bottom-1 left-1 rounded bg-scrim/70 px-1 py-0.5 text-[10px] text-on-scrim">
                  동영상
                </div>
              )}

              <button
                className="absolute top-1 right-1 flex size-5 items-center justify-center rounded-full bg-scrim/80 text-on-scrim transition-colors hover:bg-scrim"
                type="button"
                aria-label="미디어 삭제"
                onClick={() => handleRemoveDraftMedia(index)}
              >
                <X className="size-3.5" />
              </button>
            </div>
          ))}

          {/* Add media button */}
          {totalMediaCount < MAX_MEDIA_COUNT && (
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

      {/* 5. Date selection */}
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
            const isSelected = selectedPresetId === preset.id;

            return (
              <Chip
                key={preset.id}
                haptic
                isSelected={isSelected}
                onClick={() => handleSelectPreset(preset)}
              >
                {preset.label}
              </Chip>
            );
          })}
          <Chip haptic isSelected={selectedPresetId === "custom"} onClick={handleSelectCustom}>
            직접 설정
          </Chip>
        </div>

        {/* Custom Date & Time pickers */}
        <div className="flex gap-xs">
          <Input
            ref={dateInputRef}
            className="min-w-0 flex-1"
            min={todayKey}
            type="date"
            value={scheduledDayKey}
            aria-invalid={!dateValidation.isValid}
            onChange={(e) => handleDayKeyChange(e.target.value)}
          />
          <Input
            className="w-36 shrink-0 px-3"
            type="time"
            value={scheduledTime}
            aria-invalid={!dateValidation.isValid}
            onChange={(e) => handleTimeChange(e.target.value)}
          />
        </div>

        {/* Date validation issue warning */}
        {!dateValidation.isValid && dateValidation.issue && (
          <p className="text-caption text-semantic-error" role="alert">
            {dateValidation.issue}
          </p>
        )}
      </section>

      {/* 6. Show Teaser toggle switch with haptic */}
      <section className="flex items-center justify-between gap-md rounded-lg border border-hairline bg-surface-soft/60 px-md py-sm">
        <div className="space-y-0.5">
          <p className="text-body-sm font-medium text-ink">상대방에게 D-Day 카운트다운 보여주기</p>
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

      {/* 7. Bottom action button */}
      <div className="pt-sm">
        {isEditMode ? (
          <Button className="w-full" haptic variant="primary" onClick={handleFinishEdit}>
            완료
          </Button>
        ) : (
          <Button
            disabled={!isSubmittable || isSubmitting}
            haptic
            onClick={() => void handleSubmit()}
          >
            편지 봉인하기
          </Button>
        )}
      </div>

      {/* Wax seal stamp animation modal overlay (create mode only) */}
      {!isEditMode && (
        <WaxSealStamp isCompleted={isSealCompleted} isSealing={isSealing} theme={theme} />
      )}
    </div>
  );
}

export type TimeLetterComposeSheetProps = {
  className?: string;
  isOpen: boolean;
  initialLetter?: Nullable<TimeLetter>;
  partnerName?: string;
  onClose: () => void;
  onSuccess?: (letter: TimeLetter) => void;
};

export function TimeLetterComposeSheet({
  className,
  isOpen,
  initialLetter,
  partnerName = "상대방",
  onClose,
  onSuccess,
}: TimeLetterComposeSheetProps) {
  const isEditMode = Boolean(initialLetter);

  return (
    <BottomSheet
      className={className}
      isOpen={isOpen}
      header={{
        title: isEditMode ? "타임머신 편지 수정" : "타임머신 편지 쓰기",
        isHidden: true,
      }}
      onClose={onClose}
    >
      {isOpen && (
        <TimeLetterComposeForm
          key={initialLetter?.id ?? "create"}
          initialLetter={initialLetter}
          partnerName={partnerName}
          onClose={onClose}
          onSuccess={onSuccess}
        />
      )}
    </BottomSheet>
  );
}
