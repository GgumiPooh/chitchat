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
 * INFO: One button, no preview and no confirmation — the two things the sweep beside it
 * needs and this does not. That pass subtracts the database from the bucket and can be
 * wrong about what it finds; this one acts only on rows the database has ALREADY marked
 * deleted, so there is nothing to decide and the schedule would have done the same thing
 * within minutes. A confirmation here would be ceremony over a no-op, and asking twice
 * about a safe action teaches people to dismiss the dialog that guards the unsafe one.
 *
 * INFO: `secondary`, not `destructive`, for the same reason — the colour on this screen
 * means "this removes something you may want", and these bytes are already unreachable.
 */
export function PurgePanel({ className }: PurgePanelProps) {
  const [result, setResult] = useState<Nullable<OpsResult>>(null);
  const [isPurging, setIsPurging] = useState(false);

  return (
    <section className={cn("flex flex-col", className)}>
      <h2 className="px-md pt-md pb-xs text-title-sm text-meta">삭제 파일 회수</h2>
      <p className="px-md pb-sm text-body-sm text-meta">
        지운 사진과 파일이 차지하던 공간을 되찾아요. 10분마다 저절로 도니까 급할 때만 눌러도 돼요
      </p>
      <div className="px-md">
        <Button variant="secondary" disabled={isPurging} haptic onClick={() => void purge()}>
          {isPurging ? "요청하는 중…" : "지금 회수하기"}
        </Button>
      </div>
      <OpsResultModal result={result} onClose={() => setResult(null)} />
    </section>
  );

  async function purge() {
    setIsPurging(true);

    try {
      await purgeDeleted();

      // WARN: 요청, never a count. The dispatch answers once the run is QUEUED, and a hand-started reclaim is the one the workflow turns its push on for — so the number arrives as a banner.
      setResult({
        title: "회수를 요청했어요",
        description: "결과는 알림으로 알려드릴게요",
        lines: [],
      });
    } catch (error) {
      setResult({
        title: "회수를 요청하지 못했어요",
        description: describeOpsFailure(error),
        lines: [],
      });
    } finally {
      setIsPurging(false);
    }
  }
}
