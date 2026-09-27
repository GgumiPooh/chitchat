"use client";

import type { TimeLetter } from "@/entities/time-letter";
import { PLAYGROUND_ROUTE } from "@/shared/config";
import { cn, formatDate } from "@/shared/lib";
import { useSnapshot } from "@/shared/snapshot";
import { AppHeader, Container, EmptyState, IconButton } from "@/shared/ui";
import { SnapshotEmpty, SnapshotStamp } from "@/widgets/offline-shell";
import { ChevronLeft, Clock, Lock, Mail, MailOpen } from "lucide-react";
import { useRouter } from "next/navigation";
import { MirrorLoading } from "./mirror-loading";

export type MirrorTimeLettersProps = {
  className?: string;
  onBack?: () => void;
};

export function MirrorTimeLetters({ className, onBack }: MirrorTimeLettersProps) {
  const router = useRouter();
  const snapshot = useSnapshot<TimeLetter[]>("time-letters");

  const handleBack = onBack ?? (() => router.push(PLAYGROUND_ROUTE));

  return (
    <div className={cn("flex min-h-dvh flex-col", className)}>
      <AppHeader
        title="타임머신 편지 (오프라인)"
        leading={
          <IconButton
            haptic
            Icon={ChevronLeft}
            variant="floating"
            aria-label="뒤로"
            onClick={handleBack}
          />
        }
      />

      <Container
        className="space-y-md py-md pt-[calc(var(--app-header-inset)+var(--spacing-md))] pb-2xl"
        size="md"
      >
        {snapshot.status === "loading" && <MirrorLoading variant="months" />}

        {snapshot.status === "miss" && <SnapshotEmpty Icon={Mail} subject="타임머신 편지" />}

        {snapshot.status === "hit" && (
          <>
            <SnapshotStamp savedAt={snapshot.savedAt} />

            {snapshot.payload.length === 0 ? (
              <EmptyState description="보관된 타임머신 편지가 없어요." Icon={Mail} />
            ) : (
              <div className="flex flex-col gap-sm">
                {snapshot.payload.map((letter) => {
                  const isScheduled = letter.status === "scheduled";
                  const dateStr = formatDate(
                    isScheduled ? letter.scheduledAt : (letter.sentAt ?? letter.scheduledAt),
                  );

                  return (
                    <div
                      key={letter.id}
                      className="bg-surface flex flex-col gap-xs rounded-xl border border-hairline p-md text-left"
                    >
                      <div className="flex items-center justify-between gap-xs text-caption text-meta">
                        <span className="inline-flex items-center gap-1">
                          {isScheduled ? (
                            <Lock className="size-3 text-primary" />
                          ) : (
                            <MailOpen className="size-3 text-meta" />
                          )}
                          <span>{isScheduled ? "봉인됨" : "전송됨"}</span>
                        </span>
                        <span className="inline-flex items-center gap-1">
                          <Clock className="size-3" />
                          <span>{dateStr}</span>
                        </span>
                      </div>

                      <h3 className="line-clamp-1 text-body-md font-semibold text-ink">
                        {letter.title ||
                          (letter.content ? letter.content.slice(0, 30) : "비밀 편지")}
                      </h3>

                      {letter.content && (
                        <p className="line-clamp-2 text-body-sm leading-relaxed text-meta">
                          {letter.content}
                        </p>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </>
        )}
      </Container>
    </div>
  );
}
