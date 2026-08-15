"use client";

import type { Nullable } from "@/shared/lib";
import { Button, Modal } from "@/shared/ui";

export type OpsResultLine = { label: string; value: string };

/** REQUIREMENTS.md § 12.4. What jandh-ops answered, read back on the spot — the push it also sends can arrive on another device. */
export type OpsResult = {
  title: string;
  description?: string;
  lines: OpsResultLine[];
};

export type OpsResultModalProps = {
  className?: string;
  result: Nullable<OpsResult>;
  onClose: () => void;
};

export function OpsResultModal({ className, result, onClose }: OpsResultModalProps) {
  return (
    <Modal
      className={className}
      isOpen={result !== null}
      header={{ title: result?.title ?? "", description: result?.description }}
      onClose={onClose}
    >
      <div className="flex flex-col gap-sm">
        {result !== null && result.lines.length > 0 && (
          <dl className="flex flex-col gap-2xs rounded-md bg-surface-soft p-md">
            {result.lines.map((line) => (
              <div key={line.label} className="flex items-baseline justify-between gap-sm">
                <dt className="shrink-0 text-body-sm text-meta">{line.label}</dt>
                <dd className="min-w-0 text-right text-body-sm break-all text-ink">{line.value}</dd>
              </div>
            ))}
          </dl>
        )}
        <Button haptic onClick={onClose}>
          확인
        </Button>
      </div>
    </Modal>
  );
}
