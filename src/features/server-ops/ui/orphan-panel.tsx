"use client";

import { cn, formatStorageSize, type Nullable } from "@/shared/lib";
import { Button, Modal } from "@/shared/ui";
import { useState } from "react";
import { sweepOrphans } from "../api/sweep-orphans";
import { describeOpsFailure } from "../model/ops-error";
import type { CleanupReport } from "../model/types";
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
      setResult(toResult(await sweepOrphans(dryRun)));
    } catch (error) {
      setResult({
        title: "정리 실패",
        description: describeOpsFailure(error, "자세한 이유는 푸시 알림으로 알려드려요"),
        lines: [],
      });
    } finally {
      setIsSweeping(false);
    }
  }
}

function toResult(report: CleanupReport): OpsResult {
  // WARN: Before the dry-run branch, as jandh-ops' own banner is. A blocked sweep deleted nothing for a reason that is not "there was nothing to delete".
  const title = report.blocked
    ? "정리 중단"
    : report.dryRun
      ? "정리 미리보기"
      : "고아 파일 정리 완료";

  return {
    title,
    description: report.blocked ? "안전장치가 삭제를 막았어요" : undefined,
    lines: [
      { label: "검사한 객체", value: `${report.scanned}개` },
      { label: "고아 파일", value: `${report.orphans}개` },
      // INFO: `deleted` stays 0 on a preview and on a blocked run, so it is only shown where it means something.
      ...(report.dryRun || report.blocked
        ? []
        : [{ label: "지운 객체", value: `${report.deleted}개` }]),
      {
        // WARN: `reclaimedBytes` is the orphans' own total, counted before the delete — it is what a run *could* reclaim, which is all a preview has.
        label: report.dryRun || report.blocked ? "확보 가능한 용량" : "확보한 용량",
        value: formatStorageSize(report.reclaimedBytes),
      },
      ...(report.blocked ? [{ label: "중단 사유", value: report.blocked }] : []),
    ],
  };
}
