"use client";

import { cn } from "@/shared/lib";
import { Button, EmptyState } from "@/shared/ui";
import { josa } from "es-hangul";
import type { ComponentProps, FC } from "react";

export type SnapshotEmptyProps = {
  className?: string;
  Icon: FC<ComponentProps<"svg">>;
  /** 사진 · 파일 · 음성 · 일정 · 메시지 — what was never received, named in the sentence below. */
  subject: string;
};

/**
 * What a mirrored screen shows when nothing was ever stored for it
 * (REQUIREMENTS.md § 16.).
 *
 * WARN: AGENTS.md § 0.4. `josa`, not a literal — 사진 and 메시지 both reach this
 * sentence and take different particles.
 */
export function SnapshotEmpty({ className, Icon, subject }: SnapshotEmptyProps) {
  return (
    <div className={cn("flex flex-1 items-center justify-center", className)}>
      <EmptyState
        Icon={Icon}
        description={`${josa(subject, "을/를")} 아직 받아두지 못했어요. 인터넷에 연결되면 불러와요`}
        // WARN: A reload, never a link — the address bar already holds the screen the reader asked for, and a link would send them somewhere else to find out the connection is back.
        action={
          <Button variant="secondary" onClick={() => window.location.reload()}>
            다시 시도
          </Button>
        }
      />
    </div>
  );
}
