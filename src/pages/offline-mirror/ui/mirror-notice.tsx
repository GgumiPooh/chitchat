"use client";

import { cn } from "@/shared/lib";
import { OFFLINE_NOTICE_TEXT } from "@/shared/offline-ux";
import { Button, Container } from "@/shared/ui";
import { WifiOff } from "lucide-react";

export type MirrorNoticeProps = {
  className?: string;
};

/**
 * What the mirror shows for a screen it holds nothing for — the same two lines
 * `OfflinePage` shows, so the app says this in one voice (REQUIREMENTS.md § 16.).
 */
export function MirrorNotice({ className }: MirrorNoticeProps) {
  return (
    <Container className={cn("flex flex-1 flex-col justify-between py-2xl", className)} size="sm">
      <div className="flex flex-1 flex-col items-center justify-center gap-sm text-center">
        <WifiOff className="size-8 text-meta-soft" strokeWidth={1.5} />
        <h1 className="text-display-md text-ink">{OFFLINE_NOTICE_TEXT}</h1>
        <p className="text-body-md text-meta">연결이 돌아오면 다시 시도해 주세요</p>
      </div>
      {/* WARN: A reload rather than `OfflinePage`'s link home — the address bar already holds the screen the reader asked for, so this retries that one instead of moving them off it. */}
      <Button variant="secondary" onClick={() => window.location.reload()}>
        다시 시도
      </Button>
    </Container>
  );
}
