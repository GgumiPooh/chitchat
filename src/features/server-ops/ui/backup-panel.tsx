"use client";

import { cn, formatDate, formatStorageSize, formatTime, type Nullable } from "@/shared/lib";
import { Button, EmptyState, Modal, SettingsRow, SettingsRowSkeleton, toast } from "@/shared/ui";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { DatabaseBackup } from "lucide-react";
import { useState } from "react";
import { deleteBackup, fetchBackups, runBackup } from "../api/backups";
import { describeOpsFailure } from "../model/ops-error";
import { OpsResultModal, type OpsResult } from "./ops-result-modal";

export type BackupPanelProps = {
  className?: string;
  /**
   * Whether jandh-ops is reachable, which is what 백업 생성 needs and nothing else here does.
   *
   * INFO: REQUIREMENTS.md § 12.4. `pg_dump` is a binary this app does not carry, so a run
   * has to be asked for. The list and the deletion read R2 directly and stay either way —
   * a deployment without that service can still see its dumps and drop one.
   */
  isOpsAvailable: boolean;
};

const BACKUPS_QUERY_KEY = ["ops", "backups"];

// INFO: The retention limit jandh-ops keeps, so the skeleton is never taller than the list it stands in for.
const SKELETON_KEYS = ["a", "b", "c"];

/**
 * REQUIREMENTS.md § 12.4. The stored dumps, newest first, with 백업 생성 above them and
 * a per-row deletion.
 *
 * INFO: A run takes as long as `pg_dump` takes, so the button stays busy rather than
 * optimistic, and the modal is the whole report — jandh-ops' push reaches one account
 * of the two, which need not be the one that pressed the button.
 */
export function BackupPanel({ className, isOpsAvailable }: BackupPanelProps) {
  const queryClient = useQueryClient();
  const backups = useQuery({ queryKey: BACKUPS_QUERY_KEY, queryFn: fetchBackups });
  const [result, setResult] = useState<Nullable<OpsResult>>(null);
  const [pendingFilename, setPendingFilename] = useState<Nullable<string>>(null);
  const [isRunning, setIsRunning] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);

  return (
    <section className={cn("flex flex-col", className)}>
      <h2 className="px-md pt-md pb-xs text-title-sm text-meta">백업</h2>
      {isOpsAvailable && (
        <div className="px-md pb-sm">
          <Button disabled={isRunning} haptic onClick={() => void createBackup()}>
            {isRunning ? "백업하는 중…" : "백업 생성"}
          </Button>
        </div>
      )}
      {renderList()}
      <Modal
        isOpen={pendingFilename !== null}
        header={{
          title: "이 백업을 삭제할까요?",
          description: `${pendingFilename ?? ""} · 삭제하면 되돌릴 수 없어요`,
        }}
        onClose={() => setPendingFilename(null)}
      >
        {/* WARN: `flex-1` on both — `Button` is `w-full shrink-0`, so a bare pair in a row would push the second one off the modal. */}
        <div className="flex gap-xs">
          <Button className="flex-1" variant="secondary" onClick={() => setPendingFilename(null)}>
            취소
          </Button>
          <Button
            className="flex-1"
            variant="destructive"
            disabled={isDeleting}
            haptic
            onClick={() => void removeBackup()}
          >
            삭제
          </Button>
        </div>
      </Modal>
      <OpsResultModal result={result} onClose={() => setResult(null)} />
    </section>
  );

  function renderList() {
    if (backups.isPending) {
      return SKELETON_KEYS.map((key) => <SettingsRowSkeleton key={key} />);
    }

    if (backups.isError) {
      return (
        <EmptyState
          className="mx-md"
          Icon={DatabaseBackup}
          description="백업 목록을 불러오지 못했어요"
          action={
            <Button className="w-auto" variant="secondary" onClick={() => void backups.refetch()}>
              다시 시도
            </Button>
          }
        />
      );
    }

    if (backups.data.length === 0) {
      return (
        <EmptyState className="mx-md" Icon={DatabaseBackup} description="아직 백업이 없어요" />
      );
    }

    return backups.data.map((backup) => (
      <SettingsRow
        key={backup.filename}
        label={`${formatDate(backup.lastModified)} ${formatTime(backup.lastModified)}`}
        description={formatStorageSize(backup.sizeBytes)}
        Icon={DatabaseBackup}
        trailing={
          <Button
            className="w-auto"
            buttonClassName="min-h-9 px-sm text-button-sm"
            variant="secondary"
            haptic
            onClick={() => setPendingFilename(backup.filename)}
          >
            삭제
          </Button>
        }
      />
    ));
  }

  async function createBackup() {
    setIsRunning(true);

    try {
      const run = await runBackup();

      setResult({
        title: "백업 완료",
        lines: [
          { label: "파일", value: run.filename },
          { label: "크기", value: formatStorageSize(run.sizeBytes) },
          { label: "정리된 오래된 백업", value: `${run.deletedOldBackups.length}개` },
        ],
      });
    } catch (error) {
      setResult({
        title: "백업 실패",
        description: describeOpsFailure(error),
        lines: [],
      });
    } finally {
      setIsRunning(false);
      // WARN: On the failed path too. A cut connection leaves a dump still streaming, so the list has to be re-read rather than assumed unchanged.
      await queryClient.invalidateQueries({ queryKey: BACKUPS_QUERY_KEY });
    }
  }

  async function removeBackup() {
    if (pendingFilename === null) {
      return;
    }

    setIsDeleting(true);

    try {
      await deleteBackup(pendingFilename);
      setPendingFilename(null);
    } catch {
      toast.error("삭제하지 못했어요");
    } finally {
      setIsDeleting(false);
      // WARN: On the failed path too — a 404 means retention already dropped the dump, and the row it was tapped on has to leave rather than stay for another retry.
      await queryClient.invalidateQueries({ queryKey: BACKUPS_QUERY_KEY });
    }
  }
}
