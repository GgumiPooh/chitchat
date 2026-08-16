"use client";

import { cn, type Nullable } from "@/shared/lib";
import { Button, Modal } from "@/shared/ui";
import { useState } from "react";
import { sweepOrphans } from "../api/sweep-orphans";
import { describeOpsFailure } from "../model/ops-error";
import { OpsResultModal, type OpsResult } from "./ops-result-modal";

export type OrphanPanelProps = {
  className?: string;
};

/**
 * REQUIREMENTS.md § 12.4. The R2 sweep for objects no live `media` row can name.
 *
 * INFO: 미리보기 first and 정리 실행 behind a confirmation, because the sweep subtracts
 * the database from the bucket — a preview is the only thing that shows what a run
 * would take before it takes it.
 */
export function OrphanPanel({ className }: OrphanPanelProps) {
  const [result, setResult] = useState<Nullable<OpsResult>>(null);
  const [isConfirming, setIsConfirming] = useState(false);
  const [isSweeping, setIsSweeping] = useState(false);

  return (
    <section className={cn("flex flex-col", className)}>
      <h2 className="px-md pt-md pb-xs text-title-sm text-meta">고아 파일 정리</h2>
      <p className="px-md pb-sm text-body-sm text-meta">
        사진이나 파일이 지워진 뒤에도 저장소에 남은 객체를 찾아 지워요
      </p>
      <div className="flex gap-xs px-md">
        <Button
          className="flex-1"
          variant="secondary"
          disabled={isSweeping}
          haptic
          onClick={() => void sweep(true)}
        >
          미리보기
        </Button>
        <Button
          className="flex-1"
          variant="destructive"
          disabled={isSweeping}
          haptic
          onClick={() => setIsConfirming(true)}
        >
          정리 실행
        </Button>
      </div>
      <Modal
        isOpen={isConfirming}
        header={{
          title: "고아 파일을 지울까요?",
          description: "저장소에서 지운 객체는 되돌릴 수 없어요",
        }}
        onClose={() => setIsConfirming(false)}
      >
        <div className="flex gap-xs">
          <Button className="flex-1" variant="secondary" onClick={() => setIsConfirming(false)}>
            취소
          </Button>
          <Button
            className="flex-1"
            variant="destructive"
            disabled={isSweeping}
            haptic
            onClick={() => {
              setIsConfirming(false);
              void sweep(false);
            }}
          >
            정리
          </Button>
        </div>
      </Modal>
      <OpsResultModal result={result} onClose={() => setResult(null)} />
    </section>
  );

  async function sweep(dryRun: boolean) {
    setIsSweeping(true);

    try {
      await sweepOrphans(dryRun);

      // WARN: 요청, never a report. The dispatch answers once the run is QUEUED, and the sweep's own push carries the count it found.
      setResult({
        title: dryRun ? "미리보기를 요청했어요" : "정리를 요청했어요",
        description: "결과는 알림으로 알려드릴게요",
        lines: [],
      });
    } catch (error) {
      setResult({
        title: dryRun ? "미리보기를 요청하지 못했어요" : "정리를 요청하지 못했어요",
        description: describeOpsFailure(error),
        lines: [],
      });
    } finally {
      setIsSweeping(false);
    }
  }
}
