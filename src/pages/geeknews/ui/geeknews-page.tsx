"use client";

import type { GeeknewsFeedArticle } from "@/entities/geeknews";
import { PLAYGROUND_ROUTE, SIDE_PANEL_MEDIA_QUERY } from "@/shared/config";
import {
  cn,
  isBareKey,
  isLetterKey,
  useRovingTabIndex,
  useSidePanel,
  type NewsArticleId,
  type Nullable,
} from "@/shared/lib";
import { OFFLINE_MESSAGES } from "@/shared/offline-ux";
import {
  AppHeader,
  BottomSheet,
  Container,
  EmptyState,
  IconButton,
  LoadMoreSentinel,
  RelativeTime,
  Switch,
  toast,
  TwoPane,
} from "@/shared/ui";
import { Bell, BellRing, ChevronLeft, ExternalLink, Newspaper, RotateCw } from "lucide-react";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState, type MouseEvent } from "react";
import { useGeeknewsArticles, useGeeknewsSubscription, useMarkArticleRead } from "../model";

export type GeeknewsPageProps = {
  className?: string;
  initialArticleId?: string;
  initialArticles: GeeknewsFeedArticle[];
};

function toDomain(url: string): string {
  try {
    const candidate =
      url.startsWith("http://") || url.startsWith("https://") ? url : `https://${url}`;
    const hostname = new URL(candidate).hostname.replace(/^www\./, "");
    if (hostname.includes("news.hada.io") || url.includes("topic?id=")) {
      return "news.hada.io";
    }
    return hostname;
  } catch {
    return "news.hada.io";
  }
}

export function GeeknewsPage({ className, initialArticleId, initialArticles }: GeeknewsPageProps) {
  const router = useRouter();
  const { articles, hasMore, isLoadingMore, loadMore } = useGeeknewsArticles(initialArticles);
  const sidePanelScrollerRef = useRef<Nullable<HTMLDivElement>>(null);
  const [readState, setReadState] = useState<Record<string, boolean>>(() =>
    initialArticleId ? { [initialArticleId]: true } : {},
  );
  const [prevInitialArticleId, setPrevInitialArticleId] = useState(initialArticleId);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [openedArticleId, setOpenedArticleId] = useState<NewsArticleId | null>(
    () => (initialArticleId as NewsArticleId) ?? null,
  );

  const {
    isPending: isSubscriptionPending,
    isSubscribed,
    toggleSubscription,
  } = useGeeknewsSubscription();
  const { markRead } = useMarkArticleRead();
  const { isOpen: isSidePanelOpen, open: openSidePanel } = useSidePanel();

  const initialIndex = useMemo(() => {
    if (initialArticleId) {
      const found = initialArticles.findIndex((a) => a.id === initialArticleId);
      if (found !== -1) {
        return found;
      }
    }
    return 0;
  }, [initialArticleId, initialArticles]);

  const [selectedIndex, setSelectedIndex] = useState(initialIndex);

  if (prevInitialArticleId !== initialArticleId) {
    setPrevInitialArticleId(initialArticleId);
    if (initialArticleId) {
      setOpenedArticleId(initialArticleId as NewsArticleId);
      setReadState((prev) => ({ ...prev, [initialArticleId]: true }));
      const foundIdx = initialArticles.findIndex((a) => a.id === initialArticleId);
      if (foundIdx !== -1) {
        setSelectedIndex(foundIdx);
      }
    }
  }

  const markReadOptimistic = useCallback(
    (articleId: NewsArticleId) => {
      setReadState((prev) => (prev[articleId] ? prev : { ...prev, [articleId]: true }));
      void markRead(articleId);
    },
    [markRead],
  );

  const markedInitialIdRef = useRef<string | null>(null);

  // INFO: REQUIREMENTS.md § 19. 데스크톱(lg)에서 진입하거나 뷰포트 확대 시 리딩 페인에 노출되는 기사 및 딥링크된 기사를 읽음 처리
  useEffect(() => {
    if (initialArticleId) {
      if (markedInitialIdRef.current !== initialArticleId) {
        markedInitialIdRef.current = initialArticleId;
        void markRead(initialArticleId as NewsArticleId);
      }
      return;
    }

    if (typeof window === "undefined") {
      return;
    }

    const query = window.matchMedia(SIDE_PANEL_MEDIA_QUERY);

    const markVisibleArticleRead = () => {
      if (query.matches) {
        const target = articles[selectedIndex] ?? initialArticles[initialIndex];
        if (target && !(readState[target.id] ?? target.isRead)) {
          markReadOptimistic(target.id);
        }
      }
    };

    markVisibleArticleRead();

    query.addEventListener("change", markVisibleArticleRead);
    return () => query.removeEventListener("change", markVisibleArticleRead);
  }, [
    initialArticleId,
    initialIndex,
    initialArticles,
    selectedIndex,
    articles,
    markRead,
    markReadOptimistic,
    readState,
  ]);

  const handleSelectArticle = useCallback(
    (index: number) => {
      setSelectedIndex(index);
      const target = articles[index];
      if (target && !(readState[target.id] ?? target.isRead)) {
        markReadOptimistic(target.id);
      }
    },
    [articles, markReadOptimistic, readState],
  );

  const handleOpenArticle = useCallback(
    (article: GeeknewsFeedArticle) => {
      setOpenedArticleId(article.id);
      if (!(readState[article.id] ?? article.isRead)) {
        markReadOptimistic(article.id);
      }
    },
    [markReadOptimistic, readState],
  );

  const handleRefresh = useCallback(() => {
    setIsRefreshing(true);
    router.refresh();
    setTimeout(() => {
      setIsRefreshing(false);
    }, 600);
  }, [router]);

  const handleToggleSubscription = useCallback(async () => {
    try {
      const nextState = await toggleSubscription();
      if (nextState) {
        toast("새로운 개발자 뉴스 알림을 받아요");
      } else {
        toast("더 이상 뉴스 알림을 받지 않아요");
      }
    } catch {
      toast("알림 설정을 변경하지 못했어요");
    }
  }, [toggleSubscription]);

  const handleBack = useCallback(() => {
    // INFO: 데스크톱(lg)에서 사이드패널이 닫혀있는 상태라면, 기사 목록을 먼저 열고 이미 열려 있을 때 상위 놀이터로 이동한다.
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

  const handleExternalLinkClick = useCallback((e: MouseEvent<HTMLAnchorElement>) => {
    if (!navigator.onLine) {
      e.preventDefault();
      toast(OFFLINE_MESSAGES.view);
    }
  }, []);

  // INFO: Keyboard shortcuts for desktop navigation (REQUIREMENTS.md § 8.14.)
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.isComposing) {
        return;
      }

      const target = e.target as HTMLElement | null;
      if (
        target &&
        (target.tagName === "INPUT" || target.tagName === "TEXTAREA" || target.isContentEditable)
      ) {
        return;
      }

      if (!isBareKey(e)) {
        return;
      }

      if (articles.length === 0) {
        return;
      }

      if (e.key === "ArrowUp" || isLetterKey(e, "k")) {
        e.preventDefault();
        setSelectedIndex((prev) => {
          const next = prev <= 0 ? articles.length - 1 : prev - 1;
          const targetArticle = articles[next];
          if (targetArticle && !(readState[targetArticle.id] ?? targetArticle.isRead)) {
            markReadOptimistic(targetArticle.id);
          }
          return next;
        });
      } else if (e.key === "ArrowDown" || isLetterKey(e, "j")) {
        e.preventDefault();
        setSelectedIndex((prev) => {
          const next = prev >= articles.length - 1 ? 0 : prev + 1;
          const targetArticle = articles[next];
          if (targetArticle && !(readState[targetArticle.id] ?? targetArticle.isRead)) {
            markReadOptimistic(targetArticle.id);
          }
          return next;
        });
      } else if (e.key === "Enter" || isLetterKey(e, "o")) {
        const current = articles[selectedIndex];
        if (current) {
          e.preventDefault();
          if (!navigator.onLine) {
            toast(OFFLINE_MESSAGES.view);
            return;
          }
          window.open(current.sourceUrl ?? current.url, "_blank", "noopener,noreferrer");
        }
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [articles, selectedIndex, markReadOptimistic, readState]);

  const handleRovingKeyDown = useRovingTabIndex({
    orientation: "vertical",
    selector: "[data-feed-item]",
  });

  const selectedArticle = articles[selectedIndex] ?? null;
  const sheetArticle = articles.find((a) => a.id === openedArticleId) ?? null;
  const isSheetOpen = sheetArticle !== null;

  return (
    <TwoPane
      className={className}
      panelScrollerRef={sidePanelScrollerRef}
      panel={
        <div className="flex flex-col gap-sm p-md">
          <div className="flex items-center justify-between px-xs py-1">
            <span className="text-caption font-semibold text-meta">
              기사 목록 ({articles.length})
            </span>
          </div>
          {articles.length === 0 ? (
            <p className="p-md text-center text-body-sm text-meta">등록된 뉴스가 없어요</p>
          ) : (
            <div className="flex flex-col gap-sm" onKeyDown={handleRovingKeyDown}>
              {articles.map((article, index) => {
                const isSelected = index === selectedIndex;
                const isRead = readState[article.id] ?? article.isRead;
                return (
                  <button
                    key={article.id}
                    className={cn(
                      "group flex w-full cursor-pointer flex-col gap-1.5 rounded-xl border p-md text-left transition-colors outline-none focus-visible:ring-2 focus-visible:ring-primary",
                      isSelected
                        ? "border-primary bg-primary-tint"
                        : "bg-surface border-hairline hover:border-hairline-strong hover:bg-surface-soft active:bg-surface-strong",
                    )}
                    tabIndex={isSelected ? 0 : -1}
                    type="button"
                    data-feed-item
                    onClick={() => handleSelectArticle(index)}
                  >
                    <div className="flex items-center justify-between gap-xs text-caption text-meta">
                      <span className="truncate font-medium">
                        {toDomain(article.sourceUrl ?? article.url)}
                      </span>
                      <RelativeTime date={article.publishedAt} />
                    </div>
                    <h3
                      className={cn(
                        "line-clamp-2 text-body-md transition-colors",
                        isRead ? "font-normal text-meta" : "font-semibold text-ink",
                      )}
                    >
                      {article.title}
                    </h3>
                    <p className="line-clamp-2 text-body-sm text-meta">{article.summary}</p>
                  </button>
                );
              })}
            </div>
          )}
          {hasMore && !isLoadingMore && (
            <LoadMoreSentinel
              key={`desktop-sentinel-${articles.length}`}
              rootRef={sidePanelScrollerRef}
              onVisible={loadMore}
            />
          )}
          {isLoadingMore && (
            <div className="flex justify-center py-md" aria-label="기사를 불러오는 중">
              <RotateCw className="size-5 animate-spin text-meta" />
            </div>
          )}
        </div>
      }
    >
      <AppHeader
        hasSidePanel
        title="개발자 뉴스"
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
            <div className="flex items-center gap-1.5" title="새 뉴스 알림">
              {isSubscribed ? (
                <BellRing
                  className="size-4 shrink-0 text-primary transition-colors"
                  aria-hidden="true"
                />
              ) : (
                <Bell className="size-4 shrink-0 text-meta transition-colors" aria-hidden="true" />
              )}
              <Switch
                checked={isSubscribed}
                disabled={isSubscriptionPending}
                haptic
                isOfflineGated
                aria-label="새 뉴스 알림 받기"
                onCheckedChange={() => void handleToggleSubscription()}
              />
            </div>
            <IconButton
              iconClassName={isRefreshing ? "animate-spin" : undefined}
              disabled={isRefreshing}
              haptic
              Icon={RotateCw}
              variant="floating"
              aria-label="새로고침"
              onClick={handleRefresh}
            />
          </div>
        }
      />

      {/* Mobile view (< lg): flows on the document scroller without nested overflow */}
      <Container
        className="space-y-md py-md pt-[calc(var(--app-header-inset)+var(--spacing-md))] pb-2xl lg:hidden"
        size="md"
      >
        {articles.length === 0 ? (
          <EmptyState
            description="아직 등록된 뉴스가 없어요. 새 소식이 등록되면 여기에 표시돼요"
            Icon={Newspaper}
          />
        ) : (
          <div className="flex flex-col gap-sm">
            {articles.map((article) => {
              const isRead = readState[article.id] ?? article.isRead;
              return (
                <button
                  key={article.id}
                  className="group bg-surface flex w-full cursor-pointer flex-col gap-1.5 rounded-xl border border-hairline p-md text-left transition-colors outline-none hover:border-hairline-strong hover:bg-surface-soft focus-visible:ring-2 focus-visible:ring-primary active:bg-surface-strong"
                  type="button"
                  onClick={() => handleOpenArticle(article)}
                >
                  <div className="flex items-center justify-between gap-xs text-caption text-meta">
                    <span className="truncate font-medium">
                      {toDomain(article.sourceUrl ?? article.url)}
                    </span>
                    <RelativeTime date={article.publishedAt} />
                  </div>
                  <h3
                    className={cn(
                      "line-clamp-2 text-body-md transition-colors",
                      isRead ? "font-normal text-meta" : "font-semibold text-ink",
                    )}
                  >
                    {article.title}
                  </h3>
                  <p className="line-clamp-2 text-body-sm text-meta">{article.summary}</p>
                </button>
              );
            })}
          </div>
        )}
        {hasMore && !isLoadingMore && (
          <LoadMoreSentinel key={`mobile-sentinel-${articles.length}`} onVisible={loadMore} />
        )}
        {isLoadingMore && (
          <div className="flex justify-center py-md" aria-label="기사를 불러오는 중">
            <RotateCw className="size-5 animate-spin text-meta" />
          </div>
        )}
      </Container>

      {/* Desktop reading pane (>= lg) */}
      <div className="hidden flex-1 flex-col pt-[calc(var(--app-header-inset)+var(--spacing-xs))] pb-2xl lg:flex">
        <Container className="space-y-lg" size="md">
          {articles.length === 0 ? (
            <EmptyState
              description="아직 등록된 뉴스가 없어요. 새 소식이 등록되면 여기에 표시돼요"
              Icon={Newspaper}
            />
          ) : selectedArticle ? (
            <article className="flex flex-col gap-lg">
              <div className="flex flex-wrap items-center gap-xs text-caption text-meta">
                <span className="rounded-full bg-surface-soft px-2 py-0.5 font-medium text-meta">
                  {toDomain(selectedArticle.sourceUrl ?? selectedArticle.url)}
                </span>
                <span>·</span>
                <RelativeTime date={selectedArticle.publishedAt} />
                {selectedArticle.sourceUrl && (
                  <>
                    <span>·</span>
                    <a
                      className="inline-flex items-center gap-1 text-primary hover:underline"
                      href={selectedArticle.url}
                      rel="noopener noreferrer"
                      target="_blank"
                      onClick={handleExternalLinkClick}
                    >
                      긱뉴스 토론 바로가기
                      <ExternalLink className="size-3.5" strokeWidth={1.75} />
                    </a>
                  </>
                )}
              </div>

              <h1 className="text-display-xs leading-tight font-bold text-ink">
                {selectedArticle.title}
              </h1>

              <p className="text-body-md leading-relaxed whitespace-pre-line text-body">
                {selectedArticle.summary}
              </p>

              <div className="flex flex-wrap items-center gap-sm border-t border-hairline pt-md">
                {selectedArticle.sourceUrl ? (
                  <>
                    <a
                      className="inline-flex min-h-12 items-center justify-center gap-xs rounded-md bg-primary px-lg py-sm text-button-md font-medium text-on-primary transition-colors hover:bg-primary-hover focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 focus-visible:ring-offset-canvas active:bg-primary-pressed"
                      href={selectedArticle.sourceUrl}
                      rel="noopener noreferrer"
                      target="_blank"
                      onClick={handleExternalLinkClick}
                    >
                      원문 기사 읽기 (새 창)
                      <ExternalLink className="size-4" strokeWidth={1.75} />
                    </a>

                    <a
                      className="inline-flex min-h-12 items-center justify-center gap-xs rounded-md border border-hairline-strong bg-canvas px-lg py-sm text-button-md font-medium text-ink transition-colors hover:bg-surface-soft focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 focus-visible:ring-offset-canvas active:bg-surface-strong"
                      href={selectedArticle.url}
                      rel="noopener noreferrer"
                      target="_blank"
                      onClick={handleExternalLinkClick}
                    >
                      긱뉴스 토론 (새 창)
                      <ExternalLink className="size-4" strokeWidth={1.75} />
                    </a>
                  </>
                ) : (
                  <a
                    className="inline-flex min-h-12 items-center justify-center gap-xs rounded-md bg-primary px-lg py-sm text-button-md font-medium text-on-primary transition-colors hover:bg-primary-hover focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 focus-visible:ring-offset-canvas active:bg-primary-pressed"
                    href={selectedArticle.url}
                    rel="noopener noreferrer"
                    target="_blank"
                    onClick={handleExternalLinkClick}
                  >
                    긱뉴스 글 읽기 (새 창)
                    <ExternalLink className="size-4" strokeWidth={1.75} />
                  </a>
                )}
              </div>
            </article>
          ) : null}
        </Container>
      </div>

      {/* Mobile BottomSheet detail view */}
      <BottomSheet
        isOpen={isSheetOpen && sheetArticle !== null}
        header={{
          title: "개발자 뉴스",
        }}
        onClose={() => setOpenedArticleId(null)}
      >
        {sheetArticle && (
          <div className="flex flex-col gap-lg pb-md">
            <div className="flex flex-wrap items-center gap-xs text-caption text-meta">
              <span className="rounded-full bg-surface-soft px-2 py-0.5 font-medium text-meta">
                {toDomain(sheetArticle.sourceUrl ?? sheetArticle.url)}
              </span>
              <span>·</span>
              <RelativeTime date={sheetArticle.publishedAt} />
            </div>

            <h2 className="text-title-md leading-snug font-bold text-ink">{sheetArticle.title}</h2>

            <p className="text-body-md leading-relaxed whitespace-pre-line text-body">
              {sheetArticle.summary}
            </p>

            <div className="flex flex-col gap-sm border-t border-hairline pt-md">
              {sheetArticle.sourceUrl ? (
                <>
                  <a
                    className="inline-flex min-h-12 w-full items-center justify-center gap-xs rounded-md bg-primary px-md py-sm text-button-md font-medium text-on-primary transition-colors hover:bg-primary-hover focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 focus-visible:ring-offset-canvas active:bg-primary-pressed"
                    href={sheetArticle.sourceUrl}
                    rel="noopener noreferrer"
                    target="_blank"
                    onClick={handleExternalLinkClick}
                  >
                    원문 기사 읽기 (새 창)
                    <ExternalLink className="size-4" strokeWidth={1.75} />
                  </a>

                  <a
                    className="inline-flex min-h-12 w-full items-center justify-center gap-xs rounded-md border border-hairline-strong bg-canvas px-md py-sm text-button-md font-medium text-ink transition-colors hover:bg-surface-soft focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 focus-visible:ring-offset-canvas active:bg-surface-strong"
                    href={sheetArticle.url}
                    rel="noopener noreferrer"
                    target="_blank"
                    onClick={handleExternalLinkClick}
                  >
                    긱뉴스 토론 (새 창)
                    <ExternalLink className="size-4" strokeWidth={1.75} />
                  </a>
                </>
              ) : (
                <a
                  className="inline-flex min-h-12 w-full items-center justify-center gap-xs rounded-md bg-primary px-md py-sm text-button-md font-medium text-on-primary transition-colors hover:bg-primary-hover focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 focus-visible:ring-offset-canvas active:bg-primary-pressed"
                  href={sheetArticle.url}
                  rel="noopener noreferrer"
                  target="_blank"
                  onClick={handleExternalLinkClick}
                >
                  긱뉴스 글 읽기 (새 창)
                  <ExternalLink className="size-4" strokeWidth={1.75} />
                </a>
              )}
            </div>
          </div>
        )}
      </BottomSheet>
    </TwoPane>
  );
}
