"use client";

import type { TimeLetter } from "@/entities/time-letter";
import { TimeLetterComposeSheet } from "@/features/time-letter-compose";
import { TimeLetterViewerSheet } from "@/features/time-letter-viewer";
import {
  CHAT_ROUTE,
  PLAYGROUND_ROUTE,
  SIDE_PANEL_MEDIA_QUERY,
  THEME_STYLES,
} from "@/shared/config";
import {
  cn,
  formatDate,
  formatTime,
  isBareKey,
  isLetterKey,
  toDayKey,
  useRovingTabIndex,
  useSidePanel,
  type Nullable,
  type UserId,
} from "@/shared/lib";
import {
  ActionSheet,
  AppHeader,
  Button,
  Chip,
  Container,
  EmptyState,
  IconButton,
  LoadMoreSentinel,
  MediaViewer,
  TwoPane,
  type MediaCell,
} from "@/shared/ui";
import {
  ChevronLeft,
  Clock,
  Lock,
  Mail,
  MailOpen,
  Plus,
  RotateCw,
  Sparkles,
  Trash2,
  Video,
} from "lucide-react";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useTimeLetters, type TimeLetterFilter } from "../model/use-time-letters";
import { TimeLetterCard } from "./time-letter-card";

export type TimeLettersPageProps = {
  className?: string;
  currentUserId: UserId;
  partnerName?: string;
  initialLetters: TimeLetter[];
  initialNextCursor?: Nullable<string>;
  initialHasMore?: boolean;
  initialLetterId?: string;
};

const FILTER_TABS: readonly { label: string; id: TimeLetterFilter }[] = [
  { id: "all", label: "전체" },
  { id: "scheduled", label: "봉인된 편지" },
  { id: "sent", label: "전송된 편지" },
] as const;

export function TimeLettersPage({
  className,
  currentUserId,
  partnerName = "상대방",
  initialLetters,
  initialNextCursor = null,
  initialHasMore = false,
  initialLetterId,
}: TimeLettersPageProps) {
  const router = useRouter();
  const { isOpen: isSidePanelOpen, open: openSidePanel } = useSidePanel();
  const sidePanelScrollerRef = useRef<Nullable<HTMLDivElement>>(null);

  const {
    letters,
    filter,
    hasMore,
    isLoadingMore,
    isRefreshing,
    loadMore,
    refresh,
    handleFilterChange,
    cancelLetter,
    addLetterOptimistic,
  } = useTimeLetters({
    initialLetters,
    initialNextCursor,
    initialHasMore,
  });

  // Selection & Modal States
  const [selectedIndex, setSelectedIndex] = useState<number>(() => {
    if (initialLetterId) {
      const idx = initialLetters.findIndex((l) => l.id === initialLetterId);
      if (idx !== -1) {
        return idx;
      }
    }
    return 0;
  });

  const [isComposeOpen, setIsComposeOpen] = useState(false);
  const [isMobileViewerOpen, setIsMobileViewerOpen] = useState(false);
  const [isCancelSheetOpen, setIsCancelSheetOpen] = useState(false);
  const [activeMediaIndex, setActiveMediaIndex] = useState<Nullable<number>>(null);

  const selectedLetter = letters[selectedIndex] ?? null;

  const handleBack = useCallback(() => {
    // INFO: REQUIREMENTS.md § 8.14. 데스크톱(lg)에서 사이드패널이 닫혀있는 상태라면 패널을 먼저 열고, 열려 있으면 놀이터 홈으로 이동.
    if (
      typeof window !== "undefined" &&
      window.matchMedia(SIDE_PANEL_MEDIA_QUERY).matches &&
      !isSidePanelOpen
    ) {
      openSidePanel();
      return;
    }
    router.push(PLAYGROUND_ROUTE);
  }, [isSidePanelOpen, openSidePanel, router]);

  // Keyboard Shortcuts (j/k, c, Enter)
  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.isComposing) {
        return;
      }
      const target = event.target as HTMLElement;
      if (target.tagName === "INPUT" || target.tagName === "TEXTAREA" || target.isContentEditable) {
        return;
      }

      if ((isBareKey(event) && isLetterKey(event, "j")) || event.key === "ArrowDown") {
        event.preventDefault();
        setSelectedIndex((prev) => Math.min(letters.length - 1, prev + 1));
      } else if ((isBareKey(event) && isLetterKey(event, "k")) || event.key === "ArrowUp") {
        event.preventDefault();
        setSelectedIndex((prev) => Math.max(0, prev - 1));
      } else if (isBareKey(event) && (isLetterKey(event, "c") || isLetterKey(event, "n"))) {
        event.preventDefault();
        setIsComposeOpen(true);
      } else if (event.key === "Enter" && selectedLetter) {
        setIsMobileViewerOpen(true);
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [letters.length, selectedLetter]);

  const handleRovingKeyDown = useRovingTabIndex({
    orientation: "vertical",
    selector: "[data-letter-item]",
  });

  const handleSelectLetter = useCallback((index: number) => {
    setSelectedIndex(index);
    // On mobile screen, clicking opens the viewer sheet
    if (typeof window !== "undefined" && !window.matchMedia(SIDE_PANEL_MEDIA_QUERY).matches) {
      setIsMobileViewerOpen(true);
    }
  }, []);

  const handleReply = useCallback(
    (_letter?: TimeLetter) => {
      setIsMobileViewerOpen(false);
      router.push(CHAT_ROUTE);
    },
    [router],
  );

  const handleConfirmCancel = useCallback(async () => {
    if (!selectedLetter) {
      return;
    }
    const success = await cancelLetter(selectedLetter.id);
    if (success) {
      setIsCancelSheetOpen(false);
      setIsMobileViewerOpen(false);
      setSelectedIndex((prev) => Math.max(0, prev - 1));
    }
  }, [cancelLetter, selectedLetter]);

  const letterMedia = selectedLetter?.media;

  // Media cells for desktop reading pane
  const desktopMediaCells: MediaCell[] = useMemo(() => {
    if (!letterMedia || letterMedia.length === 0) {
      return [];
    }
    return letterMedia.map((m) => ({
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
  }, [letterMedia]);

  const selectedThemeStyle = selectedLetter
    ? (THEME_STYLES[selectedLetter.theme] ?? THEME_STYLES.classic)
    : THEME_STYLES.classic;

  const isSender = selectedLetter ? selectedLetter.senderId === currentUserId : false;
  const isScheduled = selectedLetter ? selectedLetter.status === "scheduled" : false;
  const isTeaser = isScheduled && !isSender;

  return (
    <TwoPane
      className={className}
      panelScrollerRef={sidePanelScrollerRef}
      panel={
        <div className="flex flex-col gap-sm p-md">
          {/* Top Panel Actions */}
          <div className="flex items-center justify-between px-xs py-1">
            <span className="text-caption font-semibold text-meta">편지함 ({letters.length})</span>
            <Button
              className="min-h-8! w-auto! px-sm! py-1! text-button-sm font-medium"
              haptic
              variant="primary"
              onClick={() => setIsComposeOpen(true)}
            >
              <Plus className="size-3.5" />
              <span>새 편지</span>
            </Button>
          </div>

          {/* Filter Chips */}
          <div className="scrollbar-hidden flex items-center gap-xs overflow-x-auto pb-1">
            {FILTER_TABS.map((tab) => (
              <Chip
                key={tab.id}
                haptic
                isSelected={filter === tab.id}
                onClick={() => handleFilterChange(tab.id)}
              >
                {tab.label}
              </Chip>
            ))}
          </div>

          {/* Letters List */}
          {letters.length === 0 ? (
            <p className="p-md text-center text-body-sm text-meta">보관된 편지가 없어요</p>
          ) : (
            <div className="flex flex-col gap-sm" onKeyDown={handleRovingKeyDown}>
              {letters.map((letter, index) => (
                <TimeLetterCard
                  key={letter.id}
                  currentUserId={currentUserId}
                  isSelected={index === selectedIndex}
                  letter={letter}
                  onClick={() => handleSelectLetter(index)}
                />
              ))}
            </div>
          )}

          {hasMore && !isLoadingMore && (
            <LoadMoreSentinel
              key={`desktop-sentinel-${letters.length}`}
              rootRef={sidePanelScrollerRef}
              onVisible={loadMore}
            />
          )}

          {isLoadingMore && (
            <div className="flex justify-center py-md" aria-label="편지 목록을 불러오는 중">
              <RotateCw className="size-5 animate-spin text-meta" />
            </div>
          )}
        </div>
      }
    >
      <AppHeader
        hasSidePanel
        title="타임머신 편지"
        trailingFadesOnScroll
        leading={
          <IconButton
            haptic
            Icon={ChevronLeft}
            variant="floating"
            aria-label="뒤로"
            onClick={handleBack}
          />
        }
        trailing={
          <div className="flex items-center gap-xs">
            <IconButton
              iconClassName={isRefreshing ? "animate-spin" : undefined}
              disabled={isRefreshing}
              haptic
              Icon={RotateCw}
              variant="floating"
              aria-label="새로고침"
              onClick={() => void refresh()}
            />
            <Button
              className="min-h-9! w-auto! px-sm! py-1! text-button-sm font-medium lg:hidden"
              haptic
              variant="primary"
              onClick={() => setIsComposeOpen(true)}
            >
              <Plus className="size-4" />
              <span>새 편지</span>
            </Button>
          </div>
        }
      />

      {/* Mobile view (< lg) */}
      <Container
        className="space-y-md py-md pt-[calc(var(--app-header-inset)+var(--spacing-md))] pb-2xl lg:hidden"
        size="md"
      >
        {/* Filter Chips */}
        <div className="scrollbar-hidden flex items-center gap-xs overflow-x-auto pb-1">
          {FILTER_TABS.map((tab) => (
            <Chip
              key={tab.id}
              haptic
              isSelected={filter === tab.id}
              onClick={() => handleFilterChange(tab.id)}
            >
              {tab.label}
            </Chip>
          ))}
        </div>

        {letters.length === 0 ? (
          <EmptyState
            description="아직 등록된 타임머신 편지가 없어요. 미래의 소중한 순간에 도착할 편지를 적어보세요."
            Icon={Mail}
          />
        ) : (
          <div className="flex flex-col gap-sm">
            {letters.map((letter, index) => (
              <TimeLetterCard
                key={letter.id}
                currentUserId={currentUserId}
                letter={letter}
                onClick={() => handleSelectLetter(index)}
              />
            ))}
          </div>
        )}

        {hasMore && !isLoadingMore && (
          <LoadMoreSentinel key={`mobile-sentinel-${letters.length}`} onVisible={loadMore} />
        )}

        {isLoadingMore && (
          <div className="flex justify-center py-md" aria-label="편지를 불러오는 중">
            <RotateCw className="size-5 animate-spin text-meta" />
          </div>
        )}
      </Container>

      {/* Desktop reading pane (>= lg) */}
      <div className="hidden flex-1 flex-col pt-[calc(var(--app-header-inset)+var(--spacing-xs))] pb-2xl lg:flex">
        <Container className="space-y-lg" size="md">
          {letters.length === 0 ? (
            <EmptyState
              description="아직 등록된 타임머신 편지가 없어요. 상단의 '새 편지' 버튼을 눌러 미래로 편지를 보내보세요."
              Icon={Mail}
            />
          ) : selectedLetter ? (
            <div className="flex flex-col gap-lg">
              {/* Header Info Banner */}
              <div className="flex items-center justify-between border-b border-hairline pb-sm">
                <div className="flex items-center gap-2">
                  <span className="inline-flex items-center gap-1 rounded-full bg-surface-soft px-2.5 py-1 text-caption font-medium text-meta">
                    {isScheduled ? (
                      <Lock className="size-3.5" />
                    ) : (
                      <MailOpen className="size-3.5" />
                    )}
                    <span>{isScheduled ? "봉인 보관 중" : "전송 완료"}</span>
                  </span>
                  <span className="text-caption text-meta">
                    {formatDate(selectedLetter.createdAt)}
                    {toDayKey(selectedLetter.createdAt) === toDayKey(new Date()) &&
                      ` ${formatTime(selectedLetter.createdAt)}`}
                    에 묻어둠
                  </span>
                </div>

                {isScheduled && isSender && (
                  <Button
                    className="min-h-8! w-auto! px-sm! py-1! text-button-sm text-semantic-error hover:bg-semantic-error/10"
                    haptic
                    variant="ghost"
                    onClick={() => setIsCancelSheetOpen(true)}
                  >
                    <Trash2 className="size-3.5" />
                    <span>봉인 취소</span>
                  </Button>
                )}
              </div>

              {/* Main Letter Card Display */}
              <div
                className={cn(
                  "relative overflow-hidden rounded-2xl p-xl transition-all",
                  selectedThemeStyle.parchment,
                )}
              >
                {/* Teaser state for recipient */}
                {isTeaser ? (
                  <div className="flex flex-col items-center justify-center gap-md py-12 text-center">
                    <div className="flex size-16 items-center justify-center rounded-full bg-primary/10 text-primary">
                      <Sparkles className="size-8" />
                    </div>
                    <div className="flex flex-col gap-xs">
                      <h2 className="text-title-lg font-bold text-ink">
                        {selectedLetter.senderName ?? partnerName}님이 보낸 비밀 편지예요
                      </h2>
                      <p className="text-body-md text-meta">
                        {formatDate(selectedLetter.scheduledAt)}{" "}
                        {formatTime(selectedLetter.scheduledAt)}에 대화방으로 배달돼요.
                      </p>
                    </div>
                    <div className="bg-surface rounded-xl border border-hairline p-md text-caption text-meta">
                      개봉일까지 본문과 사진은 안전하게 암호화 및 봉인 처리되어 보호돼요.
                    </div>
                  </div>
                ) : (
                  <div className="flex flex-col gap-md">
                    {/* Title & Scheduled Time */}
                    <div className="flex flex-col gap-xs">
                      <div className="flex items-center gap-2 text-caption text-meta">
                        <Clock className="size-3.5" />
                        <span>
                          {isScheduled ? "도착 예정: " : "도착: "}
                          {formatDate(
                            isScheduled
                              ? selectedLetter.scheduledAt
                              : (selectedLetter.sentAt ?? selectedLetter.scheduledAt),
                          )}{" "}
                          {formatTime(
                            isScheduled
                              ? selectedLetter.scheduledAt
                              : (selectedLetter.sentAt ?? selectedLetter.scheduledAt),
                          )}
                        </span>
                      </div>
                      <h1
                        className={cn(
                          "text-display-xs leading-tight font-bold",
                          selectedThemeStyle.title,
                        )}
                      >
                        {selectedLetter.title || "제목 없는 편지"}
                      </h1>
                    </div>

                    <hr className={cn("my-1 border-t", selectedThemeStyle.divider)} />

                    {/* Content Body */}
                    <div
                      className={cn(
                        "text-body-md leading-relaxed whitespace-pre-wrap",
                        selectedThemeStyle.body,
                      )}
                    >
                      {selectedLetter.content}
                    </div>

                    {/* Attached Photos / Videos */}
                    {selectedLetter.media && selectedLetter.media.length > 0 && (
                      <div className="mt-md flex flex-col gap-xs">
                        <span className="text-caption font-semibold text-meta">
                          첨부된 추억 ({selectedLetter.media.length}장)
                        </span>
                        <div className="grid grid-cols-3 gap-xs sm:grid-cols-4">
                          {selectedLetter.media.map((mediaItem, idx) => (
                            <button
                              key={mediaItem.id}
                              className="group relative aspect-square cursor-pointer overflow-hidden rounded-lg border border-hairline bg-surface-soft outline-none focus-visible:ring-2 focus-visible:ring-primary"
                              type="button"
                              onClick={() => setActiveMediaIndex(idx)}
                            >
                              {/* eslint-disable-next-line @next/next/no-img-element */}
                              <img
                                className="size-full object-cover transition-transform duration-200 group-hover:scale-105"
                                alt="첨부 사진"
                                src={mediaItem.previewUrl}
                              />
                              {mediaItem.isVideo && (
                                <div className="absolute inset-0 flex items-center justify-center bg-scrim/30 text-on-primary">
                                  <Video className="size-6" />
                                </div>
                              )}
                            </button>
                          ))}
                        </div>
                      </div>
                    )}

                    {/* Reply Action for Delivered Letters */}
                    {!isScheduled && (
                      <div className="mt-lg flex justify-end border-t border-hairline pt-md">
                        <Button
                          className="w-auto! px-lg! py-sm!"
                          haptic
                          variant="primary"
                          onClick={() => handleReply(selectedLetter)}
                        >
                          <span>{partnerName}에게 답장 보내기</span>
                        </Button>
                      </div>
                    )}
                  </div>
                )}
              </div>
            </div>
          ) : (
            <EmptyState description="편지를 선택하여 내용을 확인해보세요" Icon={Mail} />
          )}
        </Container>
      </div>

      {/* Mobile Viewer BottomSheet */}
      {selectedLetter && (
        <TimeLetterViewerSheet
          isOpen={isMobileViewerOpen}
          isSender={isSender}
          letter={selectedLetter}
          partnerName={partnerName}
          onCancel={() => {
            setIsMobileViewerOpen(false);
            setIsCancelSheetOpen(true);
          }}
          onClose={() => setIsMobileViewerOpen(false)}
          onReply={handleReply}
        />
      )}

      {/* Compose Sheet */}
      <TimeLetterComposeSheet
        isOpen={isComposeOpen}
        partnerName={partnerName}
        onSuccess={(letter) => {
          setIsComposeOpen(false);
          addLetterOptimistic(letter);
          setSelectedIndex(0);
          void refresh();
        }}
        onClose={() => setIsComposeOpen(false)}
      />

      {/* Cancel Confirmation ActionSheet */}
      <ActionSheet
        isOpen={isCancelSheetOpen}
        header={{
          title: "편지 봉인 취소",
          description:
            "봉인을 취소하면 작성한 편지와 첨부된 미디어가 영구히 삭제돼요. 정말 취소할까요?",
        }}
        items={[
          {
            label: "봉인 취소 및 파기",
            Icon: Trash2,
            variant: "destructive",
            onSelect: () => void handleConfirmCancel(),
          },
        ]}
        onClose={() => setIsCancelSheetOpen(false)}
      />

      {/* Media Viewer Lightbox */}
      {desktopMediaCells.length > 0 && activeMediaIndex !== null && (
        <MediaViewer
          cells={desktopMediaCells}
          initialIndex={activeMediaIndex}
          onClose={() => setActiveMediaIndex(null)}
        />
      )}
    </TwoPane>
  );
}
