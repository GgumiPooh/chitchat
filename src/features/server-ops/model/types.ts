import type { Nullable } from "@/shared/lib";

/** REQUIREMENTS.md § 12.4. One dump under `backups/` in R2. */
export type BackupSummary = {
  filename: string;
  sizeBytes: number;
  /** ISO 8601, from R2's own LastModified. */
  lastModified: string;
};

/** What a 백업 생성 run answers, retention's own deletions included. */
export type BackupRunResult = {
  filename: string;
  sizeBytes: number;
  deletedOldBackups: string[];
};

/** jandh-ops' orphan-sweep report, dry-run or not. `blocked` names the safety rule that withheld the delete. */
export type CleanupReport = {
  dryRun: boolean;
  scanned: number;
  keptRegistered: number;
  skippedTooNew: number;
  skippedTooOld: number;
  orphans: number;
  deleted: number;
  reclaimedBytes: number;
  minAge: string;
  maxAge: Nullable<string>;
  blocked: Nullable<string>;
};
