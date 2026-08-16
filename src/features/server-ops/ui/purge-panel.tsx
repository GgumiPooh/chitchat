"use client";

import { cn, type Nullable } from "@/shared/lib";
import { Button } from "@/shared/ui";
import { useState } from "react";
import { purgeDeleted } from "../api/purge-deleted";
import { describeOpsFailure } from "../model/ops-error";
import { OpsResultModal, type OpsResult } from "./ops-result-modal";

export type PurgePanelProps = {
  className?: string;
};

/**
 * REQUIREMENTS.md § 9., § 12.4. Brings the ten-minute reclaim forward.
 *
 * INFO: A preview beside it, and no confirmation — the two are different questions. 미리보기
 * counts what a run would take, which is worth knowing before spending one and is the same
 * courtesy the sweep offers. A confirmation would be ceremony: every row here is one the
 * database has ALREADY marked deleted, the schedule would have taken it within minutes, and
 * asking twice about a safe action teaches people to dismiss the dialog that guards the
 * unsafe one below.
 *
 * INFO: `secondary` on both, not `destructive` — the colour on this screen means "this
 * removes something you may want", and these bytes are already unreachable.
 */
export function PurgePanel({ className }: PurgePanelProps) {
  const [result, setResult] = useState<Nullable<OpsResult>>(null);
  const [isPurging, setIsPurging] = useState(false);

  return (
    <section className={cn("flex flex-col", className)}>
      <h2 className="px-md pt-md pb-xs text-title-sm text-meta">삭제 파일 회수</h2>
      <p className="px-md pb-sm text-body-sm text-meta">
        지운 사진과 파일이 차지하던 공간을 되찾아요
      </p>
      <div className="flex gap-xs px-md">
        <Button
          className="flex-1"
          variant="secondary"
          disabled={isPurging}
          haptic
          onClick={() => void purge(true)}
        >
          미리보기
        </Button>
        <Button
          className="flex-1"
          variant="secondary"
          disabled={isPurging}
          haptic
          onClick={() => void purge(false)}
        >
          회수하기
        </Button>
      </div>
      <OpsResultModal result={result} onClose={() => setResult(null)} />
    </section>
  );

  async function purge(dryRun: boolean) {
    setIsPurging(true);

    try {
      await purgeDeleted(dryRun);

      // WARN: 요청, never a count. The dispatch answers once the run is QUEUED, and a hand-started reclaim is the one the workflow turns its push on for — so the number arrives as a banner.
      setResult({
        title: dryRun ? "점검을 요청했어요" : "회수를 요청했어요",
        description: "결과는 알림으로 알려드릴게요",
        lines: [],
      });
    } catch (error) {
      setResult({
        title: dryRun ? "점검을 요청하지 못했어요" : "회수를 요청하지 못했어요",
        description: describeOpsFailure(error),
        lines: [],
      });
    } finally {
      setIsPurging(false);
    }
  }
}
