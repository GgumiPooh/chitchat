"use client";

import { GEEKNEWS_ROUTE, TIME_LETTERS_ROUTE, VOCA_ROUTE } from "@/shared/config";
import { cn } from "@/shared/lib";
import { AppHeader, Container, Link } from "@/shared/ui";
import { ChevronRight, GraduationCap, Mail, Newspaper } from "lucide-react";

export type PlaygroundPageProps = {
  className?: string;
};

export function PlaygroundPage({ className }: PlaygroundPageProps) {
  return (
    <div className={cn("flex flex-1 flex-col", className)}>
      <AppHeader title="놀이터" />
      <Container
        className="space-y-md py-md pt-[calc(var(--app-header-inset)+var(--spacing-md))]"
        size="md"
      >
        <div className="grid grid-cols-1 gap-md md:grid-cols-2">
          <Link
            className="group bg-surface flex items-center justify-between gap-md rounded-2xl border border-hairline p-lg transition-colors outline-none hover:border-hairline-strong hover:bg-surface-soft focus-visible:ring-2 focus-visible:ring-primary"
            href={GEEKNEWS_ROUTE}
            haptic
          >
            <div className="flex min-w-0 items-center gap-md">
              <div className="flex size-12 shrink-0 items-center justify-center rounded-xl bg-primary-tint text-primary">
                <Newspaper className="size-6" strokeWidth={1.75} />
              </div>
              <div className="flex min-w-0 flex-col gap-0.5">
                <span className="truncate text-title-sm font-semibold text-ink">개발자 뉴스</span>
                <p className="line-clamp-2 text-body-sm text-meta">
                  GeekNews의 실시간 기술 트렌드와 스타트업 소식
                </p>
              </div>
            </div>
            <ChevronRight
              className="size-5 shrink-0 text-meta transition-transform group-hover:translate-x-0.5"
              strokeWidth={1.75}
            />
          </Link>

          <Link
            className="group bg-surface flex items-center justify-between gap-md rounded-2xl border border-hairline p-lg transition-colors outline-none hover:border-hairline-strong hover:bg-surface-soft focus-visible:ring-2 focus-visible:ring-primary"
            href={VOCA_ROUTE}
            haptic
          >
            <div className="flex min-w-0 items-center gap-md">
              <div className="flex size-12 shrink-0 items-center justify-center rounded-xl bg-primary-tint text-primary">
                <GraduationCap className="size-6" strokeWidth={1.75} />
              </div>
              <div className="flex min-w-0 flex-col gap-0.5">
                <span className="truncate text-title-sm font-semibold text-ink">영단어</span>
                <p className="line-clamp-2 text-body-sm text-meta">
                  FSRS 간격 반복 플래시카드로 완벽하게 암기하는 영단어장
                </p>
              </div>
            </div>
            <ChevronRight
              className="size-5 shrink-0 text-meta transition-transform group-hover:translate-x-0.5"
              strokeWidth={1.75}
            />
          </Link>

          <Link
            className="group bg-surface flex items-center justify-between gap-md rounded-2xl border border-hairline p-lg transition-colors outline-none hover:border-hairline-strong hover:bg-surface-soft focus-visible:ring-2 focus-visible:ring-primary"
            href={TIME_LETTERS_ROUTE}
            haptic
          >
            <div className="flex min-w-0 items-center gap-md">
              <div className="flex size-12 shrink-0 items-center justify-center rounded-xl bg-primary-tint text-primary">
                <Mail className="size-6" strokeWidth={1.75} />
              </div>
              <div className="flex min-w-0 flex-col gap-0.5">
                <span className="truncate text-title-sm font-semibold text-ink">타임머신 편지</span>
                <p className="line-clamp-2 text-body-sm text-meta">
                  지정한 날짜에 채팅방으로 도착하는 타임캡슐 편지
                </p>
              </div>
            </div>
            <ChevronRight
              className="size-5 shrink-0 text-meta transition-transform group-hover:translate-x-0.5"
              strokeWidth={1.75}
            />
          </Link>
        </div>
      </Container>
    </div>
  );
}
